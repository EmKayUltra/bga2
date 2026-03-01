using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Bga2.Server.Data;

/// <summary>
/// EF Core entity for a game session, storing state as JSONB.
/// Uses PostgreSQL xmin system column as optimistic concurrency token.
/// </summary>
public class GameSession
{
    public Guid Id { get; set; }

    /// <summary>
    /// References the game definition id (e.g. "azul").
    /// </summary>
    public string GameId { get; set; } = "azul";

    /// <summary>
    /// Game state stored as JSONB. Contains all mutable game state
    /// (pieces, scores, current player, phase, round, etc.).
    /// </summary>
    public string State { get; set; } = "{}";

    /// <summary>
    /// Application-level version counter. Incremented on each move.
    /// Separate from xmin (which is a Postgres system column).
    /// </summary>
    public int Version { get; set; }

    /// <summary>
    /// PostgreSQL xmin system column mapped as optimistic concurrency token.
    /// Auto-increments on every row UPDATE — no manual management required.
    /// EF Core will throw DbUpdateConcurrencyException if two writers race.
    /// </summary>
    [Timestamp]
    public uint RowVersion { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
