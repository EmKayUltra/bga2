using System.Security.Cryptography;
using System.Text;
using Bga2.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bga2.Server.Services;

// ─── Request / Response records ───────────────────────────────────────────────

public record CreateTableRequest(
    string GameId,
    string DisplayName,
    int MinPlayers,
    int MaxPlayers,
    bool IsPrivate,
    string? Password
);

public record TableListItem(
    Guid Id,
    string GameId,
    string DisplayName,
    string HostName,
    int PlayerCount,
    int MaxPlayers,
    DateTime CreatedAt
);

public record TablePlayerInfo(
    string UserId,
    string DisplayName,
    int SeatIndex,
    bool IsReady
);

public record TableDetail(
    Guid Id,
    string GameId,
    string DisplayName,
    bool IsPrivate,
    TableStatus Status,
    Guid? SessionId,
    int MinPlayers,
    int MaxPlayers,
    string HostUserId,
    List<TablePlayerInfo> Players
);

public record JoinResult(bool Success, string? Error);

public record StartGameResult(bool Success, Guid? SessionId, string? Error);

public record QuickPlayResult(bool Joined, bool Created, Guid TableId);

// ─── LobbyService ─────────────────────────────────────────────────────────────

/// <summary>
/// Lobby business logic: create, join, leave, start, list tables, and Quick Play.
/// All writes are synchronous with optimistic DB operations via EF Core.
/// </summary>
public class LobbyService
{
    private readonly GameDbContext _db;
    private readonly GameService _gameService;
    private readonly ILogger<LobbyService> _logger;

    public LobbyService(GameDbContext db, GameService gameService, ILogger<LobbyService> logger)
    {
        _db = db;
        _gameService = gameService;
        _logger = logger;
    }

