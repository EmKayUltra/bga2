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
    ///
    /// Note: [Timestamp] attribute is NOT used here — UseXminAsConcurrencyToken()
    /// in GameDbContext handles the xmin column mapping. Using both would cause
    /// a duplicate column mapping error at runtime.
    /// </summary>
    public uint RowVersion { get; set; }

    /// <summary>
    /// JSON array of client-generated move UUIDs (MoveId) that have been processed.
    /// Used for idempotency: if a client retries a move with the same MoveId,
    /// the server returns the cached result without reprocessing.
    ///
    /// Stored as a JSON text array (e.g. '["uuid1","uuid2",...]').
    /// Trimmed to the last 100 entries to prevent unbounded growth.
    /// </summary>
    public string PlayedMoveIds { get; set; } = "[]";

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
