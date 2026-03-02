using System.Security.Claims;
using Bga2.Server.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Minimal API endpoints for push subscription management and notification preferences.
/// </summary>
public static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this WebApplication app)
    {
        var notifications = app.MapGroup("/notifications").WithTags("Notifications");

        // Push subscription management
        notifications.MapPost("/push/subscribe", SubscribePush)
            .WithName("SubscribePush")
            .WithSummary("Register a Web Push subscription for the current user")
            .RequireAuthorization();

        notifications.MapPost("/push/unsubscribe", UnsubscribePush)
            .WithName("UnsubscribePush")
            .WithSummary("Remove a Web Push subscription")
            .RequireAuthorization();

        // Notification preferences (GET + PUT)
        notifications.MapGet("/preferences", GetPreferences)
            .WithName("GetNotificationPreferences")
            .WithSummary("Get notification preferences for the current user")
            .RequireAuthorization();

        notifications.MapPut("/preferences", UpdatePreferences)
            .WithName("UpdateNotificationPreferences")
            .WithSummary("Update notification preferences for the current user")
            .RequireAuthorization();
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────

    private static async Task<IResult> SubscribePush(
        SubscribePushRequest req,
        GameDbContext db,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();

        // Upsert: if same endpoint already exists for this user, update keys
        var existing = await db.PushSubscriptions
            .FirstOrDefaultAsync(s => s.UserId == userId && s.Endpoint == req.Endpoint);

        if (existing != null)
        {
            existing.P256dh = req.P256dh;
            existing.Auth = req.Auth;
        }
        else
        {
            db.PushSubscriptions.Add(new PushSubscription
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Endpoint = req.Endpoint,
                P256dh = req.P256dh,
                Auth = req.Auth,
                CreatedAt = DateTime.UtcNow,
            });
        }

        await db.SaveChangesAsync();
        return Results.Ok(new { registered = true });
    }

    private static async Task<IResult> UnsubscribePush(
        UnsubscribePushRequest req,
        GameDbContext db,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();

        var subscription = await db.PushSubscriptions
            .FirstOrDefaultAsync(s => s.UserId == userId && s.Endpoint == req.Endpoint);

        if (subscription != null)
        {
            db.PushSubscriptions.Remove(subscription);
            await db.SaveChangesAsync();
        }

        return Results.NoContent();
    }

    private static async Task<IResult> GetPreferences(
        GameDbContext db,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();

        var prefs = await db.NotificationPreferences
            .FirstOrDefaultAsync(p => p.UserId == userId);

        // Return defaults if no row exists
        if (prefs == null)
        {
            return Results.Ok(new
            {
                emailEnabled = true,
                pushEnabled = true,
                reminderHoursBeforeDeadline = 4,
            });
        }

        return Results.Ok(new
        {
            emailEnabled = prefs.EmailEnabled,
            pushEnabled = prefs.PushEnabled,
            reminderHoursBeforeDeadline = prefs.ReminderHoursBeforeDeadline,
        });
    }

    private static async Task<IResult> UpdatePreferences(
        UpdatePreferencesRequest req,
        GameDbContext db,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();

        var prefs = await db.NotificationPreferences
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (prefs == null)
        {
            // Insert
            db.NotificationPreferences.Add(new NotificationPreference
            {
                UserId = userId,
                EmailEnabled = req.EmailEnabled,
                PushEnabled = req.PushEnabled,
                ReminderHoursBeforeDeadline = req.ReminderHoursBeforeDeadline,
                UpdatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            // Update
            prefs.EmailEnabled = req.EmailEnabled;
            prefs.PushEnabled = req.PushEnabled;
            prefs.ReminderHoursBeforeDeadline = req.ReminderHoursBeforeDeadline;
            prefs.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return Results.Ok(new { updated = true });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Extract userId from JWT claims (Better Auth sets sub = user ID).
    /// </summary>
    private static string? ExtractUserId(HttpContext ctx) =>
        ctx.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? ctx.User.FindFirst("sub")?.Value;
}

// ─── Request records ──────────────────────────────────────────────────────────

/// <summary>Request body for POST /notifications/push/subscribe.</summary>
public record SubscribePushRequest(string Endpoint, string P256dh, string Auth);

/// <summary>Request body for POST /notifications/push/unsubscribe.</summary>
public record UnsubscribePushRequest(string Endpoint);

/// <summary>Request body for PUT /notifications/preferences.</summary>
public record UpdatePreferencesRequest(
    bool EmailEnabled,
    bool PushEnabled,
    int ReminderHoursBeforeDeadline);
