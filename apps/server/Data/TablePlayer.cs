namespace Bga2.Server.Data;

/// <summary>
/// Player seat in a lobby table — tracks who is seated and their ready state.
/// </summary>
public class TablePlayer
{
    public Guid Id { get; set; }
    public Guid TableId { get; set; }
    public string UserId { get; set; } = "";             // Better Auth user.id
    public string DisplayName { get; set; } = "";
    public int SeatIndex { get; set; }
    public bool IsReady { get; set; }
    public DateTime JoinedAt { get; set; }
}
