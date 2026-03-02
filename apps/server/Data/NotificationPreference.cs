namespace Bga2.Server.Data;

/// <summary>
/// Per-user notification preferences. UserId is the primary key.
/// Defaults: both email and push enabled, reminder 4 hours before deadline.
/// </summary>
public class NotificationPreference
{
    public string UserId { get; set; } = "";                // PK — Better Auth user.id
    public bool EmailEnabled { get; set; } = true;
    public bool PushEnabled { get; set; } = true;
    public int ReminderHoursBeforeDeadline { get; set; } = 4;  // 0 = disabled
    public DateTime UpdatedAt { get; set; }
}
