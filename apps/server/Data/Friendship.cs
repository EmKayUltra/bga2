namespace Bga2.Server.Data;

/// <summary>
/// Friend request / friendship entity — used in Phase 3 plan 05 (social / friends).
/// </summary>
public class Friendship
{
    public Guid Id { get; set; }
    public string RequesterId { get; set; } = "";
    public string AddresseeId { get; set; } = "";
    public FriendshipStatus Status { get; set; } = FriendshipStatus.Pending;
    public DateTime CreatedAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
}

public enum FriendshipStatus { Pending, Accepted, Blocked }
