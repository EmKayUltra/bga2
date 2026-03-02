using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Bga2.Server.Data;
using Bga2.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Bga2.Server.Endpoints;

/// <summary>
/// Chat endpoints: send filtered messages via AppSync Events and report players.
///
/// Chat flow:
///   1. Client POSTs message to /chat/{channelId}/send (requires auth)
///   2. Server filters message through ChatFilter
///   3. Server publishes filtered event to AppSync /game/{channelId}/chat channel
///   4. All subscribers (both players) receive the message via WebSocket
///
/// The channelId is the sessionId (for game chat) or tableId (for waiting room).
/// </summary>
public static class ChatEndpoints
{
    public static void MapChatEndpoints(this WebApplication app)
    {
        var chat = app.MapGroup("/chat").WithTags("Chat");

        // POST /chat/{channelId}/send — send a filtered chat message
        chat.MapPost("/{channelId}/send", SendMessage)
            .WithName("SendChatMessage")
            .WithSummary("Send a filtered chat message to a game or waiting room channel")
            .RequireAuthorization();

        // POST /chat/{channelId}/report — report a user for a chat message
        chat.MapPost("/{channelId}/report", ReportUser)
            .WithName("ReportChatUser")
            .WithSummary("Report a user for a chat message (logged for moderation)")
            .RequireAuthorization();
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────

    private static async Task<IResult> SendMessage(
        string channelId,
        SendChatMessageBody body,
        ChatFilter chatFilter,
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<ChatFilter> logger,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        var username = ExtractUsername(ctx);
        if (userId == null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(body.Message))
            return Results.BadRequest(new { error = "Message cannot be empty" });

        // Enforce message length limit
        if (body.Message.Length > 500)
            return Results.BadRequest(new { error = "Message too long (max 500 characters)" });

        // Filter the message for profanity
        var filteredMessage = chatFilter.Filter(body.Message.Trim());
        var wasFiltered = filteredMessage != body.Message.Trim();

        // Publish to AppSync Events /game/{channelId}/chat channel
        var endpoint = config["AppSync:HttpEndpoint"];
        var apiKey = config["AppSync:ApiKey"];

        if (!string.IsNullOrEmpty(endpoint) && !string.IsNullOrEmpty(apiKey))
        {
            try
            {
                var chatEvent = JsonSerializer.Serialize(new
                {
                    userId,
                    username = username ?? userId,
                    message = filteredMessage,
                    timestamp = DateTime.UtcNow.ToString("O"),
                });

                var requestBody = JsonSerializer.Serialize(new
                {
                    channel = $"/game/{channelId}/chat",
                    events = new[] { chatEvent },
                });

                using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/event");
                request.Headers.Add("x-api-key", apiKey);
                request.Content = new StringContent(requestBody, Encoding.UTF8, "application/json");

                var client = httpClientFactory.CreateClient("AppSync");
                var response = await client.SendAsync(request);
                response.EnsureSuccessStatusCode();

                logger.LogDebug("Published chat message to /game/{ChannelId}/chat from user {UserId}", channelId, userId);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to publish chat message to AppSync for channel {ChannelId}", channelId);
                // Don't fail — REST response still confirms send was processed
            }
        }
        else
        {
            logger.LogDebug("AppSync not configured — chat message from {UserId} not published in real-time", userId);
        }

        return Results.Ok(new { filtered = wasFiltered, message = filteredMessage });
    }

    private static async Task<IResult> ReportUser(
        string channelId,
        ReportUserBody body,
        GameDbContext db,
        HttpContext ctx)
    {
        var userId = ExtractUserId(ctx);
        if (userId == null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(body.ReportedUserId))
            return Results.BadRequest(new { error = "ReportedUserId is required" });

        // Rate limit: max 10 reports per hour per reporting user
        var oneHourAgo = DateTime.UtcNow.AddHours(-1);
        var recentReportCount = await db.PlayerReports
            .CountAsync(r => r.ReporterUserId == userId && r.CreatedAt >= oneHourAgo);

        if (recentReportCount >= 10)
            return Results.Json(new { error = "Too many reports. Please wait before reporting again." }, statusCode: 429);

        var report = new PlayerReport
        {
            Id = Guid.NewGuid(),
            ReporterUserId = userId,
            ReportedUserId = body.ReportedUserId,
            ChannelId = channelId,
            MessageText = body.MessageText,
            Reason = body.Reason,
            CreatedAt = DateTime.UtcNow,
        };

        db.PlayerReports.Add(report);
        await db.SaveChangesAsync();

        return Results.Ok(new { success = true });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static string? ExtractUserId(HttpContext ctx) =>
        ctx.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? ctx.User.FindFirst("sub")?.Value;

    private static string? ExtractUsername(HttpContext ctx) =>
        ctx.User.FindFirst("name")?.Value
        ?? ctx.User.FindFirst(ClaimTypes.Name)?.Value
        ?? ctx.User.FindFirst("preferred_username")?.Value
        ?? ctx.User.FindFirst("username")?.Value;
}

// ─── Request bodies ───────────────────────────────────────────────────────────

/// <summary>Body for POST /chat/{channelId}/send</summary>
public record SendChatMessageBody(string? Message = null);

/// <summary>Body for POST /chat/{channelId}/report</summary>
public record ReportUserBody(
    string? ReportedUserId = null,
    string? MessageText = null,
    string? Reason = null);
