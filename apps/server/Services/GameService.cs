using System.Text.Json;
using Bga2.Server.Data;
using Bga2.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bga2.Server.Services;

/// <summary>
/// Orchestrates game state management and move validation.
///
/// Pipeline for ValidateAndApplyMove:
///   1. Load GameSession from DB
///   2. Execute getValidMoves(state) via HookExecutor
///   3. Check submitted move is in valid moves list (or allow any move if list is empty — Phase 1 stubs)
///   4. Execute onMove(state, move) to mutate state
///   5. If new phase == "wall-tiling", auto-call onRoundEnd
///   6. Save updated state with version increment (optimistic locking via xmin)
///   7. Execute getValidMoves(newState) for next player's turn
///   8. If finished==true, call ProfileService.RecordMatchResults
///   9. Return MoveResult
/// </summary>
public class GameService
{
    private readonly GameDbContext _db;
    private readonly HookExecutor _hookExecutor;
    private readonly ILogger<GameService> _logger;
    private readonly ProfileService _profileService;
    private readonly AppSyncPublisher _appSyncPublisher;

    // Azul tile colors (20 of each = 100 total)
    private static readonly string[] TileColors = ["blue", "yellow", "red", "black", "white"];

    // Maximum number of played move IDs to retain for deduplication (prevents unbounded growth)
    private const int MaxPlayedMoveIds = 100;

    public GameService(GameDbContext db, HookExecutor hookExecutor, ILogger<GameService> logger, ProfileService profileService, AppSyncPublisher appSyncPublisher)
    {
        _db = db;
        _hookExecutor = hookExecutor;
        _logger = logger;
        _profileService = profileService;
        _appSyncPublisher = appSyncPublisher;
    }

    /// <summary>
    /// Creates a new game session with properly initialized Azul state.
    ///
    /// Factory count: 2 players = 5, 3 players = 7, 4 players = 9.
    /// Bag starts with 100 tiles (20 each of 5 colors), shuffled.
    /// Each factory receives 4 tiles drawn from the bag.
    /// Center starts with only the first-player token.
    /// Per-player zones: pattern lines (1-5), wall, floor-line (all empty).
    /// </summary>
    public async Task<CreateGameResponse> CreateGame(string gameId, string[] playerNames)
    {
        // Clamp player count to valid Azul range (2-4)
        var playerCount = Math.Clamp(playerNames.Length, 2, 4);
        var actualPlayerNames = playerNames.Take(playerCount).ToArray();

        // Factory count per player count rule
        var factoryCount = playerCount switch
        {
            2 => 5,
            3 => 7,
            _ => 9  // 4 players
        };

        // Build 100 tiles: 20 of each color, with unique IDs
        // defId is just the color name (e.g. "blue") — the hook uses this as the color identifier
        // id is a unique tile identifier (e.g. "tile-blue-0")
        var allTiles = new List<object>();
        foreach (var color in TileColors)
        {
            for (var i = 0; i < 20; i++)
            {
                allTiles.Add(new { defId = color, id = $"tile-{color}-{i}" });
            }
        }

        // Fisher-Yates shuffle the bag
        var bag = allTiles.ToList();
        var rng = new Random();
        for (var i = bag.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (bag[i], bag[j]) = (bag[j], bag[i]);
        }

        // Build zones dictionary
        var zones = new Dictionary<string, object>();

        // Fill factories: each gets 4 tiles drawn from front of bag
        var bagIndex = 0;
        for (var f = 0; f < factoryCount; f++)
        {
            var factoryTiles = bag.Skip(bagIndex).Take(4).ToList();
            bagIndex += 4;
            zones[$"factory-{f}"] = new { pieces = factoryTiles };
        }

        // Center zone: starts with only the first-player token
        zones["center"] = new
        {
            pieces = new object[] { new { defId = "first-player-token", id = "first-player-token-0" } }
        };

        // Bag zone: remaining tiles after factory fill
        var remainingBag = bag.Skip(bagIndex).ToList();
        zones["bag"] = new { pieces = remainingBag };

        // Lid zone: empty
        zones["lid"] = new { pieces = Array.Empty<object>() };

        // Per-player zones
        for (var i = 0; i < playerCount; i++)
        {
            // Pattern lines 1-5 (empty)
            for (var line = 1; line <= 5; line++)
            {
                zones[$"player-{i}-pattern-line-{line}"] = new { pieces = Array.Empty<object>() };
            }
            // Wall (empty)
            zones[$"player-{i}-wall"] = new { pieces = Array.Empty<object>() };
            // Floor line (empty)
            zones[$"player-{i}-floor-line"] = new { pieces = Array.Empty<object>() };
        }

        // Build players array
        var players = actualPlayerNames.Select((name, i) => new
        {
            id = $"player-{i}",
            name,
            score = 0,
            data = new
            {
                wall = Enumerable.Range(0, 5).Select(_ => new bool[5]).ToArray(),
                patternLines = Enumerable.Range(0, 5).Select(_ => new { color = (string?)null, count = 0 }).ToArray(),
                floorLine = Array.Empty<object>(),
                hasFirstPlayerToken = false
            }
        }).ToArray<object>();

        // Serialize the full game state
        var gameState = new
        {
            id = Guid.NewGuid().ToString(),
            gameId,
            version = 0,
            phase = "factory-offer",
            currentPlayerIndex = 0,
            players,
            zones,
            round = 1,
            finished = false
        };

        var stateJson = JsonSerializer.Serialize(gameState, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        var session = new GameSession
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            State = stateJson,
            Version = 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.GameSessions.Add(session);
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Created game session {SessionId} for game {GameId} with {PlayerCount} players and {FactoryCount} factories",
            session.Id, gameId, playerCount, factoryCount);

        return new CreateGameResponse(session.Id, gameId, session.Version);
    }

