namespace Bga2.Server.Data;

/// <summary>
/// Represents a player report filed by one user against another.
/// Reports are logged for future moderation review — no automatic action is taken.
/// Supports reporting chat messages and general user behaviour.
/// </summary>
public class PlayerReport
{
    public Guid Id { get; set; }

    /// <summary>The user who filed the report.</summary>
    public string ReporterUserId { get; set; } = "";

    /// <summary>The user who was reported.</summary>
    public string ReportedUserId { get; set; } = "";

    /// <summary>The session or table channel where the incident occurred (optional).</summary>
    public string? ChannelId { get; set; }

    /// <summary>The offending message text (optional — may be omitted for general reports).</summary>
    public string? MessageText { get; set; }

    /// <summary>Reporter's stated reason (optional free text).</summary>
    public string? Reason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
