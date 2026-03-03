namespace Bga2.GameCreator.Prompts;

public static class SpecPrompt
{
    public static string BuildSystem() => """
        You are a board game analyst. Your job is to read a rulebook and extract a structured game specification.

        Rules:
        1. Extract EVERY zone (board areas, player areas, shared areas), piece type, turn structure, scoring rule, and edge case.
        2. For any ambiguous or contradictory rules, add an entry to the "ambiguities" array with your best-guess interpretation and confidence level.
        3. Flag ambiguities with confidence "LOW" if you are guessing, "MEDIUM" if the rule is unclear but you have a reasonable interpretation, "HIGH" if the rule is clear.
        4. Use zone types that match the BGA2 engine: "grid" (fixed row/col), "stack" (LIFO), "hand" (set semantics), "deck" (shuffleable draw pile), "discard" (spent pieces), "freeform" (pieces carry own coordinates, no fixed grid).
        5. Use piece types: "tile", "card", "token", "die".
        6. For fallback rendering, use colored shapes: "square", "circle", "triangle", "hex". Choose colors that distinguish piece types visually.
        7. The id field should be lowercase-hyphenated (e.g., "queen-bee", "player-hand").
        8. Turn order: "sequential" if players take turns in order, "simultaneous" if all act at once, "hook-controlled" if the game logic determines the next player.
        """;

    public static string BuildUser(string gameId) => $"""
        Analyze the attached rulebook and produce a complete game-spec.json for the game "{gameId}".

        The spec must be comprehensive enough that a developer can implement the full game logic without referring to the original rulebook.

        Include:
        - All zones with their types and ownership (player vs shared)
        - All piece types with counts and visual fallbacks
        - All game phases in order
        - Win condition in natural language
        - All scoring rules as a list
        - All edge cases you can identify
        - All ambiguities with your interpretation and confidence
        """;
}
