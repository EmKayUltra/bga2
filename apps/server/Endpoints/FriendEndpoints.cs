using System.Security.Claims;
using Bga2.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Friend system endpoints: search, request, accept, decline, remove, block, and friends list.
/// All endpoints require authentication except user search (which still needs auth to know who is searching).
/// </summary>
public static class FriendEndpoints
{
    public static void MapFriendEndpoints(this WebApplication app)
    {
        var friends = app.MapGroup("/friends").WithTags("Friends");

        // GET /friends — list accepted friends with online status
        friends.MapGet("/", GetFriends)
            .WithName("GetFriends")
            .WithSummary("Get friends list with online status")
            .RequireAuthorization();

        // GET /friends/requests — pending incoming + outgoing requests
        friends.MapGet("/requests", GetPendingRequests)
            .WithName("GetPendingRequests")
            .WithSummary("Get pending friend requests (incoming and outgoing)")
            .RequireAuthorization();

        // GET /friends/search?q={query} — search users by username
        friends.MapGet("/search", SearchUsers)
            .WithName("SearchUsers")
            .WithSummary("Search for users by username prefix")
            .RequireAuthorization();

        // POST /friends/request — send a friend request
        friends.MapPost("/request", SendRequest)
            .WithName("SendFriendRequest")
            .WithSummary("Send a friend request by username")
            .RequireAuthorization();

        // POST /friends/block — block a user
        friends.MapPost("/block", BlockUser)
            .WithName("BlockUser")
            .WithSummary("Block a user")
            .RequireAuthorization();

        // POST /friends/{id}/accept — accept a pending request
        friends.MapPost("/{id:guid}/accept", AcceptRequest)
            .WithName("AcceptFriendRequest")
            .WithSummary("Accept a pending friend request")
            .RequireAuthorization();

        // POST /friends/{id}/decline — decline a pending request
        friends.MapPost("/{id:guid}/decline", DeclineRequest)
            .WithName("DeclineFriendRequest")
            .WithSummary("Decline a pending friend request")
            .RequireAuthorization();

        // DELETE /friends/{id} — remove a friend
        friends.MapDelete("/{id:guid}", RemoveFriend)
            .WithName("RemoveFriend")
            .WithSummary("Remove a friend or cancel an outgoing request")
            .RequireAuthorization();
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────

    private static async Task<IResult> GetFriends(FriendService friendService, HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        var friends = await friendService.GetFriends(userId);
        return Results.Ok(friends);
    }

    private static async Task<IResult> GetPendingRequests(FriendService friendService, HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        var requests = await friendService.GetPendingRequests(userId);
        return Results.Ok(requests);
    }

    private static async Task<IResult> SearchUsers(
        string? q,
        FriendService friendService,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Results.Ok(Array.Empty<UserSearchResult>());
        var results = await friendService.SearchUsers(q, userId);
        return Results.Ok(results);
    }

    private static async Task<IResult> SendRequest(
        SendFriendRequestBody body,
        FriendService friendService,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Username))
            return Results.BadRequest(new { error = "Username is required" });
        var result = await friendService.SendRequest(userId, body.Username);
        if (!result.Success)
            return Results.BadRequest(new { error = result.Error });
        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> BlockUser(
        BlockUserBody body,
        FriendService friendService,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(body.UserId))
            return Results.BadRequest(new { error = "UserId is required" });
        await friendService.BlockUser(userId, body.UserId);
        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> AcceptRequest(
        Guid id,
        FriendService friendService,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        var ok = await friendService.AcceptRequest(userId, id);
        if (!ok) return Results.NotFound(new { error = "Friend request not found or not yours" });
        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> DeclineRequest(
        Guid id,
        FriendService friendService,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        var ok = await friendService.DeclineRequest(userId, id);
        if (!ok) return Results.NotFound(new { error = "Friend request not found or not yours" });
        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> RemoveFriend(
        Guid id,
        FriendService friendService,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();
        var ok = await friendService.RemoveFriend(userId, id);
        if (!ok) return Results.NotFound(new { error = "Friendship not found" });
        return Results.Ok(new { success = true });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static string? ExtractUserId(HttpContext ctx) =>
        ctx.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? ctx.User.FindFirst("sub")?.Value;
}

// ─── Request bodies ───────────────────────────────────────────────────────────

/// <summary>Body for POST /friends/request</summary>
public record SendFriendRequestBody(string? Username = null);

/// <summary>Body for POST /friends/block</summary>
public record BlockUserBody(string? UserId = null);
