namespace Bga2.Server.Data;

/// <summary>
/// Match result entity — records per-player outcome of each completed game.
/// Used in Phase 3 plan 03 (match history / leaderboard).
/// </summary>
public class MatchResult
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public string UserId { get; set; } = "";
    public string GameId { get; set; } = "";
    public bool Won { get; set; }
    public int Score { get; set; }
    public int Rank { get; set; }
    public int PlayerCount { get; set; }
    public DateTime CompletedAt { get; set; }
}
