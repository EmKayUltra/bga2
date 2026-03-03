using System.Text.Json;
using System.Text.Json.Nodes;
using Bga2.Server.Data;
using Bga2.Server.Models;
using Bga2.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Developer-only endpoints for real-time game state manipulation.
/// These endpoints allow dev iteration on game logic without playing through
/// full rounds manually (trigger round-end, game-end, or arbitrary state overrides).
///
/// No auth or environment gating — server only runs locally in Docker during dev.
/// </summary>
public static class DevEndpoints
{
    public static void MapDevEndpoints(this WebApplication app)
    {
        var dev = app.MapGroup("/dev").WithTags("Dev");

        // POST /dev/{sessionId}/trigger-round-end
        dev.MapPost("/{sessionId:guid}/trigger-round-end", TriggerRoundEnd)
            .WithName("DevTriggerRoundEnd")
            .WithSummary("Trigger onRoundEnd hook for the current session state");

        // POST /dev/{sessionId}/trigger-game-end
        dev.MapPost("/{sessionId:guid}/trigger-game-end", TriggerGameEnd)
            .WithName("DevTriggerGameEnd")
            .WithSummary("Set finished=true and compute winner for the current session");

        // POST /dev/{sessionId}/set-state
        dev.MapPost("/{sessionId:guid}/set-state", SetState)
            .WithName("DevSetState")
            .WithSummary("Shallow-merge arbitrary JSON properties onto the current game state");

        // POST /dev/{sessionId}/move — submit a move without auth (dev/testing only)
        dev.MapPost("/{sessionId:guid}/move", SubmitMove)
            .WithName("DevSubmitMove")
            .WithSummary("Submit a game move bypassing authentication (dev testing only)");
    }

    /// <summary>
    /// Loads hooks and calls OnRoundEnd for the current game state.
    /// Persists the new state and returns a GameStateResponse.
    /// </summary>
    private static async Task<IResult> TriggerRoundEnd(
        Guid sessionId,
        GameService gameService,
        HookExecutor hookExecutor)
    {
        var session = await gameService.LoadSession(sessionId);
        if (session == null)
        {
            return Results.NotFound(new { error = $"Game session {sessionId} not found" });
        }

        var hooksSource = hookExecutor.LoadHooks(session.GameId);
        var (currentPlayer, round) = GameService.ExtractPlayerAndRound(session.State);
        var (newStateJson, errors) = hookExecutor.OnRoundEnd(hooksSource, session.State, currentPlayer, round);

        if (errors.Count > 0)
        {
            return Results.BadRequest(new { error = "onRoundEnd hook errors", errors });
        }

        session.State = newStateJson;
        await gameService.SaveSession(session);

        var (afterPlayer, afterRound) = GameService.ExtractPlayerAndRound(newStateJson);
        var validMoves = hookExecutor.GetValidMoves(hooksSource, newStateJson, afterPlayer, afterRound);

        return Results.Ok(new GameStateResponse(session.Id, session.GameId, session.State, session.Version, validMoves));
    }

    /// <summary>
    /// Sets finished=true and winnerId to the player with the highest score.
    /// Persists the new state and returns a GameStateResponse.
    /// </summary>
    private static async Task<IResult> TriggerGameEnd(
        Guid sessionId,
        GameService gameService,
        HookExecutor hookExecutor)
    {
        var session = await gameService.LoadSession(sessionId);
        if (session == null)
        {
            return Results.NotFound(new { error = $"Game session {sessionId} not found" });
        }

        // Parse state into a mutable JsonNode so we can mutate finished and winnerId
        var stateNode = JsonNode.Parse(session.State);
        if (stateNode == null)
        {
            return Results.Problem("Failed to parse session state JSON");
        }

        // Find player with the highest score
        string? winnerId = null;
        var playersNode = stateNode["players"]?.AsArray();
        if (playersNode != null)
        {
            int bestScore = int.MinValue;
            foreach (var playerNode in playersNode)
            {
                if (playerNode == null) continue;
                var score = playerNode["score"]?.GetValue<int>() ?? 0;
                var id = playerNode["id"]?.GetValue<string>();
                if (score > bestScore && id != null)
                {
                    bestScore = score;
                    winnerId = id;
                }
            }
        }

        stateNode["finished"] = true;
        stateNode["winnerId"] = winnerId;

        var newStateJson = stateNode.ToJsonString();
        session.State = newStateJson;
        await gameService.SaveSession(session);

        var hooksSource = hookExecutor.LoadHooks(session.GameId);
        var (currentPlayer, round) = GameService.ExtractPlayerAndRound(newStateJson);
        var validMoves = hookExecutor.GetValidMoves(hooksSource, newStateJson, currentPlayer, round);

        return Results.Ok(new GameStateResponse(session.Id, session.GameId, session.State, session.Version, validMoves));
    }

    /// <summary>
    /// Submits a game move without authentication.
    /// Used by the test harness bot runner and automated integration tests.
    /// </summary>
    private static async Task<IResult> SubmitMove(
        Guid sessionId,
        MoveRequest move,
        GameService gameService)
    {
        var result = await gameService.ValidateAndApplyMove(sessionId, move);

        var response = new MoveResponse(
            Valid: result.IsValid,
            State: result.NewState,
            ValidMoves: result.ValidMoves,
            Errors: result.Errors,
            Version: result.Version
        );

        if (!result.IsValid)
        {
            if (result.IsConcurrencyConflict)
                return Results.Conflict(response);
            return Results.BadRequest(response);
        }

        return Results.Ok(response);
    }

    /// <summary>
    /// Shallow-merges an arbitrary JSON object onto the current game state.
    /// Each key in the request body overwrites the same key in the state root.
    /// </summary>
    private static async Task<IResult> SetState(
        Guid sessionId,
        JsonDocument overrides,
        GameService gameService,
        HookExecutor hookExecutor)
    {
        var session = await gameService.LoadSession(sessionId);
        if (session == null)
        {
            return Results.NotFound(new { error = $"Game session {sessionId} not found" });
        }

        var stateNode = JsonNode.Parse(session.State);
        if (stateNode == null)
        {
            return Results.Problem("Failed to parse session state JSON");
        }

        // Shallow merge: each top-level key in overrides replaces the same key in state
        foreach (var property in overrides.RootElement.EnumerateObject())
        {
            stateNode[property.Name] = JsonNode.Parse(property.Value.GetRawText());
        }

        var newStateJson = stateNode.ToJsonString();
        session.State = newStateJson;
        await gameService.SaveSession(session);

        var hooksSource = hookExecutor.LoadHooks(session.GameId);
        var (currentPlayer, round) = GameService.ExtractPlayerAndRound(newStateJson);
        var validMoves = hookExecutor.GetValidMoves(hooksSource, newStateJson, currentPlayer, round);

        return Results.Ok(new GameStateResponse(session.Id, session.GameId, session.State, session.Version, validMoves));
    }
}
