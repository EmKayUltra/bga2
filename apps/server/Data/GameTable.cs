namespace Bga2.Server.Data;

/// <summary>
/// Lobby table entity — represents a game room players can join before starting.
/// Used in Phase 3 plan 02 (lobby flow) and beyond.
/// </summary>
public class GameTable
{
    public Guid Id { get; set; }
    public string GameId { get; set; } = "azul";
    public string HostUserId { get; set; } = "";        // Better Auth user.id (string)
    public string DisplayName { get; set; } = "";
    public int MinPlayers { get; set; } = 2;
    public int MaxPlayers { get; set; } = 4;
    public bool IsPrivate { get; set; }
    public string? PasswordHash { get; set; }
    public TableStatus Status { get; set; } = TableStatus.Waiting;
    public Guid? SessionId { get; set; }                 // FK to GameSession when game starts
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // ── Async game mode fields (Phase 4) ────────────────────────────────────
    public bool IsAsync { get; set; }
    public string? TimerMode { get; set; }              // "fast" | "normal" | "slow" | null
    public int SkipThreshold { get; set; } = 3;         // 0 = disable auto-forfeit
    public DateTime? TurnDeadline { get; set; }          // UTC deadline for current turn; null if real-time or paused
    public int ConsecutiveSkipsCurrentPlayer { get; set; }
    public bool IsPaused { get; set; }
    public string? PauseRequestedByUserId { get; set; }
}

public enum TableStatus { Waiting, Playing, Finished }
