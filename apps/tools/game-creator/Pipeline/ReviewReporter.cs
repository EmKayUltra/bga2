using System.Text;
using System.Text.Json;

namespace Bga2.GameCreator.Pipeline;

/// <summary>
/// Generates a human-reviewable markdown report from a game-spec.json.
/// The report contains a checklist of zones, pieces, phases, scoring rules, edge cases,
/// and an ambiguities table with [AMBIGUOUS] flags and confidence levels.
/// </summary>
public class ReviewReporter
{
    /// <summary>
    /// Generates a markdown review report from the game spec JSON.
    /// </summary>
    /// <param name="specJson">The game-spec.json content</param>
    /// <param name="gameId">The game identifier for context</param>
    /// <param name="cycleNumber">The review cycle number (for iterative reviews)</param>
    /// <returns>Markdown report content</returns>
    public string GenerateReport(string specJson, string gameId, int cycleNumber = 1)
    {
        var spec = JsonSerializer.Deserialize<JsonElement>(specJson);
        var sb = new StringBuilder();

        var title = spec.TryGetProperty("title", out var titleEl) ? titleEl.GetString() ?? gameId : gameId;
        var winCondition = spec.TryGetProperty("winCondition", out var wcEl) ? wcEl.GetString() ?? "Not specified" : "Not specified";

        sb.AppendLine($"# Game Review: {title}");
        sb.AppendLine();

        // Zones checklist
        sb.AppendLine("## Checklist");
        sb.AppendLine();
        sb.AppendLine("### Zones");
        if (spec.TryGetProperty("zones", out var zones) && zones.ValueKind == JsonValueKind.Array)
        {
            foreach (var zone in zones.EnumerateArray())
            {
                var id = zone.TryGetProperty("id", out var zid) ? zid.GetString() ?? "?" : "?";
                var type = zone.TryGetProperty("type", out var zt) ? zt.GetString() ?? "?" : "?";
                var desc = zone.TryGetProperty("description", out var zd) ? zd.GetString() ?? "" : "";
                var owner = zone.TryGetProperty("owner", out var zo) ? $" ({zo.GetString()})" : "";
                sb.AppendLine($"- [ ] `{id}` ({type}{owner}) — {desc}");
            }
        }
        else
        {
            sb.AppendLine("- [ ] *(no zones defined)*");
        }
        sb.AppendLine();

        // Pieces checklist
        sb.AppendLine("### Pieces");
        if (spec.TryGetProperty("pieces", out var pieces) && pieces.ValueKind == JsonValueKind.Array)
        {
            foreach (var piece in pieces.EnumerateArray())
            {
                var id = piece.TryGetProperty("id", out var pid) ? pid.GetString() ?? "?" : "?";
                var type = piece.TryGetProperty("type", out var pt) ? pt.GetString() ?? "?" : "?";
                var count = piece.TryGetProperty("count", out var pc) ? pc.GetInt32().ToString() : "?";
                var desc = piece.TryGetProperty("description", out var pd) ? pd.GetString() ?? "" : "";
                sb.AppendLine($"- [ ] `{id}` ({type}, count: {count}) — {desc}");
            }
        }
        else
        {
            sb.AppendLine("- [ ] *(no pieces defined)*");
        }
        sb.AppendLine();

        // Phases checklist
        sb.AppendLine("### Phases");
        if (spec.TryGetProperty("phases", out var phases) && phases.ValueKind == JsonValueKind.Array)
        {
            foreach (var phase in phases.EnumerateArray())
            {
                var name = phase.TryGetProperty("name", out var pn) ? pn.GetString() ?? "?" : "?";
                var desc = phase.TryGetProperty("description", out var pd) ? pd.GetString() ?? "" : "";
                sb.AppendLine($"- [ ] **{name}** — {desc}");
            }
        }
        else
        {
            sb.AppendLine("- [ ] *(no phases defined)*");
        }
        sb.AppendLine();

        // Scoring rules checklist
        sb.AppendLine("### Scoring Rules");
        if (spec.TryGetProperty("scoringRules", out var scoring) && scoring.ValueKind == JsonValueKind.Array)
        {
            foreach (var rule in scoring.EnumerateArray())
            {
                sb.AppendLine($"- [ ] {rule.GetString() ?? "?"}");
            }
        }
        else
        {
            sb.AppendLine("- [ ] *(no scoring rules defined)*");
        }
        sb.AppendLine();

        // Edge cases checklist
        if (spec.TryGetProperty("edgeCases", out var edgeCases) && edgeCases.ValueKind == JsonValueKind.Array && edgeCases.GetArrayLength() > 0)
        {
            sb.AppendLine("### Edge Cases");
            foreach (var edge in edgeCases.EnumerateArray())
            {
                sb.AppendLine($"- [ ] {edge.GetString() ?? "?"}");
            }
            sb.AppendLine();
        }

        // Ambiguities table
        sb.AppendLine("## Ambiguities & Flags");
        sb.AppendLine();
        if (spec.TryGetProperty("ambiguities", out var ambiguities) && ambiguities.ValueKind == JsonValueKind.Array && ambiguities.GetArrayLength() > 0)
        {
            sb.AppendLine("| # | Rule | Interpretation | Confidence | Status |");
            sb.AppendLine("|---|------|----------------|------------|--------|");
            var i = 1;
            foreach (var amb in ambiguities.EnumerateArray())
            {
                var rule = amb.TryGetProperty("rule", out var ar) ? ar.GetString() ?? "?" : "?";
                var interp = amb.TryGetProperty("interpretation", out var ai) ? ai.GetString() ?? "?" : "?";
                var confidence = amb.TryGetProperty("confidence", out var ac) ? ac.GetString() ?? "?" : "?";
                var flagged = amb.TryGetProperty("flagged", out var af) && af.GetBoolean();
                var status = flagged ? "**[AMBIGUOUS]**" : "OK";
                sb.AppendLine($"| {i++} | {EscapeTable(rule)} | {EscapeTable(interp)} | {confidence} | {status} |");
            }
        }
        else
        {
            sb.AppendLine("*No ambiguities flagged.*");
        }
        sb.AppendLine();

        // Win condition
        sb.AppendLine("## Win Condition");
        sb.AppendLine();
        sb.AppendLine(winCondition);
        sb.AppendLine();

        sb.AppendLine("---");
        sb.AppendLine("*Generated by BGA2 Game Creator*");
        sb.AppendLine($"*Review cycle: {cycleNumber}*");

        return sb.ToString();
    }

    private static string EscapeTable(string s) => s.Replace("|", "\\|").Replace("\n", " ").Replace("\r", "");
}
