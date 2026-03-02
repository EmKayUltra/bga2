using System.Text;
using System.Text.Json;

namespace Bga2.Server.Services;

/// <summary>
/// Publishes game state updates to AWS AppSync Events via HTTP.
///
/// AppSync Events provides a WebSocket pub/sub channel that clients subscribe to
/// for real-time game state updates. This publisher is called after every successful
/// move to broadcast the new state to all connected players.
///
/// Graceful degradation: if AppSync is not configured (no endpoint/apiKey), the
/// publisher logs a warning and returns without error. The game works via REST
/// polling — real-time is an enhancement, not a requirement.
/// </summary>
public class AppSyncPublisher
{
    private readonly IHttpClientFactory _factory;
    private readonly IConfiguration _config;
    private readonly ILogger<AppSyncPublisher> _logger;

    public AppSyncPublisher(IHttpClientFactory factory, IConfiguration config, ILogger<AppSyncPublisher> logger)
    {
        _factory = factory;
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Publish game state update to /game/{sessionId}/state channel.
    ///
    /// Called after a move is validated and saved to the database.
    /// Errors are caught and logged — a publish failure does NOT fail the move
    /// response (REST response already confirmed success).
    /// </summary>
    public async Task PublishGameState(Guid sessionId, string stateJson, int version)
    {
        var endpoint = _config["AppSync:HttpEndpoint"];
        var apiKey = _config["AppSync:ApiKey"];

        if (string.IsNullOrEmpty(endpoint) || string.IsNullOrEmpty(apiKey))
        {
            _logger.LogDebug("AppSync not configured — skipping real-time publish for session {SessionId}", sessionId);
            return; // Graceful degradation: game works without real-time, just needs page refresh
        }

        // The event payload is a JSON string containing state and version
        var eventPayload = JsonSerializer.Serialize(new { state = stateJson, version });

        // AppSync Events HTTP endpoint format: POST {endpoint}/event
        var body = JsonSerializer.Serialize(new
        {
            channel = $"/game/{sessionId}/state",
            events = new[] { eventPayload }
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/event");
        request.Headers.Add("x-api-key", apiKey);
        request.Content = new StringContent(body, Encoding.UTF8, "application/json");

        try
        {
            var client = _factory.CreateClient("AppSync");
            var response = await client.SendAsync(request);
            response.EnsureSuccessStatusCode();
            _logger.LogDebug("Published state to AppSync for session {SessionId} version {Version}", sessionId, version);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish state to AppSync for session {SessionId}", sessionId);
            // Don't throw — real-time is best-effort; REST response already confirmed move
        }
    }
}
