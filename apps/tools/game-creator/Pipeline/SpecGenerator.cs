using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;
using Bga2.GameCreator.Prompts;
using Bga2.GameCreator.Schema;

namespace Bga2.GameCreator.Pipeline;

/// <summary>
/// LLM call 1: rulebook -> game-spec.json via Claude structured output.
/// Uses OutputConfig.Format (JsonOutputFormat) for schema-constrained JSON output.
/// </summary>
public class SpecGenerator
{
    private readonly AnthropicClient _client;

    public SpecGenerator()
    {
        var apiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")
            ?? throw new InvalidOperationException(
                "ANTHROPIC_API_KEY environment variable is not set. " +
                "Set it to your Anthropic API key before running this tool.");

        _client = new AnthropicClient(new Anthropic.Core.ClientOptions { ApiKey = apiKey });
    }

    /// <summary>
    /// Generates a game-spec.json from a rulebook file.
    /// </summary>
    /// <param name="gameId">The game identifier (e.g., "hive")</param>
    /// <param name="mediaType">The media type of the rulebook (e.g., "application/pdf")</param>
    /// <param name="content">The file content — base64 for binary, raw text for text files</param>
    /// <param name="isText">True if content is raw text, false if base64-encoded</param>
    /// <returns>The game-spec.json as a formatted JSON string</returns>
    public async Task<string> GenerateSpec(string gameId, string mediaType, string content, bool isText)
    {
        var schemaJson = GameSpecSchema.GetSchemaJson();
        var schema = JsonSerializer.Deserialize<IReadOnlyDictionary<string, JsonElement>>(schemaJson)
            ?? throw new InvalidOperationException("Failed to parse game spec schema");

        // Build content blocks for the user message
        ContentBlockParam[] contentBlocks;

        if (isText)
        {
            // Text files: include as a text block
            contentBlocks = new[]
            {
                new ContentBlockParam(new TextBlockParam($"RULEBOOK CONTENT:\n\n{content}")),
                new ContentBlockParam(new TextBlockParam(SpecPrompt.BuildUser(gameId)))
            };
        }
        else if (mediaType == "application/pdf")
        {
            // PDF: use DocumentBlockParam with Base64PdfSource and cache_control for re-runs
            var pdfSource = new Base64PdfSource(content);
            var docSource = new DocumentBlockParamSource(pdfSource);
            var docBlock = new DocumentBlockParam(docSource)
            {
                Title = $"Rulebook for {gameId}",
                CacheControl = new CacheControlEphemeral()
            };
            contentBlocks = new[]
            {
                new ContentBlockParam(docBlock),
                new ContentBlockParam(new TextBlockParam(SpecPrompt.BuildUser(gameId)))
            };
        }
        else
        {
            // Images: use ImageBlockParam with Base64ImageSource
            var imageMediaType = mediaType switch
            {
                "image/png" => MediaType.ImagePng,
                "image/jpeg" => MediaType.ImageJpeg,
                "image/gif" => MediaType.ImageGif,
                "image/webp" => MediaType.ImageWebP,
                _ => throw new ArgumentException($"Unsupported image media type: {mediaType}")
            };
            var imageSource = new Base64ImageSource { Data = content, MediaType = imageMediaType };
            var imageBlockSource = new ImageBlockParamSource(imageSource);
            var imageBlock = new ImageBlockParam(imageBlockSource)
            {
                CacheControl = new CacheControlEphemeral()
            };
            contentBlocks = new[]
            {
                new ContentBlockParam(imageBlock),
                new ContentBlockParam(new TextBlockParam(SpecPrompt.BuildUser(gameId)))
            };
        }

        var request = new MessageCreateParams
        {
            Model = Model.ClaudeSonnet4_5_20250929,
            MaxTokens = 8192,
            System = new MessageCreateParamsSystem(SpecPrompt.BuildSystem()),
            Messages = new[]
            {
                new MessageParam
                {
                    Role = Role.User,
                    Content = new MessageParamContent(contentBlocks)
                }
            },
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat { Schema = schema }
            }
        };

        try
        {
            var response = await _client.Messages.Create(request);
            var textBlock = response.Content
                .Select(b => b.Value as TextBlock)
                .FirstOrDefault(b => b != null);

            if (textBlock == null)
                throw new InvalidOperationException(
                    $"No text content in response. Stop reason: {response.StopReason?.ToString() ?? "none"}");

            // Pretty-print the JSON for human readability
            var parsed = JsonSerializer.Deserialize<JsonElement>(textBlock.Text);
            return JsonSerializer.Serialize(parsed, new JsonSerializerOptions { WriteIndented = true });
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            throw new InvalidOperationException($"Anthropic API call failed: {ex.Message}", ex);
        }
    }
}
