using System.Security.Claims;
using Bga2.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Invite system endpoints: create signed invite tokens and validate them.
///
/// Invite links are shareable URLs that can be opened by non-platform users.
/// The client side uses the token to redirect to the table or to auth first.
/// </summary>
public static class InviteEndpoints
{
    public static void MapInviteEndpoints(this WebApplication app)
    {
        var invites = app.MapGroup("/invites").WithTags("Invites");

        // POST /invites — create an invite token for a table (requires auth — only the host should create)
        invites.MapPost("/", CreateInvite)
            .WithName("CreateInviteToken")
            .WithSummary("Create a signed invite token for a game table")
            .RequireAuthorization();

        // GET /invites/{token}/validate — validate a token (no auth — link recipients may not be logged in)
        invites.MapGet("/{token}/validate", ValidateInvite)
            .WithName("ValidateInviteToken")
            .WithSummary("Validate an invite token (no auth required)");
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────

    private static IResult CreateInvite(
        CreateInviteBody body,
        InviteService inviteService,
        HttpContext ctx)
    {
        var userId = ctx.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? ctx.User.FindFirst("sub")?.Value;

        if (userId == null) return Results.Unauthorized();

        if (body.TableId == Guid.Empty)
            return Results.BadRequest(new { error = "TableId is required" });

        var token = inviteService.CreateInviteToken(body.TableId, userId);
        return Results.Ok(new { token });
    }

    private static IResult ValidateInvite(string token, InviteService inviteService)
    {
        var result = inviteService.ValidateInviteToken(token);
        if (!result.Valid)
            return Results.Ok(new { valid = false, error = result.Error });

        return Results.Ok(new { valid = true, tableId = result.TableId });
    }
}

// ─── Request bodies ───────────────────────────────────────────────────────────

/// <summary>Body for POST /invites</summary>
public record CreateInviteBody(Guid TableId = default);
