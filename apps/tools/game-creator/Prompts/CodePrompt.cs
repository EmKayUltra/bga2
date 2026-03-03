namespace Bga2.GameCreator.Prompts;

public static class CodePrompt
{
    public static string BuildSystem() => """
        You are a board game engine programmer. You generate game hook implementations for the BGA2 engine.

        CRITICAL CONSTRAINTS — generated code runs in Jint (JavaScript engine for .NET):
        1. NO import statements, NO export statements, NO ES module syntax
        2. NO TypeScript type annotations — write plain JavaScript only
        3. NO async/await, NO Promises, NO fetch, NO require
        4. Use only ES5/ES6 compatible JavaScript — var, function declarations, for loops, if/else
        5. console.log/warn/error exist but do nothing (shimmed)
        6. Functions MUST be named: getValidMoves(ctx), onMove(ctx, move), onRoundEnd(ctx)
        7. All three functions MUST mutate ctx.state in place — NEVER reassign ctx.state
        8. Reference zones as: ctx.state.zones["zone-id"].pieces (array of piece objects)
        9. Reference player state as: ctx.state.players[ctx.state.currentPlayerIndex]
        10. Each piece has: { id, defId, zoneId } — defId references the piece definition
        11. Move object has: { playerId, action, source, target, pieceId, data }
        12. ValidMove has: { action, source, target, pieceId, description }

        HOOK CONTRACT:
        - getValidMoves(ctx): Return array of ValidMove objects for the current player
        - onMove(ctx, move): Apply the move to ctx.state (mutate in place)
        - onRoundEnd(ctx): Handle scoring, board reset, phase transitions at round end

        REFERENCE — Azul hooks structure (simplified):
        ```
        var WALL_PATTERN = [...]; // game constants
        function getValidMoves(ctx) {
          var moves = [];
          // iterate sources, check validity, push to moves
          return moves;
        }
        function onMove(ctx, move) {
          // mutate ctx.state based on move.action, move.source, move.target, move.data
          // advance turn: ctx.state.currentPlayerIndex = (idx + 1) % ctx.state.players.length;
          // detect phase change: ctx.state.phase = "next-phase";
        }
        function onRoundEnd(ctx) {
          // scoring, cleanup, next round setup
          // end game: ctx.state.finished = true; ctx.state.winnerId = "player-X";
        }
        ```
        """;

    public static string BuildUser(string specJson, string gameId) => $"""
        Generate TWO files for the game "{gameId}" based on the following game spec:

        GAME SPEC:
        {specJson}

        OUTPUT FORMAT — respond with a JSON object containing two fields:
        1. "gameJson": The complete game.json content as a JSON object (NOT a string). Must include: id, version ("1.0.0"), title, players (min/max), zones (with id, type, capacity, owner, position, render), pieces (with id, type, fallback), turnOrder, hooks (file: "hooks.ts", events: ["getValidMoves", "onMove", "onRoundEnd"]).
        2. "hooksTs": The complete hooks.ts content as a plain string. Must satisfy ALL Jint constraints listed above. NO imports, NO exports, NO TypeScript.

        For zones with owner "player", use the id pattern "player-zone-name" — the server instantiates per-player copies as "player-0-zone-name", "player-1-zone-name", etc.

        For piece fallbacks, use distinct colors and shapes so pieces are visually distinguishable with the default renderer.
        """;
}
