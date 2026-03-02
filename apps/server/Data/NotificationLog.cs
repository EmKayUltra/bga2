namespace Bga2.Server.Data;

/// <summary>
/// Idempotency log for notification sends. A unique composite index on
/// (SessionId, TurnVersion, UserId, Channel) prevents duplicate notifications
/// if the deadline checker runs more than once for the same turn.
/// </summary>
public class NotificationLog
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public int TurnVersion { get; set; }    // GameSession.Version when notification was sent
    public string UserId { get; set; } = "";
    public string Channel { get; set; } = "";   // "email" | "push"
    public DateTime SentAt { get; set; }
}
