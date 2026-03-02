using System.Text.Json;
using Bga2.Server.Data;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Resend;

namespace Bga2.Server.Services;

/// <summary>
/// Orchestrates sending "your turn" and deadline reminder notifications via email (Resend)
/// and Web Push (VAPID). Checks user preferences and uses NotificationLog for idempotency.
///
/// Gracefully degrades:
///   - If RESEND_APITOKEN is missing: logs warning, skips email.
///   - If VAPID keys are missing: logs warning, skips push.
///   - If push subscription endpoint returns 410: logs and continues (subscription expired).
/// </summary>
public class NotificationService
{
    private readonly GameDbContext _db;
    private readonly IResend _resend;
    private readonly PushServiceClient _pushClient;
    private readonly ILogger<NotificationService> _logger;
    private readonly IConfiguration _config;

    public NotificationService(
        GameDbContext db,
        IResend resend,
        PushServiceClient pushClient,
        ILogger<NotificationService> logger,
        IConfiguration config)
    {
        _db = db;
        _resend = resend;
        _pushClient = pushClient;
        _logger = logger;
        _config = config;
    }

    /// <summary>
    /// Sends a "your turn" notification to the specified user.
    /// Checks preferences, checks idempotency via NotificationLog, then dispatches email and/or push.
    /// </summary>
    public async Task NotifyYourTurn(Guid sessionId, string userId, int turnVersion)
    {
        await SendNotification(
            sessionId: sessionId,
            userId: userId,
            turnVersion: turnVersion,
            emailChannel: "email",
            pushChannel: "push",
            emailSubject: "It's your turn!",
            emailBodyTemplate: (playerName, gameLink) =>
                $"<p>Hi {playerName},</p><p>It's your turn in your Azul game.</p><p><a href=\"{gameLink}\">Click here to play</a></p>",
            pushTitle: "Your Turn!",
            pushBody: "It's your turn in your Azul game");
    }

    /// <summary>
    /// Sends a deadline reminder notification to the specified user.
    /// Uses distinct channel names ("email-reminder", "push-reminder") for idempotency.
    /// </summary>
    public async Task SendDeadlineReminder(Guid sessionId, string userId, int turnVersion)
    {
        await SendNotification(
            sessionId: sessionId,
            userId: userId,
            turnVersion: turnVersion,
            emailChannel: "email-reminder",
            pushChannel: "push-reminder",
            emailSubject: "Deadline approaching — take your turn!",
            emailBodyTemplate: (playerName, gameLink) =>
                $"<p>Hi {playerName},</p><p>Your turn deadline is approaching in your Azul game.</p><p><a href=\"{gameLink}\">Click here to play now</a></p>",
            pushTitle: "Deadline Approaching!",
            pushBody: "Your turn deadline is approaching in your Azul game");
    }

    /// <summary>
    /// Internal dispatch method shared by NotifyYourTurn and SendDeadlineReminder.
    /// </summary>
    private async Task SendNotification(
        Guid sessionId,
        string userId,
        int turnVersion,
        string emailChannel,
        string pushChannel,
        string emailSubject,
        Func<string, string, string> emailBodyTemplate,
        string pushTitle,
        string pushBody)
    {
        // Load user preferences (default all-enabled if no row)
        var prefs = await _db.NotificationPreferences.FindAsync(userId);
        var emailEnabled = prefs?.EmailEnabled ?? true;
        var pushEnabled = prefs?.PushEnabled ?? true;

        // ── Email ────────────────────────────────────────────────────────────
        if (emailEnabled)
        {
            // Idempotency: skip if already logged
            var emailAlreadySent = await _db.NotificationLogs.AnyAsync(l =>
                l.SessionId == sessionId &&
                l.TurnVersion == turnVersion &&
                l.UserId == userId &&
                l.Channel == emailChannel);

            if (!emailAlreadySent)
            {
                await TrySendEmail(sessionId, userId, turnVersion, emailChannel, emailSubject, emailBodyTemplate);
            }
            else
            {
                _logger.LogDebug(
                    "Skipping duplicate {Channel} notification for session {SessionId} version {TurnVersion} user {UserId}",
                    emailChannel, sessionId, turnVersion, userId);
            }
        }

        // ── Push ─────────────────────────────────────────────────────────────
        if (pushEnabled)
        {
            var pushAlreadySent = await _db.NotificationLogs.AnyAsync(l =>
                l.SessionId == sessionId &&
                l.TurnVersion == turnVersion &&
                l.UserId == userId &&
                l.Channel == pushChannel);

            if (!pushAlreadySent)
            {
                await TrySendPush(sessionId, userId, turnVersion, pushChannel, pushTitle, pushBody);
            }
            else
            {
                _logger.LogDebug(
                    "Skipping duplicate {Channel} notification for session {SessionId} version {TurnVersion} user {UserId}",
                    pushChannel, sessionId, turnVersion, userId);
            }
        }
    }

    // ── Email sending ─────────────────────────────────────────────────────────

