namespace Bga2.Server.Models;

/// <summary>
/// Represents a player's move request, mirroring the TypeScript Move interface
/// in shared-types. C#-side equivalent — independent types, same contract.
///
/// MoveId is a client-generated UUID (crypto.randomUUID()) for idempotency.
/// When provided, the server deduplicates retried moves — the same MoveId
/// submitted twice returns the same result without reprocessing the move.
/// </summary>
public record MoveRequest(
    string PlayerId,
    string Action,
    string? MoveId = null,    // Client-generated UUID for idempotency (network retry safety)
    string? Source = null,
    string? Target = null,
    string? PieceId = null,
    Dictionary<string, object>? Data = null
);

/// <summary>
/// A single valid move the current player can make.
/// Mirrors ValidMove from shared-types.
/// Data carries move-specific coordinate information (e.g., { "q": 0, "r": 0 }
/// for Hive placement/movement moves) so clients can submit the move directly.
/// </summary>
public record ValidMove(
    string Action,
    string? Source = null,
    string? Target = null,
    string? PieceId = null,
    string? Description = null,
    Dictionary<string, object>? Data = null
);

/// <summary>
/// Result of a move validation attempt.
/// Mirrors MoveResult from shared-types.
///
/// IsConcurrencyConflict: true when a DbUpdateConcurrencyException occurred —
/// the endpoint returns 409 Conflict instead of 400 BadRequest for this case
/// so the client can handle concurrent move collisions specifically.
/// </summary>
public record MoveResult(
    bool IsValid,
    string? NewState = null,
    List<ValidMove>? ValidMoves = null,
    List<string>? Errors = null,
    bool IsConcurrencyConflict = false,
    int? Version = null
);

/// <summary>
/// Response body for the POST /games/{gameId}/move endpoint.
/// Version is included so clients can track state progression
/// for optimistic UI updates and AppSync event ordering.
/// </summary>
public record MoveResponse(
    bool Valid,
    string? State,
    List<ValidMove>? ValidMoves,
    List<string>? Errors,
    int? Version = null
);

/// <summary>
/// Response body for the POST /games endpoint (create game session).
/// </summary>
public record CreateGameResponse(Guid SessionId, string GameId, int Version);

/// <summary>
/// Response body for the GET /games/{sessionId}/state endpoint.
/// </summary>
public record GameStateResponse(
    Guid SessionId,
    string GameId,
    string State,
    int Version,
    List<ValidMove>? ValidMoves
);
