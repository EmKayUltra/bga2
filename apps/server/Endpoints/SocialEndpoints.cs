using System.Security.Claims;
using Bga2.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Social endpoints: user profiles, avatar selection, match history, username management.
/// Extension method pattern matching GameEndpoints pattern.
/// </summary>
public static class SocialEndpoints
{
    public static void MapSocialEndpoints(this WebApplication app)
    {
        var social = app.MapGroup("/social").WithTags("Social");

        // GET /social/avatars — list of preset avatar identifiers (public)
        social.MapGet("/avatars", GetAvatars)
            .WithName("GetAvatars")
            .WithSummary("Get list of preset avatar identifiers");

        // GET /social/profile/{username} — get a public profile (no auth required)
        social.MapGet("/profile/{username}", GetProfile)
            .WithName("GetProfile")
            .WithSummary("Get a user profile by username");

        // GET /social/profile/{username}/history — match history (public if profile is public)
        social.MapGet("/profile/{username}/history", GetMatchHistory)
            .WithName("GetMatchHistory")
            .WithSummary("Get match history for a user");

        // PUT /social/profile — update own profile avatar + privacy (requires auth)
        social.MapPut("/profile", UpdateProfile)
            .WithName("UpdateProfile")
            .WithSummary("Update own profile avatar and privacy setting")
            .RequireAuthorization();

        // PUT /social/profile/username — change own username (requires auth)
        social.MapPut("/profile/username", UpdateUsername)
            .WithName("UpdateUsername")
            .WithSummary("Change own username (3-20 chars, 30-day cooldown)")
            .RequireAuthorization();
    }

    private static IResult GetAvatars()
    {
        return Results.Ok(ProfileService.PresetAvatars);
    }

    private static async Task<IResult> GetProfile(
        string username,
        ProfileService profileService,
        HttpContext httpContext)
    {
        // Viewer identity for privacy check (null if unauthenticated)
        var viewerUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? httpContext.User.FindFirst("sub")?.Value;

        var profile = await profileService.GetProfile(username, viewerUserId);
        if (profile == null)
            return Results.NotFound(new { error = $"User '{username}' not found" });

        return Results.Ok(profile);
    }

    private static async Task<IResult> GetMatchHistory(
        string username,
        ProfileService profileService,
        HttpContext httpContext,
        int page = 1,
        int pageSize = 20)
    {
        // Look up userId from username
        var userId = await profileService.GetUserIdByUsername(username);
        if (userId == null)
            return Results.NotFound(new { error = $"User '{username}' not found" });

        // Check privacy — viewer must be owner or profile must be public
        var viewerUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? httpContext.User.FindFirst("sub")?.Value;

        var profile = await profileService.GetProfile(username, viewerUserId);
        if (profile == null)
            return Results.NotFound(new { error = $"User '{username}' not found" });

        if (!profile.IsPublic && viewerUserId != userId)
            return Results.Forbid();

        var history = await profileService.GetMatchHistory(userId, page, Math.Clamp(pageSize, 1, 100));
        return Results.Ok(history);
    }

    private static async Task<IResult> UpdateProfile(
        UpdateProfileRequest req,
        ProfileService profileService,
        HttpContext httpContext)
    {
        var userId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? httpContext.User.FindFirst("sub")?.Value;

        if (string.IsNullOrEmpty(userId))
            return Results.Unauthorized();

        var success = await profileService.UpdateProfile(userId, req);
        if (!success)
            return Results.BadRequest(new { error = "Invalid avatar selection" });

        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> UpdateUsername(
        UpdateUsernameRequest req,
        ProfileService profileService,
        HttpContext httpContext)
    {
        var userId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? httpContext.User.FindFirst("sub")?.Value;

        if (string.IsNullOrEmpty(userId))
            return Results.Unauthorized();

        var result = await profileService.UpdateUsername(userId, req.Username ?? "");

        if (!result.Success)
        {
            if (result.RetryAfterDays.HasValue)
            {
                // 429 Too Many Requests — cooldown active
                return Results.Json(
                    new { success = false, error = result.Error, retryAfterDays = result.RetryAfterDays },
                    statusCode: 429);
            }
            // 409 Conflict — username taken or validation error
            return Results.Conflict(new { success = false, error = result.Error });
        }

        return Results.Ok(new { success = true });
    }
}

/// <summary>Request body for PUT /social/profile/username</summary>
public record UpdateUsernameRequest(string? Username = null);
