using Bga2.Server.Data;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bga2.Server.Services;

/// <summary>
/// Hangfire background service for deadline enforcement in async games.
/// ProcessExpiredDeadlines runs every 5 minutes via recurring job registered in Program.cs.
///
/// Expired turn logic:
///   1. Find all async Playing tables with TurnDeadline in the past.
///   2. Increment ConsecutiveSkipsCurrentPlayer.
///   3. If >= SkipThreshold and SkipThreshold > 0: forfeit — set Status=Finished.
///   4. Otherwise: advance turn — update currentPlayerIndex in game state, set new TurnDeadline.
///   5. Enqueue NotifyYourTurn for the new current player.
/// </summary>
public class DeadlineService
{
    private readonly GameDbContext _db;
    private readonly ILogger<DeadlineService> _logger;

    public DeadlineService(GameDbContext db, ILogger<DeadlineService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Hangfire recurring job — fires every 5 minutes.
    /// Processes all async game tables with expired TurnDeadline.
    /// Decorated with DisableConcurrentExecution to prevent overlapping runs.
    /// </summary>
    [DisableConcurrentExecution(timeoutInSeconds: 60)]
    public async Task ProcessExpiredDeadlines()
    {
        var now = DateTime.UtcNow;

        var expiredTables = await _db.GameTables
            .Where(t =>
                t.IsAsync &&
                !t.IsPaused &&
                t.TurnDeadline <= now &&
                t.Status == TableStatus.Playing)
            .ToListAsync();

        if (expiredTables.Count == 0)
        {
            _logger.LogDebug("DeadlineService: no expired deadlines at {Now}", now);
            return;
        }

        _logger.LogInformation("DeadlineService: processing {Count} expired deadline(s) at {Now}", expiredTables.Count, now);

        foreach (var table in expiredTables)
        {
            await ProcessExpiredTable(table);
        }
    }

    private async Task ProcessExpiredTable(GameTable table)
    {
        try
        {
            table.ConsecutiveSkipsCurrentPlayer++;

            // ── Forfeit check ─────────────────────────────────────────────────
            if (table.SkipThreshold > 0 && table.ConsecutiveSkipsCurrentPlayer >= table.SkipThreshold)
            {
                _logger.LogInformation(
                    "Table {TableId} session {SessionId}: player reached skip threshold ({Skips}/{Threshold}) — forfeiting",
                    table.Id, table.SessionId, table.ConsecutiveSkipsCurrentPlayer, table.SkipThreshold);

                table.Status = TableStatus.Finished;
                table.TurnDeadline = null;
                await _db.SaveChangesAsync();
                return;
            }

            // ── Advance turn ──────────────────────────────────────────────────
            if (table.SessionId == null)
            {
                _logger.LogWarning("Table {TableId} has no SessionId — cannot advance turn", table.Id);
                return;
            }

            var session = await _db.GameSessions.FindAsync(table.SessionId.Value);
            if (session == null)
            {
                _logger.LogWarning("Session {SessionId} not found for table {TableId}", table.SessionId, table.Id);
                return;
            }

            // Parse currentPlayerIndex and playerCount from state JSON
            var (currentPlayerIndex, playerCount) = ExtractPlayerInfo(session.State);
            var nextPlayerIndex = (currentPlayerIndex + 1) % playerCount;

            // Update state to advance to next player
            var newStateJson = UpdateCurrentPlayerIndex(session.State, nextPlayerIndex);
            if (newStateJson == null)
            {
                _logger.LogWarning("Failed to update state for session {SessionId} — skipping", session.Id);
                return;
            }

            session.State = newStateJson;
            session.Version++;
            session.UpdatedAt = DateTime.UtcNow;

            // Update deadline for the new current player
            var timerHours = table.TimerMode switch { "fast" => 12, "normal" => 24, "slow" => 72, _ => 24 };
            table.TurnDeadline = DateTime.UtcNow.AddHours(timerHours);

            // Reset skip counter — new player starts fresh
            table.ConsecutiveSkipsCurrentPlayer = 0;

            await _db.SaveChangesAsync();

            // Find the next player's userId from the game state
            var nextUserId = ExtractUserIdForPlayerIndex(newStateJson, nextPlayerIndex);
            if (!string.IsNullOrEmpty(nextUserId))
            {
                // Fire-and-forget: notify next player it's their turn
                BackgroundJob.Enqueue<NotificationService>(
                    svc => svc.NotifyYourTurn(table.SessionId.Value, nextUserId, session.Version));

                _logger.LogInformation(
                    "Table {TableId}: advanced turn to player index {NextIndex} (userId={UserId}), deadline={Deadline}",
                    table.Id, nextPlayerIndex, nextUserId, table.TurnDeadline);
            }
            else
            {
                _logger.LogInformation(
                    "Table {TableId}: advanced turn to player index {NextIndex} (no userId — hot-seat mode), deadline={Deadline}",
                    table.Id, nextPlayerIndex, table.TurnDeadline);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing expired deadline for table {TableId}", table.Id);
        }
    }

    /// <summary>
    /// Extracts (currentPlayerIndex, playerCount) from game state JSON.
    /// </summary>
    private static (int currentPlayerIndex, int playerCount) ExtractPlayerInfo(string stateJson)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(stateJson);
            var root = doc.RootElement;

            var idx = root.TryGetProperty("currentPlayerIndex", out var idxProp) ? idxProp.GetInt32() : 0;

            var count = 2; // Default to 2 players
            if (root.TryGetProperty("players", out var playersProp) &&
                playersProp.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                count = playersProp.GetArrayLength();
            }

            return (idx, Math.Max(count, 2));
        }
        catch
        {
            return (0, 2);
        }
    }

    /// <summary>
    /// Returns the userId of the player at the given index, or null for hot-seat mode.
    /// </summary>
    private static string? ExtractUserIdForPlayerIndex(string stateJson, int playerIndex)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(stateJson);
            var root = doc.RootElement;

            if (!root.TryGetProperty("players", out var playersProp) ||
                playersProp.ValueKind != System.Text.Json.JsonValueKind.Array)
                return null;

            var players = playersProp.EnumerateArray().ToList();
            if (playerIndex < 0 || playerIndex >= players.Count)
                return null;

            var player = players[playerIndex];
            if (player.TryGetProperty("userId", out var userIdProp) &&
                userIdProp.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                return userIdProp.GetString();
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Updates the currentPlayerIndex field in the game state JSON.
    /// Returns the updated JSON string, or null if update fails.
    /// </summary>
    private static string? UpdateCurrentPlayerIndex(string stateJson, int newPlayerIndex)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(stateJson);
            var root = doc.RootElement;

            // Reconstruct JSON with updated currentPlayerIndex
            using var ms = new System.IO.MemoryStream();
            using var writer = new System.Text.Json.Utf8JsonWriter(ms);

            writer.WriteStartObject();
            foreach (var property in root.EnumerateObject())
            {
                if (property.Name == "currentPlayerIndex")
                {
                    writer.WriteNumber("currentPlayerIndex", newPlayerIndex);
                }
                else
                {
                    property.WriteTo(writer);
                }
            }
            writer.WriteEndObject();
            writer.Flush();

            return System.Text.Encoding.UTF8.GetString(ms.ToArray());
        }
        catch
        {
            return null;
        }
    }
}
