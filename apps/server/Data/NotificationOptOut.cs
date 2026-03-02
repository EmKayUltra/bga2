namespace Bga2.Server.Data;

/// <summary>
/// Per-game notification opt-out. When present, no notifications sent for this table.
/// </summary>
public class NotificationOptOut
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = "";
    public Guid TableId { get; set; }
    public DateTime CreatedAt { get; set; }
}
