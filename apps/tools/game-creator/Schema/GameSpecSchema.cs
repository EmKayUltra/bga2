namespace Bga2.GameCreator.Schema;

/// <summary>
/// Defines the JSON schema for game-spec.json structured output.
/// The LLM's response is constrained to this schema via Claude structured outputs.
/// </summary>
public static class GameSpecSchema
{
    /// <summary>
    /// Returns the JSON schema string for the game spec.
    /// Used as the schema parameter in Anthropic structured output requests.
    /// </summary>
    public static string GetSchemaJson()
    {
        // Return a JSON string representing the schema object.
        // This schema matches the GameConfig + ambiguity metadata shape.
        return """
        {
          "type": "object",
          "required": ["id", "title", "players", "zones", "pieces", "turnOrder", "phases", "winCondition", "scoringRules", "ambiguities"],
          "additionalProperties": false,
          "properties": {
            "id": { "type": "string", "description": "Unique game identifier (lowercase, hyphenated)" },
            "title": { "type": "string", "description": "Human-readable game title" },
            "players": {
              "type": "object",
              "required": ["min", "max"],
              "additionalProperties": false,
              "properties": {
                "min": { "type": "integer" },
                "max": { "type": "integer" }
              }
            },
            "zones": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["id", "type", "description"],
                "additionalProperties": false,
                "properties": {
                  "id": { "type": "string" },
                  "type": { "type": "string", "enum": ["grid", "stack", "hand", "deck", "discard", "freeform"] },
                  "description": { "type": "string" },
                  "owner": { "type": "string", "enum": ["player", "shared"] },
                  "capacity": { "type": "integer" },
                  "rows": { "type": "integer" },
                  "cols": { "type": "integer" }
                }
              }
            },
            "pieces": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["id", "type", "description", "count", "fallback"],
                "additionalProperties": false,
                "properties": {
                  "id": { "type": "string" },
                  "type": { "type": "string", "enum": ["tile", "card", "token", "die"] },
                  "description": { "type": "string" },
                  "count": { "type": "integer" },
                  "fallback": {
                    "type": "object",
                    "required": ["shape", "color", "label"],
                    "additionalProperties": false,
                    "properties": {
                      "shape": { "type": "string", "enum": ["square", "circle", "triangle", "hex"] },
                      "color": { "type": "string" },
                      "label": { "type": "string" }
                    }
                  },
                  "properties": {
                    "type": "object",
                    "additionalProperties": true
                  }
                }
              }
            },
            "turnOrder": { "type": "string", "enum": ["sequential", "simultaneous", "hook-controlled"] },
            "phases": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["name", "description"],
                "additionalProperties": false,
                "properties": {
                  "name": { "type": "string" },
                  "description": { "type": "string" }
                }
              }
            },
            "winCondition": { "type": "string", "description": "Natural language win condition" },
            "scoringRules": {
              "type": "array",
              "items": { "type": "string" }
            },
            "edgeCases": {
              "type": "array",
              "items": { "type": "string" }
            },
            "ambiguities": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["rule", "interpretation", "confidence"],
                "additionalProperties": false,
                "properties": {
                  "rule": { "type": "string" },
                  "interpretation": { "type": "string" },
                  "confidence": { "type": "string", "enum": ["HIGH", "MEDIUM", "LOW"] },
                  "flagged": { "type": "boolean" }
                }
              }
            }
          }
        }
        """;
    }
}