    /// <summary>
    /// Create a new table. Host is automatically added as seat 0 (ready).
    /// </summary>
    public async Task<GameTable> CreateTable(string userId, string displayName, CreateTableRequest req)
    {
        var table = new GameTable
        {
            Id = Guid.NewGuid(),
            GameId = req.GameId,
            HostUserId = userId,
            DisplayName = req.DisplayName,
            MinPlayers = req.MinPlayers,
            MaxPlayers = req.MaxPlayers,
            IsPrivate = req.IsPrivate,
            PasswordHash = req.Password != null ? HashPassword(req.Password) : null,
            Status = TableStatus.Waiting,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.GameTables.Add(table);

        // Host auto-joins as seat 0, ready
        var hostPlayer = new TablePlayer
        {
            Id = Guid.NewGuid(),
            TableId = table.Id,
            UserId = userId,
            DisplayName = displayName,
            SeatIndex = 0,
            IsReady = true,
            JoinedAt = DateTime.UtcNow,
        };
        _db.TablePlayers.Add(hostPlayer);

        await _db.SaveChangesAsync();

        _logger.LogInformation("Created table {TableId} '{DisplayName}' by user {UserId}", table.Id, table.DisplayName, userId);
        return table;
    }

    /// <summary>
    /// List all public Waiting tables, ordered by most recently created.
    /// Private tables are excluded — they are join-by-link/invite only.
    /// </summary>
    public async Task<List<TableListItem>> ListTables()
    {
        var tables = await _db.GameTables
            .Where(t => t.Status == TableStatus.Waiting && !t.IsPrivate)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        var tableIds = tables.Select(t => t.Id).ToList();

        // Load all players for these tables in one query
        var playersByTable = await _db.TablePlayers
            .Where(p => tableIds.Contains(p.TableId))
            .GroupBy(p => p.TableId)
            .ToDictionaryAsync(g => g.Key, g => g.ToList());

        // Load host display names from seat 0 players
        return tables.Select(t =>
        {
            var players = playersByTable.TryGetValue(t.Id, out var p) ? p : [];
            var host = players.FirstOrDefault(p => p.UserId == t.HostUserId);
            return new TableListItem(
                Id: t.Id,
                GameId: t.GameId,
                DisplayName: t.DisplayName,
                HostName: host?.DisplayName ?? "Unknown",
                PlayerCount: players.Count,
                MaxPlayers: t.MaxPlayers,
                CreatedAt: t.CreatedAt
            );
        }).ToList();
    }

    /// <summary>
    /// Get full table detail including all players. Returns null if not found.
    /// </summary>
    public async Task<TableDetail?> GetTable(Guid tableId)
    {
        var table = await _db.GameTables.FindAsync(tableId);
        if (table == null) return null;

        var players = await _db.TablePlayers
            .Where(p => p.TableId == tableId)
            .OrderBy(p => p.SeatIndex)
            .ToListAsync();

        return new TableDetail(
            Id: table.Id,
            GameId: table.GameId,
            DisplayName: table.DisplayName,
            IsPrivate: table.IsPrivate,
            Status: table.Status,
            SessionId: table.SessionId,
            MinPlayers: table.MinPlayers,
            MaxPlayers: table.MaxPlayers,
            HostUserId: table.HostUserId,
            Players: players.Select(p => new TablePlayerInfo(p.UserId, p.DisplayName, p.SeatIndex, p.IsReady)).ToList()
        );
    }

    /// <summary>
    /// Join a table. Validates existence, status, capacity, duplicate join, and password if private.
    /// </summary>
    public async Task<JoinResult> JoinTable(Guid tableId, string userId, string displayName, string? password)
    {
        var table = await _db.GameTables.FindAsync(tableId);
        if (table == null)
            return new JoinResult(false, "Table not found");

        if (table.Status != TableStatus.Waiting)
            return new JoinResult(false, "Table is not accepting players");

        // Check password for private tables
        if (table.IsPrivate && table.PasswordHash != null)
        {
            if (password == null || HashPassword(password) != table.PasswordHash)
                return new JoinResult(false, "Invalid password");
        }

        // Already joined?
        var existing = await _db.TablePlayers
            .FirstOrDefaultAsync(p => p.TableId == tableId && p.UserId == userId);
        if (existing != null)
            return new JoinResult(true, null); // Already in — idempotent

        // Check capacity
        var currentCount = await _db.TablePlayers.CountAsync(p => p.TableId == tableId);
        if (currentCount >= table.MaxPlayers)
            return new JoinResult(false, "Table is full");

        var player = new TablePlayer
        {
            Id = Guid.NewGuid(),
            TableId = tableId,
            UserId = userId,
            DisplayName = displayName,
            SeatIndex = currentCount, // Next available seat
            IsReady = false,
            JoinedAt = DateTime.UtcNow,
        };

        _db.TablePlayers.Add(player);
        await _db.SaveChangesAsync();

        _logger.LogInformation("User {UserId} joined table {TableId}", userId, tableId);
        return new JoinResult(true, null);
    }

    /// <summary>
    /// Leave a table. If host leaves, transfer host to next player or delete empty table.
    /// </summary>
    public async Task<bool> LeaveTable(Guid tableId, string userId)
    {
        var table = await _db.GameTables.FindAsync(tableId);
        if (table == null) return false;

        var player = await _db.TablePlayers
            .FirstOrDefaultAsync(p => p.TableId == tableId && p.UserId == userId);
        if (player == null) return false;

        _db.TablePlayers.Remove(player);

        // Check remaining players after removal
        var remaining = await _db.TablePlayers
            .Where(p => p.TableId == tableId && p.UserId != userId)
            .OrderBy(p => p.SeatIndex)
            .ToListAsync();

        if (remaining.Count == 0)
        {
            // No one left — delete the table
            _db.GameTables.Remove(table);
        }
        else if (table.HostUserId == userId)
        {
            // Transfer host to the next remaining player
            table.HostUserId = remaining[0].UserId;
            table.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        _logger.LogInformation("User {UserId} left table {TableId}", userId, tableId);
        return true;
    }

    /// <summary>
    /// Start the game. Only the host can start; requires >= minPlayers joined.
    /// Creates a GameSession via GameService and updates table status.
    /// </summary>
    public async Task<StartGameResult> StartGame(Guid tableId, string userId)
    {
        var table = await _db.GameTables.FindAsync(tableId);
        if (table == null)
            return new StartGameResult(false, null, "Table not found");

        if (table.HostUserId != userId)
            return new StartGameResult(false, null, "Only the host can start the game");

        if (table.Status != TableStatus.Waiting)
            return new StartGameResult(false, null, "Game has already started");

        var players = await _db.TablePlayers
            .Where(p => p.TableId == tableId)
            .OrderBy(p => p.SeatIndex)
            .ToListAsync();

        if (players.Count < table.MinPlayers)
            return new StartGameResult(false, null, $"Need at least {table.MinPlayers} players to start");

        // Create the game session via GameService
        // Pass real Better Auth user IDs so match results are recorded against actual user profiles.
        var playerNames = players.Select(p => p.DisplayName).ToArray();
        var userIds = players.Select(p => p.UserId).ToArray();
        var gameResponse = await _gameService.CreateGame(table.GameId, playerNames, userIds);

        // Update table to Playing state with the new session ID
        table.Status = TableStatus.Playing;
        table.SessionId = gameResponse.SessionId;
        table.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Table {TableId} started game session {SessionId} with {PlayerCount} players",
            tableId, gameResponse.SessionId, players.Count);

        return new StartGameResult(true, gameResponse.SessionId, null);
    }

    /// <summary>
    /// Quick Play: find first available public Waiting table for gameId, or create one.
    /// </summary>
    public async Task<QuickPlayResult> QuickPlay(string userId, string displayName, string gameId)
    {
        // Find the first available public table with open seats
        var tables = await _db.GameTables
            .Where(t => t.GameId == gameId && t.Status == TableStatus.Waiting && !t.IsPrivate)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync();

        foreach (var table in tables)
        {
            var count = await _db.TablePlayers.CountAsync(p => p.TableId == table.Id);
            var alreadyJoined = await _db.TablePlayers.AnyAsync(p => p.TableId == table.Id && p.UserId == userId);

            if (alreadyJoined)
                return new QuickPlayResult(Joined: true, Created: false, TableId: table.Id);

            if (count < table.MaxPlayers)
            {
                var joinResult = await JoinTable(table.Id, userId, displayName, null);
                if (joinResult.Success)
                {
                    _logger.LogInformation("Quick Play: user {UserId} joined existing table {TableId}", userId, table.Id);
                    return new QuickPlayResult(Joined: true, Created: false, TableId: table.Id);
                }
            }
        }

        // No available table — create a new public one
        var req = new CreateTableRequest(
            GameId: gameId,
            DisplayName: $"{displayName}'s Table",
            MinPlayers: 2,
            MaxPlayers: 4,
            IsPrivate: false,
            Password: null
        );
        var newTable = await CreateTable(userId, displayName, req);

        _logger.LogInformation("Quick Play: user {UserId} created new table {TableId}", userId, newTable.Id);
        return new QuickPlayResult(Joined: false, Created: true, TableId: newTable.Id);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Simple SHA-256 hash for table passwords.
    /// Not stored with user credentials — just guards table entry.
    /// </summary>
    private static string HashPassword(string password)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
