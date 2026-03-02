using System.Security.Claims;
using Bga2.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Minimal API endpoints for the lobby system.
/// Tables are how players find and organise games before they start.
/// </summary>
public static class LobbyEndpoints
{
    public static void MapLobbyEndpoints(this WebApplication app)
    {
        var tables = app.MapGroup("/tables").WithTags("Lobby");

        // Public: anyone can browse the table list
        tables.MapGet("/", ListTables)
            .WithName("ListTables")
            .WithSummary("List all public Waiting tables");

        // Public: waiting room polling does not require auth
        tables.MapGet("/{id:guid}", GetTable)
            .WithName("GetTable")
            .WithSummary("Get table details and player list");

        // Authenticated actions
        tables.MapPost("/", CreateTable)
            .WithName("CreateTable")
            .WithSummary("Create a new lobby table")
            .RequireAuthorization();

        tables.MapPost("/{id:guid}/join", JoinTable)
            .WithName("JoinTable")
            .WithSummary("Join an existing table")
            .RequireAuthorization();

        tables.MapPost("/{id:guid}/leave", LeaveTable)
            .WithName("LeaveTable")
            .WithSummary("Leave a table")
            .RequireAuthorization();

        tables.MapPost("/{id:guid}/start", StartGame)
            .WithName("StartGame")
            .WithSummary("Start the game (host only)")
            .RequireAuthorization();

        tables.MapPost("/quick-play", QuickPlay)
            .WithName("QuickPlay")
            .WithSummary("Auto-join or create a table")
            .RequireAuthorization();
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────

    private static async Task<IResult> ListTables(LobbyService lobbyService)
    {
        var tables = await lobbyService.ListTables();
        return Results.Ok(tables);
    }

    private static async Task<IResult> GetTable(Guid id, LobbyService lobbyService)
    {
        var detail = await lobbyService.GetTable(id);
        if (detail == null)
            return Results.NotFound(new { error = $"Table {id} not found" });
        return Results.Ok(detail);
    }

    private static async Task<IResult> CreateTable(
        CreateTableRequest req,
        LobbyService lobbyService,
        HttpContext ctx)
    {
        var (userId, displayName) = ExtractUser(ctx);
        if (userId == null)
            return Results.Unauthorized();

        var (table, error) = await lobbyService.CreateTable(userId, displayName, req);
        if (error != null)
            return Results.BadRequest(new { error });

        return Results.Created($"/tables/{table!.Id}", new { id = table.Id });
    }

    private static async Task<IResult> JoinTable(
        Guid id,
        JoinTableRequest? req,
        LobbyService lobbyService,
        HttpContext ctx)
    {
        var (userId, displayName) = ExtractUser(ctx);
        if (userId == null)
            return Results.Unauthorized();

        var result = await lobbyService.JoinTable(id, userId, displayName, req?.Password);
        if (!result.Success)
            return Results.BadRequest(new { error = result.Error });
        return Results.Ok(result);
    }

    private static async Task<IResult> LeaveTable(
        Guid id,
        LobbyService lobbyService,
        HttpContext ctx)
    {
        var (userId, _) = ExtractUser(ctx);
        if (userId == null)
            return Results.Unauthorized();

        await lobbyService.LeaveTable(id, userId);
        return Results.NoContent();
    }

    private static async Task<IResult> StartGame(
        Guid id,
        LobbyService lobbyService,
        HttpContext ctx)
    {
        var (userId, _) = ExtractUser(ctx);
        if (userId == null)
            return Results.Unauthorized();

        var result = await lobbyService.StartGame(id, userId);
        if (!result.Success)
            return Results.BadRequest(new { error = result.Error });
        return Results.Ok(result);
    }

    private static async Task<IResult> QuickPlay(
        QuickPlayRequest req,
        LobbyService lobbyService,
        HttpContext ctx)
    {
        var (userId, displayName) = ExtractUser(ctx);
        if (userId == null)
            return Results.Unauthorized();

        var result = await lobbyService.QuickPlay(userId, displayName, req.GameId);
        return Results.Ok(result);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Extract userId and displayName from JWT claims.
    /// Better Auth sets sub = user ID; name = display name.
    /// </summary>
    private static (string? userId, string displayName) ExtractUser(HttpContext ctx)
    {
        var userId = ctx.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? ctx.User.FindFirst("sub")?.Value;
        var displayName = ctx.User.FindFirst("name")?.Value
            ?? ctx.User.FindFirst(ClaimTypes.Name)?.Value
            ?? "Player";
        return (userId, displayName);
    }
}

// ─── Additional request records ───────────────────────────────────────────────

/// <summary>Request body for POST /tables/{id}/join — optional password for private tables.</summary>
public record JoinTableRequest(string? Password = null);

/// <summary>Request body for POST /tables/quick-play.</summary>
public record QuickPlayRequest(string GameId = "azul");
