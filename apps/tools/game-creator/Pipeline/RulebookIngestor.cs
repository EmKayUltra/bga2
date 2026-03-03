namespace Bga2.GameCreator.Pipeline;

/// <summary>
/// Loads rulebook source material (PDF, text, or images) and prepares
/// content blocks for the Anthropic API.
/// </summary>
public class RulebookIngestor
{
    /// <summary>
    /// Loads a rulebook file and returns a tuple of (mediaType, content, isText) for the Anthropic API.
    /// For text files, returns the raw text directly.
    /// For binary files (PDF, images), returns base64-encoded content.
    /// </summary>
    public (string MediaType, string Content, bool IsText) Load(string filePath)
    {
        var ext = Path.GetExtension(filePath).ToLowerInvariant();
        var bytes = File.ReadAllBytes(filePath);
        var base64 = Convert.ToBase64String(bytes);

        return ext switch
        {
            ".pdf" => ("application/pdf", base64, false),
            ".png" => ("image/png", base64, false),
            ".jpg" or ".jpeg" => ("image/jpeg", base64, false),
            ".gif" => ("image/gif", base64, false),
            ".webp" => ("image/webp", base64, false),
            ".txt" or ".md" => ("text/plain", File.ReadAllText(filePath), true),
            _ => throw new ArgumentException($"Unsupported file type: {ext}. Supported: .pdf, .png, .jpg, .jpeg, .gif, .webp, .txt, .md")
        };
    }
}
