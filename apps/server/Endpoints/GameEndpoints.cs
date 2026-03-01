using Bga2.Server.Models;
using Bga2.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Minimal API endpoints for game operations.
/// Extension method pattern for clean registration in Program.cs.
/// </summary>
public static class GameEndpoints
{
    public static void MapGameEndpoints(this WebApplication app)
    {
        var games = app.MapGroup("/games").WithTags("Games");

        // POST /games — create a new game session
        games.MapPost("/", CreateGame)
            .WithName("CreateGame")
            .WithSummary("Create a new game session");

        // POST /games/{sessionId}/move — validate and apply a player move
        games.MapPost("/{sessionId:guid}/move", ValidateAndApplyMove)
            .WithName("ValidateAndApplyMove")
            .WithSummary("Validate a move and apply it to the game state if legal");

        // GET /games/{sessionId}/state — get current game state + valid moves
        games.MapGet("/{sessionId:guid}/state", GetGameState)
            .WithName("GetGameState")
            .WithSummary("Get current game state and legal moves for the current player");
    }

    private static async Task<IResult> CreateGame(
        CreateGameRequest? request,
        GameService gameService)
    {
        var gameId = request?.GameId ?? "azul";
        var playerNames = request?.PlayerNames ?? ["Player 1", "Player 2"];
        var response = await gameService.CreateGame(gameId, playerNames);
        return Results.Created($"/games/{response.SessionId}/state", response);
    }

    private static async Task<IResult> ValidateAndApplyMove(
        Guid sessionId,
        MoveRequest move,
        GameService gameService)
    {
        var result = await gameService.ValidateAndApplyMove(sessionId, move);

        var response = new MoveResponse(
            Valid: result.IsValid,
            State: result.NewState,
            ValidMoves: result.ValidMoves,
            Errors: result.Errors
        );

        if (!result.IsValid)
        {
            return Results.BadRequest(response);
        }

        return Results.Ok(response);
    }

    private static async Task<IResult> GetGameState(
        Guid sessionId,
        GameService gameService)
    {
        var state = await gameService.GetGameState(sessionId);

        if (state == null)
        {
            return Results.NotFound(new { error = $"Game session {sessionId} not found" });
        }

        return Results.Ok(state);
    }
}

/// <summary>
/// Request body for POST /games — create a new game session.
/// GameId defaults to "azul" if omitted.
/// PlayerNames defaults to ["Player 1", "Player 2"] if omitted (2-player game).
/// </summary>
public record CreateGameRequest(string? GameId = null, string[]? PlayerNames = null);
