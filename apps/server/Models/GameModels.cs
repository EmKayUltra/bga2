namespace Bga2.Server.Models;

/// <summary>
/// Represents a player's move request, mirroring the TypeScript Move interface
/// in shared-types. C#-side equivalent — independent types, same contract.
/// </summary>
public record MoveRequest(
    string PlayerId,
    string Action,
    string? Source = null,
    string? Target = null,
    string? PieceId = null,
    Dictionary<string, object>? Data = null
);

/// <summary>
/// A single valid move the current player can make.
/// Mirrors ValidMove from shared-types.
/// </summary>
public record ValidMove(
    string Action,
    string? Source = null,
    string? Target = null,
    string? PieceId = null,
    string? Description = null
);

/// <summary>
/// Result of a move validation attempt.
/// Mirrors MoveResult from shared-types.
/// </summary>
public record MoveResult(
    bool IsValid,
    string? NewState = null,
    List<ValidMove>? ValidMoves = null,
    List<string>? Errors = null
);

/// <summary>
/// Response body for the POST /games/{gameId}/move endpoint.
/// </summary>
public record MoveResponse(
    bool Valid,
    string? State,
    List<ValidMove>? ValidMoves,
    List<string>? Errors
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