    private async Task TrySendEmail(
        Guid sessionId,
        string userId,
        int turnVersion,
        string channel,
        string subject,
        Func<string, string, string> bodyTemplate)
    {
        var apiToken = Environment.GetEnvironmentVariable("RESEND_APITOKEN");
        if (string.IsNullOrEmpty(apiToken))
        {
            _logger.LogWarning(
                "RESEND_APITOKEN not configured — skipping email notification for user {UserId} session {SessionId}",
                userId, sessionId);
            return;
        }

        try
        {
            // Look up user email via raw SQL (Better Auth user table)
            var userEmail = await GetUserEmail(userId);
            if (string.IsNullOrEmpty(userEmail))
            {
                _logger.LogWarning("No email found for user {UserId} — skipping email notification", userId);
                return;
            }

            var gameLink = $"/game/{sessionId}";
            var playerName = userEmail; // Use email as fallback display name
            var htmlBody = bodyTemplate(playerName, gameLink);

            // Use test-mode sender when using test API key
            var fromAddress = apiToken.StartsWith("re_test_", StringComparison.OrdinalIgnoreCase)
                ? "onboarding@resend.dev"
                : "BGA2 <noreply@bga2.dev>";

            var message = new EmailMessage
            {
                From = fromAddress,
                Subject = subject,
                HtmlBody = htmlBody,
            };
            message.To.Add(userEmail);

            await _resend.EmailSendAsync(message);

            // Log to NotificationLog for idempotency
            _db.NotificationLogs.Add(new NotificationLog
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                TurnVersion = turnVersion,
                UserId = userId,
                Channel = channel,
                SentAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "Email notification ({Channel}) sent to {Email} for session {SessionId} version {TurnVersion}",
                channel, userEmail, sessionId, turnVersion);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to send email notification ({Channel}) for session {SessionId} user {UserId}",
                channel, sessionId, userId);
        }
    }

    private async Task<string?> GetUserEmail(string userId)
    {
        try
        {
            var result = await _db.Database.SqlQueryRaw<string>(
                "SELECT email FROM \"user\" WHERE id = {0}", userId
            ).FirstOrDefaultAsync();
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to look up email for user {UserId}", userId);
            return null;
        }
    }

    // ── Push sending ──────────────────────────────────────────────────────────

    private async Task TrySendPush(
        Guid sessionId,
        string userId,
        int turnVersion,
        string channel,
        string title,
        string body)
    {
        var vapidPublicKey = _config["VAPID_PUBLIC_KEY"] ?? Environment.GetEnvironmentVariable("VAPID_PUBLIC_KEY");
        var vapidPrivateKey = _config["VAPID_PRIVATE_KEY"] ?? Environment.GetEnvironmentVariable("VAPID_PRIVATE_KEY");
        var vapidSubject = _config["VAPID_SUBJECT"] ?? Environment.GetEnvironmentVariable("VAPID_SUBJECT") ?? "mailto:admin@bga2.dev";

        if (string.IsNullOrEmpty(vapidPublicKey) || string.IsNullOrEmpty(vapidPrivateKey))
        {
            _logger.LogWarning(
                "VAPID keys not configured — skipping push notification for user {UserId} session {SessionId}",
                userId, sessionId);
            return;
        }

        try
        {
            var subscriptions = await _db.PushSubscriptions
                .Where(s => s.UserId == userId)
                .ToListAsync();

            if (subscriptions.Count == 0)
            {
                _logger.LogDebug("No push subscriptions found for user {UserId}", userId);
                return;
            }

            var payload = JsonSerializer.Serialize(new
            {
                title,
                body,
                url = $"/game/{sessionId}"
            });

            var vapidAuth = new VapidAuthentication(vapidPublicKey, vapidPrivateKey)
            {
                Subject = vapidSubject
            };

            foreach (var sub in subscriptions)
            {
                try
                {
                    var pushSubscription = new Lib.Net.Http.WebPush.PushSubscription();
                    pushSubscription.Endpoint = sub.Endpoint;
                    pushSubscription.SetKey(PushEncryptionKeyName.P256DH, sub.P256dh);
                    pushSubscription.SetKey(PushEncryptionKeyName.Auth, sub.Auth);

                    var pushMessage = new PushMessage(payload)
                    {
                        Topic = "your-turn",
                        TimeToLive = 86400,  // 24 hours
                        Urgency = PushMessageUrgency.High,
                    };

                    await _pushClient.RequestPushMessageDeliveryAsync(pushSubscription, pushMessage, vapidAuth);
                }
                catch (Exception ex)
                {
                    // Non-fatal: expired subscriptions return 410, log and continue
                    _logger.LogWarning(ex,
                        "Push delivery failed for subscription {SubId} user {UserId} — subscription may be expired",
                        sub.Id, userId);
                }
            }

            // Log once per user (not per subscription) for idempotency
            _db.NotificationLogs.Add(new NotificationLog
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                TurnVersion = turnVersion,
                UserId = userId,
                Channel = channel,
                SentAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "Push notification ({Channel}) sent to {Count} subscription(s) for user {UserId} session {SessionId}",
                channel, subscriptions.Count, userId, sessionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to send push notification ({Channel}) for session {SessionId} user {UserId}",
                channel, sessionId, userId);
        }
    }
}