    /// <summary>
    /// Validates and applies a move to the game session.
    ///
    /// Move validation logic:
    ///   - Calls getValidMoves hook to get legal moves for current player
    ///   - If validMoves is non-empty: move must match one of them (action + optional source/target/pieceId)
    ///   - If validMoves is empty (Phase 1 stubs return []): allow any move (stubs are permissive)
    ///   - Calls onMove hook to mutate state
    ///   - If new phase == "wall-tiling": auto-calls onRoundEnd
    ///   - Persists new state with version increment
    /// </summary>
    public async Task<MoveResult> ValidateAndApplyMove(Guid sessionId, MoveRequest move)
    {
        // Load session — return error if not found
        var session = await _db.GameSessions.FindAsync(sessionId);
        if (session == null)
        {
            return new MoveResult(false, Errors: [$"Game session {sessionId} not found"]);
        }

        // Idempotency check: if MoveId provided and already processed, return current state
        if (!string.IsNullOrEmpty(move.MoveId))
        {
            var playedIds = ParsePlayedMoveIds(session.PlayedMoveIds);
            if (playedIds.Contains(move.MoveId))
            {
                _logger.LogInformation("Duplicate MoveId {MoveId} detected for session {SessionId} — returning cached success", move.MoveId, sessionId);
                // Return current state as a successful no-op (the move was already applied)
                var hooksSourceForDedup = _hookExecutor.LoadHooks(session.GameId);
                var (dedupPlayer, dedupRound) = ExtractPlayerAndRound(session.State);
                var dedupValidMoves = _hookExecutor.GetValidMoves(hooksSourceForDedup, session.State, dedupPlayer, dedupRound);
                return new MoveResult(true, session.State, dedupValidMoves, Version: session.Version);
            }
        }

        // Load hooks source for this game
        var hooksSource = _hookExecutor.LoadHooks(session.GameId);

        // Parse current player and round from state JSON
        var (currentPlayer, round) = ExtractPlayerAndRound(session.State);

        // Step 1: Get valid moves for current state
        var validMoves = _hookExecutor.GetValidMoves(hooksSource, session.State, currentPlayer, round);

        // Step 2: Validate submitted move against valid moves
        // Phase 1: stubs return empty list — allow all moves (permissive mode)
        if (validMoves.Count > 0 && !IsMoveValid(move, validMoves))
        {
            return new MoveResult(false, Errors: [$"Move '{move.Action}' is not in the list of valid moves"]);
        }

        // Step 3: Apply move via hook
        var (newStateJson, hookErrors) = _hookExecutor.OnMove(hooksSource, session.State, move, currentPlayer, round);
        if (hookErrors.Count > 0)
        {
            return new MoveResult(false, Errors: hookErrors);
        }

        // Step 4: Auto-detect round end — if phase transitioned to "wall-tiling", call onRoundEnd
        var newPhase = ExtractPhase(newStateJson);
        if (newPhase == "wall-tiling")
        {
            var (nextPlayer, nextRound) = ExtractPlayerAndRound(newStateJson);
            var (roundEndState, roundEndErrors) = _hookExecutor.OnRoundEnd(hooksSource, newStateJson, nextPlayer, nextRound);
            if (roundEndErrors.Count == 0)
            {
                newStateJson = roundEndState;
                _logger.LogInformation("Round end detected and processed for session {SessionId}", sessionId);
            }
            else
            {
                _logger.LogWarning("onRoundEnd hook errors for session {SessionId}: {Errors}", sessionId, string.Join(", ", roundEndErrors));
            }
        }

        // Step 5: Persist updated state with version increment
        // Also record MoveId for idempotency (if provided)
        session.State = newStateJson;
        session.Version++;
        session.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrEmpty(move.MoveId))
        {
            session.PlayedMoveIds = AppendMoveId(session.PlayedMoveIds, move.MoveId);
        }

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogWarning(ex, "Optimistic locking conflict on session {SessionId} — concurrent move detected", sessionId);
            return new MoveResult(false, Errors: ["Game state was modified concurrently — please retry your move"], IsConcurrencyConflict: true);
        }

        // Step 5b: Publish to AppSync Events for real-time sync (best-effort, non-blocking)
        // This runs AFTER the DB save so only confirmed moves are broadcast.
        await _appSyncPublisher.PublishGameState(sessionId, newStateJson, session.Version);

        // Step 6: If game finished, record match results for all players
        if (IsGameFinished(newStateJson))
        {
            try
            {
                var playerResults = ExtractPlayerResults(newStateJson, session.GameId);
                if (playerResults.Count > 0)
                {
                    await _profileService.RecordMatchResults(sessionId, session.GameId, playerResults);
                    _logger.LogInformation("Match results recorded for finished session {SessionId}", sessionId);
                }
            }
            catch (Exception ex)
            {
                // Non-fatal: log but don't fail the move response
                _logger.LogError(ex, "Failed to record match results for session {SessionId}", sessionId);
            }
        }

        // Step 7: Get valid moves for next turn (next player's legal moves)
        var (afterPlayer, afterRound) = ExtractPlayerAndRound(newStateJson);
        var nextValidMoves = _hookExecutor.GetValidMoves(hooksSource, newStateJson, afterPlayer, afterRound);

        _logger.LogInformation(
            "Move applied to session {SessionId}: action={Action}, version={Version}, nextValidMoves={Count}",
            sessionId, move.Action, session.Version, nextValidMoves.Count);

        return new MoveResult(true, newStateJson, nextValidMoves, Version: session.Version);
    }

    /// <summary>
    /// Returns the current game state and valid moves for a session.
    /// </summary>
    public async Task<GameStateResponse?> GetGameState(Guid sessionId)
    {
        var session = await _db.GameSessions.FindAsync(sessionId);
        if (session == null) return null;

        var hooksSource = _hookExecutor.LoadHooks(session.GameId);
        var (currentPlayer, round) = ExtractPlayerAndRound(session.State);
        var validMoves = _hookExecutor.GetValidMoves(hooksSource, session.State, currentPlayer, round);

        return new GameStateResponse(session.Id, session.GameId, session.State, session.Version, validMoves);
    }

    /// <summary>
    /// Loads a game session from the database by ID.
    /// Returns null if not found.
    /// Used by DevEndpoints to avoid giving them direct DB access.
    /// </summary>
    public async Task<GameSession?> LoadSession(Guid sessionId)
    {
        return await _db.GameSessions.FindAsync(sessionId);
    }

    /// <summary>
    /// Persists an updated game session to the database.
    /// Increments version and sets UpdatedAt before saving.
    /// </summary>
    public async Task SaveSession(GameSession session)
    {
        session.Version++;
        session.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Checks whether the submitted move matches any of the valid moves returned by the hook.
    /// A match requires action to match; source/target/pieceId are matched only when the
    /// valid move specifies them (null fields in ValidMove are wildcards).
    /// </summary>
    private static bool IsMoveValid(MoveRequest move, List<ValidMove> validMoves)
    {
        return validMoves.Any(v =>
            string.Equals(v.Action, move.Action, StringComparison.OrdinalIgnoreCase) &&
            (v.Source == null || string.Equals(v.Source, move.Source, StringComparison.OrdinalIgnoreCase)) &&
            (v.Target == null || string.Equals(v.Target, move.Target, StringComparison.OrdinalIgnoreCase)) &&
            (v.PieceId == null || string.Equals(v.PieceId, move.PieceId, StringComparison.OrdinalIgnoreCase))
        );
    }

    /// <summary>
    /// Extracts currentPlayer and round from the game state JSON.
    ///
    /// Reads currentPlayerIndex (int) and derives player ID from players[currentPlayerIndex].id.
    /// Falls back to currentPlayer string field for backward compatibility with old state format.
    /// Falls back to safe defaults if state is missing these fields.
    /// </summary>
    public static (string currentPlayer, int round) ExtractPlayerAndRound(string stateJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(stateJson);
            var root = doc.RootElement;

            var round = root.TryGetProperty("round", out var r) ? r.GetInt32() : 1;

            // Primary: read currentPlayerIndex and look up from players array
            if (root.TryGetProperty("currentPlayerIndex", out var idxProp) &&
                root.TryGetProperty("players", out var playersProp) &&
                playersProp.ValueKind == JsonValueKind.Array)
            {
                var idx = idxProp.GetInt32();
                var players = playersProp.EnumerateArray().ToList();
                if (idx >= 0 && idx < players.Count)
                {
                    var playerId = players[idx].TryGetProperty("id", out var idProp)
                        ? idProp.GetString() ?? $"player-{idx}"
                        : $"player-{idx}";
                    return (playerId, round);
                }
            }

            // Fallback: read legacy currentPlayer string field
            var player = root.TryGetProperty("currentPlayer", out var cp) ? cp.GetString() ?? "player-0" : "player-0";
            return (player, round);
        }
        catch
        {
            return ("player-0", 1);
        }
    }

    /// <summary>
    /// Extracts the phase field from the game state JSON.
    /// Returns empty string if not found or parse error.
    /// </summary>
    private static string ExtractPhase(string stateJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(stateJson);
            var root = doc.RootElement;
            return root.TryGetProperty("phase", out var phase) ? phase.GetString() ?? "" : "";
        }
        catch
        {
            return "";
        }
    }

    /// <summary>
    /// Checks if the game state has finished==true.
    /// </summary>
    private static bool IsGameFinished(string stateJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(stateJson);
            var root = doc.RootElement;
            return root.TryGetProperty("finished", out var finished) && finished.GetBoolean();
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Parses the PlayedMoveIds JSON array into a HashSet for O(1) lookup.
    /// Returns empty set if the JSON is null, empty, or malformed.
    /// </summary>
    private static HashSet<string> ParsePlayedMoveIds(string playedMoveIdsJson)
    {
        if (string.IsNullOrEmpty(playedMoveIdsJson) || playedMoveIdsJson == "[]")
            return [];
        try
        {
            var ids = JsonSerializer.Deserialize<List<string>>(playedMoveIdsJson);
            return ids != null ? new HashSet<string>(ids) : [];
        }
        catch
        {
            return [];
        }
    }

    /// <summary>
    /// Appends a new MoveId to the PlayedMoveIds JSON array.
    /// Trims to the last MaxPlayedMoveIds entries to prevent unbounded growth.
    /// </summary>
    private static string AppendMoveId(string playedMoveIdsJson, string moveId)
    {
        List<string> ids;
        try
        {
            ids = JsonSerializer.Deserialize<List<string>>(playedMoveIdsJson) ?? [];
        }
        catch
        {
            ids = [];
        }

        ids.Add(moveId);

        // Trim to last MaxPlayedMoveIds entries
        if (ids.Count > MaxPlayedMoveIds)
        {
            ids = ids.Skip(ids.Count - MaxPlayedMoveIds).ToList();
        }

        return JsonSerializer.Serialize(ids);
    }

    /// <summary>
    /// Extracts player results from the finished game state.
    /// Maps players by index; uses player.id as userId.
    /// Determines winner by highest score (or Won field if present).
    /// Returns empty list if players array is missing or malformed.
    ///
    /// NOTE: player.id in the state is "player-0", "player-1" etc. (not real user IDs).
    /// For Phase 3 the game was created without real user IDs attached — we record the
    /// game-scoped player IDs. When lobby integration (Plan 02) is complete, real user
    /// IDs will be passed in. This provides the hook but may not link to real profiles yet.
    /// </summary>
    private static List<PlayerEndData> ExtractPlayerResults(string stateJson, string gameId)
    {
        try
        {
            using var doc = JsonDocument.Parse(stateJson);
            var root = doc.RootElement;

            if (!root.TryGetProperty("players", out var playersProp) ||
                playersProp.ValueKind != JsonValueKind.Array)
                return [];

            var players = playersProp.EnumerateArray().ToList();
            if (players.Count == 0) return [];

            // Find max score to determine winner(s)
            var scores = players.Select(p =>
                p.TryGetProperty("score", out var s) ? s.GetInt32() : 0
            ).ToList();

            var maxScore = scores.Max();

            return players.Select((p, idx) =>
            {
                var playerId = p.TryGetProperty("id", out var idProp)
                    ? idProp.GetString() ?? $"player-{idx}"
                    : $"player-{idx}";

                var score = scores[idx];
                var won = score == maxScore;

                // Rank: count how many players have strictly higher score + 1
                var rank = scores.Count(s => s > score) + 1;

                return new PlayerEndData(
                    UserId: playerId,
                    Score: score,
                    Rank: rank,
                    Won: won
                );
            }).ToList();
        }
        catch
        {
            return [];
        }
    }
}
