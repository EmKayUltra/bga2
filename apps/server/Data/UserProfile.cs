namespace Bga2.Server.Data;

/// <summary>
/// Profile extension entity — stores avatar choice and privacy setting for a user.
/// Extends Better Auth's `user` table (which manages id/email/name/username).
/// UserId is the primary key and references Better Auth's user.id (string).
/// </summary>
public class UserProfile
{
    /// <summary>Primary key — references Better Auth user.id</summary>
    public string UserId { get; set; } = "";

    /// <summary>Preset avatar identifier (e.g. "knight", "wizard"). Defaults to "default".</summary>
    public string Avatar { get; set; } = "default";

    /// <summary>Whether this profile is visible to other users. Defaults to true.</summary>
    public bool IsPublic { get; set; } = true;

    /// <summary>Tracks when username was last changed — used to enforce 30-day cooldown.</summary>
    public DateTime? UsernameChangedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
