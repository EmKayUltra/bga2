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
///   5. Save updated state with version increment (optimistic locking via xmin)
///   6. Execute getValidMoves(newState) for next player's turn
///   7. Return MoveResult
/// </summary>
public class GameService
{
    private readonly GameDbContext _db;
    private readonly HookExecutor _hookExecutor;
    private readonly ILogger<GameService> _logger;

    public GameService(GameDbContext db, HookExecutor hookExecutor, ILogger<GameService> logger)
    {
        _db = db;
        _hookExecutor = hookExecutor;
        _logger = logger;
    }

    /// <summary>
    /// Creates a new game session with empty initial state.
    /// Returns the new session id.
    /// </summary>
    public async Task<CreateGameResponse> CreateGame(string gameId)
    {
        var session = new GameSession
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            State = JsonSerializer.Serialize(new
            {
                round = 1,
                currentPlayer = "player1",
                phase = "factory-offer",
                players = Array.Empty<object>(),
                zones = new Dictionary<string, object>()
            }),
            Version = 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.GameSessions.Add(session);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Created game session {SessionId} for game {GameId}", session.Id, gameId);
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
    ///   - Persists new state with optimistic locking
    /// </summary>
    public async Task<MoveResult> ValidateAndApplyMove(Guid sessionId, MoveRequest move)
    {
        // Load session — return error if not found
        var session = await _db.GameSessions.FindAsync(sessionId);
        if (session == null)
        {
            return new MoveResult(false, Errors: [$"Game session {sessionId} not found"]);
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

        // Step 4: Persist updated state with version increment
        session.State = newStateJson;
        session.Version++;
        session.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogWarning(ex, "Optimistic locking conflict on session {SessionId} — concurrent move detected", sessionId);
            return new MoveResult(false, Errors: ["Game state was modified concurrently — please retry your move"]);
        }

        // Step 5: Get valid moves for next turn (next player's legal moves)
        var (nextPlayer, nextRound) = ExtractPlayerAndRound(newStateJson);
        var nextValidMoves = _hookExecutor.GetValidMoves(hooksSource, newStateJson, nextPlayer, nextRound);

        _logger.LogInformation(
            "Move applied to session {SessionId}: action={Action}, version={Version}, nextValidMoves={Count}",
            sessionId, move.Action, session.Version, nextValidMoves.Count);

        return new MoveResult(true, newStateJson, nextValidMoves);
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
    /// Falls back to safe defaults if state is missing these fields.
    /// </summary>
    private static (string currentPlayer, int round) ExtractPlayerAndRound(string stateJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(stateJson);
            var root = doc.RootElement;

            var player = root.TryGetProperty("currentPlayer", out var cp) ? cp.GetString() ?? "player1" : "player1";
            var round = root.TryGetProperty("round", out var r) ? r.GetInt32() : 1;

            return (player, round);
        }
        catch
        {
            return ("player1", 1);
        }
    }
}
