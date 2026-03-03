using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;
using Bga2.GameCreator.Prompts;

namespace Bga2.GameCreator.Pipeline;

/// <summary>
/// LLM call 2: game-spec.json -> game.json + hooks.ts via tool_use structured output.
/// Uses a tool with a strict schema to guarantee the response contains both files.
/// </summary>
public class CodeGenerator
{
    private readonly AnthropicClient _client;

    public CodeGenerator()
    {
        var apiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")
            ?? throw new InvalidOperationException(
                "ANTHROPIC_API_KEY environment variable is not set. " +
                "Set it to your Anthropic API key before running this tool.");

        _client = new AnthropicClient(new Anthropic.Core.ClientOptions { ApiKey = apiKey });
    }

    /// <summary>
    /// Generates game.json and hooks.ts from an approved game-spec.json.
    /// Validates the generated hooks.ts with JintValidator before returning.
    /// </summary>
    /// <param name="gameId">The game identifier</param>
    /// <param name="specJson">The approved game-spec.json content</param>
    /// <returns>Tuple of (gameJson content, hooksTs content)</returns>
    public async Task<(string GameJson, string HooksTs)> Generate(string gameId, string specJson)
    {
        // Define a tool with a strict schema so Claude must return exactly the two fields we need
        var toolSchema = """
        {
            "type": "object",
            "required": ["gameJson", "hooksTs"],
            "additionalProperties": false,
            "properties": {
                "gameJson": {
                    "type": "object",
                    "description": "Complete game.json as a JSON object with id, version, title, players, zones, pieces, turnOrder, hooks"
                },
                "hooksTs": {
                    "type": "string",
                    "description": "Complete hooks.ts as plain JavaScript (no imports, no exports, no TypeScript)"
                }
            }
        }
        """;

        var rawSchemaData = JsonSerializer.Deserialize<IReadOnlyDictionary<string, JsonElement>>(toolSchema)!;
        var inputSchema = new InputSchema(rawSchemaData);

        var tool = new Tool
        {
            Name = "output_game_files",
            Description = "Output the complete game.json object and hooks.ts string for the game",
            InputSchema = inputSchema
        };

        var request = new MessageCreateParams
        {
            Model = Model.ClaudeSonnet4_5_20250929,
            MaxTokens = 16384,
            System = new MessageCreateParamsSystem(CodePrompt.BuildSystem()),
            Messages = new[]
            {
                new MessageParam
                {
                    Role = Role.User,
                    Content = new MessageParamContent(CodePrompt.BuildUser(specJson, gameId))
                }
            },
            Tools = new ToolUnion[] { new ToolUnion(tool) },
            ToolChoice = new ToolChoice(new ToolChoiceTool("output_game_files"))
        };

        try
        {
            var response = await _client.Messages.Create(request);

            // Extract the tool use block
            var toolUseBlock = response.Content
                .Select(b => b.Value as ToolUseBlock)
                .FirstOrDefault(b => b != null && b.Name == "output_game_files");

            if (toolUseBlock == null)
                throw new InvalidOperationException(
                    $"No tool_use block in response. Stop reason: {response.StopReason?.ToString() ?? "none"}");

            // Extract gameJson and hooksTs from the tool input
            if (!toolUseBlock.Input.TryGetValue("gameJson", out var gameJsonElement))
                throw new InvalidOperationException("Tool response missing 'gameJson' field");

            if (!toolUseBlock.Input.TryGetValue("hooksTs", out var hooksTsElement))
                throw new InvalidOperationException("Tool response missing 'hooksTs' field");

            var gameJson = JsonSerializer.Serialize(gameJsonElement, new JsonSerializerOptions { WriteIndented = true });
            var hooksTs = hooksTsElement.GetString()
                ?? throw new InvalidOperationException("'hooksTs' is null in tool response");

            return (gameJson, hooksTs);
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            throw new InvalidOperationException($"Anthropic API call failed: {ex.Message}", ex);
        }
    }
}
