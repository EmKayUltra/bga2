# Phase 5: AI Game Creation Toolkit - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Local-first C# tool for ingesting rulebooks and generating deployable game packages (game.json + hooks.ts) via LLM pipeline with mandatory human review gate. Validated by shipping Hive as the second game on the platform. The tool produces game packages that run on the existing BGA2 engine — it does not modify the engine itself.

</domain>

<decisions>
## Implementation Decisions

### Rulebook Ingestion
- Accept PDF, plain text, and images (full multimodal) — many rulebooks rely on diagrams for board layouts and scoring examples
- When the LLM encounters ambiguous or contradictory rules, flag with [AMBIGUOUS] tags and a best-guess interpretation, then continue generation — reviewer resolves at the review gate
- Fallback-first rendering: generated games use colored shapes + labels (like Azul's existing fallback pieces) — art assets are an optional upgrade layered on after the game works
- Generate a comprehensive game-spec.json: every zone, piece type, turn structure, scoring rule, and edge case explicitly documented — reviewer verifies rather than writes

### Review Workflow
- Human review via generated markdown report — tool outputs a structured .md file with checklist, ambiguity flags, and full spec; reviewer edits in their preferred editor, re-runs tool to apply
- Checklist covers rule coverage PLUS flagged edge cases, ambiguous interactions, and LLM confidence notes — each item has: rule, interpretation, confidence level, [AMBIGUOUS] flag if applicable
- Edit flow: reviewer edits game-spec.json, re-runs tool, LLM regenerates game.json + hooks.ts from the corrected spec — full regeneration, no incremental patching
- Iterative review cycles: review → edit → regenerate → review again, as many times as needed — tool tracks which items are resolved vs still open

### Test Harness
- Browser-based using the existing PixiJS renderer — developer sees the actual game visually, clicks to test moves, same engine and rendering as production
- State manipulation via both scenario files (JSON describing a game state, reusable/shareable) and in-browser dev panel (buttons to advance rounds, set scores, place pieces) — dev panel can export to scenario files
- Automatic validation on each hot-reload: schema validation PLUS automated random bot playthrough — bot plays random valid moves for N rounds, catches crashes, infinite loops, invalid states
- Standalone dev tool (not embedded in the C# toolkit) — works on any game package in libs/games/*/, useful for both AI-generated and hand-built games

### Second Game: Hive
- Base Hive (5 piece types): Queen Bee, Beetle, Grasshopper, Spider, Soldier Ant — no expansions
- Two-player abstract strategy — validates mechanics Azul doesn't exercise: hex grid, spatial adjacency, piece movement (not just placement), different piece types with different movement rules
- Freeform zone approach: no pre-defined grid, pieces track their own hex coordinates, rendering calculates hex positions dynamically — validates that the engine handles dynamic/growing boards

### Claude's Discretion
- LLM provider and prompt engineering strategy
- game-spec.json schema design
- Hot-reload file watcher implementation
- Random bot playthrough depth and strategy
- Hex coordinate system (axial, cube, offset)
- S3 deployment packaging format

</decisions>

<specifics>
## Specific Ideas

- Hive's expandable hex board is a deliberate stress test — Azul has fixed zones, Hive has none until pieces are placed
- The standalone test harness doubles as a general dev tool for anyone building games on the platform, not just AI-generated ones
- The review markdown report should feel like a PR review — checklist items you can check off, not a wall of text

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `libs/games/azul/game.json`: Reference game package format — 15 zones, 6 piece defs, hook config with events array
- `libs/games/azul/src/hooks.ts`: Reference hooks implementation (~300 lines) — getValidMoves, onMove, onRoundEnd pattern
- `libs/shared-types/src/hooks.ts`: Hook contract (HookContext, HookFunctions, PlayerInfo) — all generated hooks must satisfy this interface
- Existing PixiJS renderer and viewport — test harness can reuse this directly for browser-based testing

### Established Patterns
- Game packages live in `libs/games/{game-name}/` with game.json at root and hooks.ts in src/
- Server-side hook execution via `HookExecutor.cs` using Jint JS engine — generated hooks.ts must be Jint-compatible
- Fallback rendering with shape/color/label in piece definitions — generated games use this by default
- Zone types: stack, grid, deck, discard — Hive will need freeform zone type (or creative use of existing types)

### Integration Points
- Generated game packages must load via the existing game loader in the engine
- HookExecutor.cs validates moves server-side — generated hooks.ts runs through Jint
- The test harness connects to the same engine runtime used in production
- S3 deployment (AIGC-07) packages the game for the existing game discovery system

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-ai-game-creation-toolkit*
*Context gathered: 2026-03-02*
