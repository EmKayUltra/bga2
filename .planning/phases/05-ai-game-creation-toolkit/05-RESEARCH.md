# Phase 5: AI Game Creation Toolkit - Research

**Researched:** 2026-03-02
**Domain:** LLM-driven game generation pipeline, C# CLI tooling, browser-based test harness, Hive hex-grid game
**Confidence:** MEDIUM (LLM generation accuracy is LOW until pilot validates it; all other areas HIGH/MEDIUM)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rulebook Ingestion**
- Accept PDF, plain text, and images (full multimodal) — many rulebooks rely on diagrams for board layouts and scoring examples
- When the LLM encounters ambiguous or contradictory rules, flag with [AMBIGUOUS] tags and a best-guess interpretation, then continue generation — reviewer resolves at the review gate
- Fallback-first rendering: generated games use colored shapes + labels (like Azul's existing fallback pieces) — art assets are an optional upgrade layered on after the game works
- Generate a comprehensive game-spec.json: every zone, piece type, turn structure, scoring rule, and edge case explicitly documented — reviewer verifies rather than writes

**Review Workflow**
- Human review via generated markdown report — tool outputs a structured .md file with checklist, ambiguity flags, and full spec; reviewer edits in their preferred editor, re-runs tool to apply
- Checklist covers rule coverage PLUS flagged edge cases, ambiguous interactions, and LLM confidence notes — each item has: rule, interpretation, confidence level, [AMBIGUOUS] flag if applicable
- Edit flow: reviewer edits game-spec.json, re-runs tool, LLM regenerates game.json + hooks.ts from the corrected spec — full regeneration, no incremental patching
- Iterative review cycles: review → edit → regenerate → review again, as many times as needed — tool tracks which items are resolved vs still open

**Test Harness**
- Browser-based using the existing PixiJS renderer — developer sees the actual game visually, clicks to test moves, same engine and rendering as production
- State manipulation via both scenario files (JSON describing a game state, reusable/shareable) and in-browser dev panel (buttons to advance rounds, set scores, place pieces) — dev panel can export to scenario files
- Automatic validation on each hot-reload: schema validation PLUS automated random bot playthrough — bot plays random valid moves for N rounds, catches crashes, infinite loops, invalid states
- Standalone dev tool (not embedded in the C# toolkit) — works on any game package in libs/games/*/, useful for both AI-generated and hand-built games

**Second Game: Hive**
- Base Hive (5 piece types): Queen Bee, Beetle, Grasshopper, Spider, Soldier Ant — no expansions
- Two-player abstract strategy — validates mechanics Azul doesn't exercise: hex grid, spatial adjacency, piece movement (not just placement), different piece types with different movement rules
- Freeform zone approach: no pre-defined grid, pieces track their own hex coordinates, rendering calculates hex positions dynamically — validates that the engine handles dynamic/growing boards
- Freeform zone approach: no pre-defined grid, pieces track their own hex coordinates, rendering calculates hex positions dynamically

### Claude's Discretion
- LLM provider and prompt engineering strategy
- game-spec.json schema design
- Hot-reload file watcher implementation
- Random bot playthrough depth and strategy
- Hex coordinate system (axial, cube, offset)
- S3 deployment packaging format

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIGC-01 | Local C# tool ingests rulebook (PDF/text) and art assets | Anthropic official C# SDK (`Anthropic` NuGet package); PDF support via direct base64 or Files API; PdfPig for local text extraction pre-flight |
| AIGC-02 | LLM generates human-reviewable game spec (structured JSON) from source materials | Claude structured outputs (GA, `output_config.format`); two-stage pipeline: spec-gen → review report |
| AIGC-03 | LLM generates game.json + hooks.ts from approved spec | Second structured-output call; must produce Jint-compatible JS from the spec; validate against shared-types schema |
| AIGC-04 | Hot-reload test harness with file watcher and local engine | Chokidar v4/v5 or Node's native fs.watch; Vite HMR `handleHotUpdate`; standalone SvelteKit dev route |
| AIGC-05 | Game state manipulation for testing specific scenarios (jump to any state) | Scenario JSON files + in-browser dev panel; same pattern as existing DevEndpoints.cs for server-side mutation |
| AIGC-06 | Human review gate with structured checklist and discrepancy report | Markdown report generated from game-spec.json; [AMBIGUOUS] tags propagated from LLM; iterative cycle tracking |
| AIGC-07 | Package and deploy game bundle to S3 | AWS S3 SDK for .NET; zip game.json + hooks.js; optional CDK stack or direct SDK upload |
</phase_requirements>

---

## Summary

Phase 5 builds a local-first C# CLI tool that runs a two-stage LLM pipeline: first it extracts a structured `game-spec.json` from a rulebook (PDF, text, or images), then it generates `game.json` + `hooks.ts` from the approved spec. A separate browser-based test harness (a standalone SvelteKit route) runs the generated game on the live PixiJS renderer with hot-reload, scenario injection, and a random-bot validation pass. The phase is validated by shipping Hive as the second game on the platform.

The biggest technical risk is LLM generation accuracy for `hooks.ts`. The existing `HookExecutor.cs` pipeline already strips TypeScript annotations and runs hooks through Jint — generated code must be Jint-compatible (no ES modules, no `import`/`export`, no modern JS features that Jint 3.x does not support). STATE.md explicitly calls this out as MEDIUM confidence and recommends a pilot using Azul's existing hooks before building the full toolkit. That pilot should be Wave 0 of planning.

The Hive hex-grid is genuinely novel for this engine. The current zone types (`grid`, `stack`, `hand`, `deck`, `discard`) do not cover a freeform expanding board. The freeform zone type must be designed carefully: pieces carry `(q, r)` axial coordinates in their `data` field, and the renderer calculates pixel positions dynamically. This is a deliberate engine extension — not just a game configuration.

**Primary recommendation:** Run an Azul-hooks LLM pilot (one API call reproducing `hooks.ts` from Azul's rulebook) before committing to the full toolkit architecture. Use the result to set realistic scope for what the review cycle can fix.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Anthropic` (NuGet) | 12.x | Official Anthropic C# SDK — messages, structured outputs, vision/PDF | Now the official SDK (v10+); previously unofficial. Direct API support, no extra HTTP plumbing. |
| `PdfPig` (NuGet) | 0.1.13 | PDF text extraction for pre-processing / fallback | Apache 2.0, pure .NET, no native deps; preferred for text extraction over iText (AGPL). |
| Anthropic Structured Outputs | GA | Schema-constrained JSON generation | Compiles JSON schema into grammar; guarantees valid JSON — no retry loops needed. Available on Opus 4.6, Sonnet 4.6, Haiku 4.5. |
| chokidar | 4.x (CJS/ESM) | File watcher for test harness hot-reload | Standard file-watch in Node/Vite ecosystem; v4 reduced deps to 1; v5 is ESM-only (requires Node 20). Use v4 for compatibility. |
| Vite `handleHotUpdate` | Vite 5 | Trigger HMR when game package files change | Native Vite hook; registered in a custom Vite plugin inside the test harness SvelteKit app. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AWSSDK.S3` (NuGet) | 3.7.x | S3 deployment for AIGC-07 | Direct SDK upload of game bundle zip; no CDK needed for a CLI tool. |
| `System.CommandLine` (NuGet) | 2.x beta | CLI argument parsing for the C# tool | Microsoft-maintained; replaces hand-rolled arg parsing. |
| `Markdig` (NuGet) | 0.37 | Optional: render review markdown in-terminal | Only needed if you want pretty terminal output; not required. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Official `Anthropic` SDK | `Anthropic.SDK` (tghamm, unofficial) | Official SDK is now the standard; unofficial had broader adoption before v10. Use official. |
| PdfPig | iText 7 | iText is AGPL — requires commercial license for closed tools; PdfPig is Apache 2.0 |
| Claude native PDF support | PdfPig → text → LLM | Claude's native PDF vision is better for diagram-heavy rulebooks; PdfPig is a fallback for large (>32MB or >100 page) documents |
| chokidar v5 (ESM-only) | chokidar v4 | v5 requires Node 20 and ESM; v4 is simpler with CJS compat. Use v4 unless monorepo already on Node 20 ESM. |
| Direct S3 SDK | CDK stack | CDK adds CloudFormation overhead for a CLI tool; direct SDK upload is simpler and sufficient |

**Installation:**

```bash
# C# CLI project (new standalone project in apps/tools/game-creator/)
dotnet add package Anthropic
dotnet add package PdfPig
dotnet add package AWSSDK.S3
dotnet add package System.CommandLine --prerelease

# Test harness (SvelteKit app or existing client dev route)
npm install chokidar@4
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/
  tools/
    game-creator/           # Standalone C# CLI tool
      game-creator.csproj
      Commands/
        IngestCommand.cs    # Phase 1: PDF → game-spec.json
        GenerateCommand.cs  # Phase 2: game-spec.json → game.json + hooks.ts
        DeployCommand.cs    # AIGC-07: package and upload to S3
      Pipeline/
        RulebookIngestor.cs # PDF/text/image loading and base64 encoding
        SpecGenerator.cs    # LLM call 1: rulebook → game-spec.json
        CodeGenerator.cs    # LLM call 2: spec → game.json + hooks.ts
        ReviewReporter.cs   # Markdown report generation from spec
      Schema/
        GameSpecSchema.cs   # game-spec.json JSON schema for structured output
      Deployment/
        S3Packager.cs       # Zip and upload game bundle

apps/
  client/
    src/
      routes/
        dev/
          harness/          # Standalone test harness (new SvelteKit route)
            +page.svelte    # Browser-based game runner with dev panel
            harness.ts      # Scenario loader, bot runner, state manipulation
          +layout.svelte    # Dev-only layout (no auth required)

libs/
  games/
    hive/                   # Second game — generated then hand-corrected
      game.json
      src/
        hooks.ts
        hex.ts              # Axial coordinate utilities
```

### Pattern 1: Two-Stage LLM Pipeline

**What:** Call Claude twice — first to extract a human-readable spec, second to generate code from the spec. Never generate code directly from the raw rulebook.

**When to use:** Always. The spec is the human review gate. Without it, reviewers must read generated code, not rules.

**Example (C# — LLM call 1, structured output):**
```csharp
// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
// Source: https://github.com/anthropics/anthropic-sdk-csharp
using Anthropic;
using Anthropic.Models.Messages;

var client = new AnthropicClient(); // reads ANTHROPIC_API_KEY from env

var pdfBytes = File.ReadAllBytes(rulebookPath);
var pdfBase64 = Convert.ToBase64String(pdfBytes);

var response = await client.Messages.Create(new MessageCreateParams
{
    Model = Model.ClaudeOpus4_6_20250929, // or Sonnet 4.6 for cost
    MaxTokens = 8192,
    OutputConfig = new OutputConfig
    {
        Format = new OutputFormat
        {
            Type = "json_object",   // structured output mode
            Schema = GameSpecJsonSchema.GetSchema()
        }
    },
    Messages =
    [
        new()
        {
            Role = Role.User,
            Content =
            [
                new ContentBlock
                {
                    Type = "document",
                    Source = new DocumentSource
                    {
                        Type = "base64",
                        MediaType = "application/pdf",
                        Data = pdfBase64
                    }
                },
                new ContentBlock
                {
                    Type = "text",
                    Text = SpecGeneratorPrompt.Build(gameId)
                }
            ]
        }
    ]
});

var specJson = response.Content[0].Text; // guaranteed valid JSON
```

### Pattern 2: Jint-Compatible Hook Generation

**What:** The second LLM call generates `hooks.ts` content, but it must produce code that `HookExecutor.cs` can execute via Jint 3.x.

**Critical Jint constraints (from existing `StripTypeScriptAnnotations` in `HookExecutor.cs`):**
- No ES module `import`/`export` statements (stripped by regex)
- No `export const` — use `var` or function declarations (regex converts `export const` → `var`)
- No TypeScript-specific syntax (interfaces, type aliases, generics — all stripped by regex)
- No Promise/async/await (Jint 3 has limited async support)
- No `fetch`, `require`, or I/O — pure data transformation only
- `console.log/warn/error` are shimmed but do nothing

**When to use:** Always for generated hooks. The prompt must include these Jint constraints explicitly.

**LLM prompt pattern for code generation:**
```
Generate a hooks.ts file for [game] that satisfies these constraints:
1. Functions must be: getValidMoves(ctx), onMove(ctx, move), onRoundEnd(ctx)
2. All three functions must mutate ctx.state in place — never reassign ctx.state
3. No import statements, no export statements, no TypeScript type annotations
4. Use only ES5/ES6 compatible JavaScript — no async, no Promises, no modules
5. Reference game-spec.json zones as: ctx.state.zones["zone-id"].pieces
6. Reference player state as: ctx.state.players[ctx.state.currentPlayerIndex].data

GAME SPEC:
[game-spec.json content]

HOOK CONTRACT (from shared-types):
[HookFunctions interface text]

REFERENCE IMPLEMENTATION (Azul hooks.ts structure):
[key structural excerpts from azul/src/hooks.ts]
```

### Pattern 3: Freeform Hex Zone for Hive

**What:** Hive has no pre-defined board — pieces grow outward from the initial placement. The engine's current zone types (`grid`, `stack`, etc.) don't support this.

**Design approach:** Add a `freeform` zone type to `ZoneType` and extend `ZoneDef` to allow it. Pieces in a freeform zone carry `(q, r)` axial coordinates in their `data` field. The renderer reads coordinates and calculates pixel positions.

**Axial coordinate system (recommended by redblobgames.com):**

```typescript
// libs/games/hive/src/hex.ts
// Source: https://www.redblobgames.com/grids/hexagons/
interface HexCoord { q: number; r: number }

// All 6 neighbors (pointy-top hexes)
const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

function hexNeighbors(hex: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map(d => ({ q: hex.q + d.q, r: hex.r + d.r }));
}

// Axial to pixel (pointy-top, size = half hex width)
function hexToPixel(hex: HexCoord, size: number): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r),
    y: size * (3 / 2 * hex.r)
  };
}

// Distance between two hexes
function hexDistance(a: HexCoord, b: HexCoord): number {
  const s_a = -a.q - a.r;
  const s_b = -b.q - b.r;
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(s_a - s_b));
}
```

**Hive piece data shape in GameState.players[i].data:**
```typescript
// Pieces track hex positions independently of zones
// Zone "board" in game.json is freeform — pieces self-report coordinates
interface HivePieceData {
  coord: { q: number; r: number };
  stackLevel: number; // 0 = ground, 1+ = beetle stack
}

// Game state extras for hive:
interface HiveGameData {
  placedPieceCoords: Record<string, { q: number; r: number }>; // pieceId → coord
  queenPlaced: { [playerId: string]: boolean };
  round: number;
}
```

### Pattern 4: Hot-Reload Test Harness

**What:** A standalone SvelteKit route at `/dev/harness` that watches `libs/games/{id}/` for file changes and re-loads the game in the browser. The route does not require auth — it's a dev-only tool.

**Implementation options:**

Option A — Vite plugin (recommended): Register a custom Vite plugin in the test harness `vite.config.ts` that watches game package files. When a file changes, it invalidates the module and sends an HMR update. Three-second target is easily achievable with Vite HMR (typically < 500ms).

```typescript
// vite.config.ts (in test harness or extending client vite config)
import chokidar from 'chokidar';

function gameWatcherPlugin(): Plugin {
  return {
    name: 'game-watcher',
    configureServer(server) {
      const watcher = chokidar.watch('libs/games', {
        ignored: /(^|[/\\])\../, // ignore dotfiles
        persistent: true,
        depth: 3
      });
      watcher.on('change', (filePath) => {
        server.ws.send({ type: 'full-reload' }); // or targeted HMR
        console.log(`[game-watcher] Reload triggered: ${filePath}`);
      });
    }
  };
}
```

Option B — Native `dotnet watch`: `dotnet watch run` in the C# API already handles server-side hot reload for hook changes (since hooks.ts is loaded at runtime by `HookExecutor.cs`). The test harness client still needs Vite HMR for the browser side.

### Pattern 5: Random Bot Validator

**What:** After each hot-reload, the test harness automatically runs a random bot that plays `N` random valid moves, catching crashes, infinite loops, and invalid state transitions before a human sees the game.

**Implementation approach:**

```typescript
// apps/client/src/routes/dev/harness/harness.ts
async function runBotValidation(sessionId: string, maxMoves = 50): Promise<ValidationResult> {
  let moveCount = 0;
  let lastError: Error | null = null;

  while (moveCount < maxMoves) {
    const { state, validMoves } = await getGameState(sessionId);

    if (state.finished) {
      return { success: true, moveCount, reason: 'game-ended-normally' };
    }

    if (validMoves.length === 0) {
      // Dead state — no valid moves but game not finished
      return { success: false, moveCount, reason: 'deadlock-no-valid-moves' };
    }

    // Pick random valid move
    const move = validMoves[Math.floor(Math.random() * validMoves.length)];
    await submitMove(sessionId, move);
    moveCount++;
  }

  return { success: true, moveCount, reason: 'max-moves-reached' };
}
```

### Anti-Patterns to Avoid

- **Generating hooks.ts directly from the rulebook in one shot:** The rulebook → spec → code two-stage pipeline is mandatory. One-shot generation produces brittle code with no human review checkpoint.
- **Using `export` in generated hooks:** `HookExecutor.cs` strips `export const` → `var` but `export function` → `function`. Prompting the LLM to omit exports entirely is safer.
- **Generating game-specific zone IDs without player indexing:** Azul uses `player-{i}-pattern-line-{n}`. Generated games must follow the same pattern for `owner: "player"` zones; otherwise the engine cannot instantiate per-player copies.
- **Using offset hex coordinates:** Offset coordinates cannot be safely added/subtracted (making neighbor algorithms error-prone). Use axial coordinates exclusively.
- **Embedding the C# toolkit inside the existing `apps/server`:** The toolkit is a standalone local tool, not a server feature. It should be a separate project in `apps/tools/game-creator/`.
- **Inline PDF-to-image conversion in C#:** Claude's native PDF support handles this — send the PDF directly. Only use PdfPig if the PDF exceeds 100 pages or 32MB.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema-constrained LLM output | Retry loop with JSON.Parse | Claude structured outputs (`output_config.format`) | Grammar-constrained decoding guarantees valid JSON; retry loops don't |
| PDF text + visual extraction | PDF-to-text pipeline | Claude native PDF support (base64 document block) | Claude reads both text and diagrams; pure text extraction loses board layout diagrams |
| File change detection | Custom polling loop | chokidar v4 or Vite's built-in `handleHotUpdate` | Cross-platform, handles rename/delete, debounced events |
| CLI argument parsing in C# | `args[0]` parsing | `System.CommandLine` | Help text, validation, sub-commands out of the box |
| Hex distance and neighbor math | Custom hex math | Axial coordinate formulas from redblobgames.com | Well-tested, covers all edge cases (sliding constraint, freedom-to-move rule) |
| S3 upload packaging | Custom zip + multipart | `AWSSDK.S3 TransferUtility` | Handles multipart for large zips, retry, progress |

**Key insight:** The structured output feature is the single most important "don't hand-roll" item. Without it, LLM JSON generation requires defensive retry loops and schema validation — both of which add latency and complexity.

---

## Common Pitfalls

### Pitfall 1: Jint ES Module Incompatibility

**What goes wrong:** Generated `hooks.ts` uses `import` or `export` statements. The TypeScript stripper in `HookExecutor.cs` handles `export function` → `function` and `export const` → `var`, but the regex is fragile. If the LLM generates `export default`, `export { getValidMoves }`, or `import { type X }` in unusual positions, the stripper can fail.

**Why it happens:** LLMs trained on TypeScript naturally generate idiomatic TypeScript with imports/exports. Without explicit constraints in the prompt, this is the default output.

**How to avoid:** The generation prompt must explicitly state "do not use import, export, or any ES module syntax." Include a working Azul hooks snippet (with no imports) as a few-shot example. Add a post-generation validator in the C# tool that rejects output containing `import ` or `export ` before writing to disk.

**Warning signs:** `HookExecutor.cs` logs `"Hook execution error: Jint.Runtime.JavaScriptException"` or `"getValidMoves hook execution failed"`.

### Pitfall 2: game-spec.json Schema Drift vs Engine Schema

**What goes wrong:** The LLM generates a `game-spec.json` with zone types or piece shapes that don't match what the engine actually supports. For example, generating a `hexgrid` zone type that doesn't exist in `ZoneType` (`grid | stack | hand | deck | discard`).

**Why it happens:** The structured output schema for `game-spec.json` is defined by the tool developer. If it doesn't align with `libs/shared-types/src/zones.ts`, the generated `game.json` will fail to load.

**How to avoid:** Define the structured output JSON schema for `game-spec.json` to match the actual `GameConfig` type from `shared-types`. Use `additionalProperties: false` on schema objects. The tool's code generator should produce a `game.json` that satisfies `GameLoader.load()` without modification — validate this in CI.

**Warning signs:** `GameLoader.ts` throws `ZoneFactory: unknown zone type` or `duplicate zone id`.

### Pitfall 3: Hive "One Hive Rule" and Freedom-to-Move

**What goes wrong:** Hive has two critical movement constraints that are algorithmically non-trivial:
1. **One Hive Rule:** After any move, all placed pieces must remain connected. A piece cannot move if removing it disconnects the hive.
2. **Freedom-to-Move Rule:** A piece can only slide to an adjacent space if it can physically do so without lifting — there must be no "gate" blocking the path (two pieces on either side of the gap).

**Why it happens:** These constraints are easy to describe in English but require graph connectivity checks (BFS/DFS) and specific sliding geometry checks in code. LLM-generated hooks will almost certainly get these wrong on the first pass.

**How to avoid:** Hand-implement these algorithms in Hive's `hooks.ts` rather than relying on LLM generation. Treat Hive as a validation target for the generated `game.json` format (zones, pieces, fallback rendering) but hand-write the movement logic. The review gate should explicitly call out "connectivity check" and "freedom-to-move" as items requiring human verification.

**Warning signs:** The random bot validator reaches invalid board states (disconnected hive), or valid moves include moves that would disconnect the hive.

### Pitfall 4: Freeform Zone Needs Engine Extension

**What goes wrong:** `ZoneFactory.ts` currently throws `"unknown zone type"` for anything outside `grid | stack | hand | deck | discard`. Adding a `freeform` type requires modifying the engine's `ZoneType` type, `ZoneFactory`, and potentially the PixiJS renderer.

**Why it happens:** The engine was designed with Azul's fixed zones in mind. Hive's dynamic board is a fundamentally different model.

**How to avoid:** Plan engine extension as an explicit task. Add `freeform` to `ZoneType` in `libs/shared-types/src/zones.ts`, create `FreeformZone` in `libs/engine/core/src/zones/Zone.ts`, register it in `ZoneFactory`. The renderer needs a new code path that iterates pieces in the freeform zone and calculates pixel positions from axial coordinates rather than grid positions.

**Warning signs:** `ZoneFactory: unknown zone type "freeform"` at game load time.

### Pitfall 5: LLM Token Budget for Large Rulebooks

**What goes wrong:** A complex rulebook PDF with many pages can consume 1,500–3,000 tokens per page (text + image). A 30-page rulebook = 45,000–90,000 input tokens. Claude Opus 4.6 has a 200K token context window, but cost per token is significant.

**Why it happens:** The PDF support docs note "each page is converted into an image" — every page incurs both text and image token costs.

**How to avoid:** Use prompt caching (`cache_control: { type: "ephemeral" }`) on the PDF document block. This caches the PDF for up to 5 minutes, making the spec-generation → re-generation cycle much cheaper. For very large PDFs, consider sending only the relevant sections (text extraction via PdfPig to identify page ranges, then send those pages).

**Warning signs:** High API costs on iterative review cycles; slow API response times.

### Pitfall 6: Beetle Stacking Breaks Piece-Zone Model

**What goes wrong:** In Hive, the Beetle can climb on top of other pieces, creating stacks. The piece that is on top controls that hex's color (for placement rules). The current piece model (`PieceState`) doesn't have a stack concept.

**Why it happens:** The Azul model has pieces in zones (flat); Hive pieces can be stacked on other pieces.

**How to avoid:** Represent stacks via `stackLevel` in piece `data`. The `freeform` zone's rendering iterates pieces sorted by `stackLevel`; only the top-most piece on a given `(q,r)` coordinate is interactive. The One Hive Rule check must use the top-of-stack color at each coordinate, not the underlying piece.

---

## Code Examples

### Claude API: Send PDF Rulebook (C#)

```csharp
// Source: https://platform.claude.com/docs/en/build-with-claude/pdf-support
// Source: https://github.com/anthropics/anthropic-sdk-csharp

var client = new AnthropicClient(); // ANTHROPIC_API_KEY from env

var pdfBytes = File.ReadAllBytes("hive-rulebook.pdf");
var pdfBase64 = Convert.ToBase64String(pdfBytes);

// Two-stage: call 1 generates spec
var specResponse = await client.Messages.Create(new MessageCreateParams
{
    Model = Model.ClaudeSonnet4_6_20250929,
    MaxTokens = 16384,
    // Structured output — guarantees valid JSON matching our schema
    OutputConfig = new OutputConfig
    {
        Format = new OutputFormat { Type = "json_schema", Schema = GameSpecSchema.JsonSchemaObject }
    },
    Messages =
    [
        new()
        {
            Role = Role.User,
            Content =
            [
                new ContentBlock
                {
                    Type = "document",
                    Source = new DocumentSource
                    {
                        Type = "base64",
                        MediaType = "application/pdf",
                        Data = pdfBase64
                    },
                    CacheControl = new CacheControl { Type = "ephemeral" } // cache the PDF
                },
                new ContentBlock { Type = "text", Text = SpecPrompt.Build("hive") }
            ]
        }
    ]
});

var specJson = specResponse.Content[0].Text; // guaranteed valid JSON
File.WriteAllText("game-spec.json", specJson);
```

### Structured Output: game-spec.json schema excerpt

```csharp
// Schema maps to GameConfig shape from shared-types
// Zone types must match ZoneType: "grid" | "stack" | "hand" | "deck" | "discard" | "freeform"
public static class GameSpecSchema
{
    public static object JsonSchemaObject => new
    {
        type = "object",
        required = new[] { "id", "title", "players", "zones", "pieces", "turnOrder", "phases", "winCondition", "ambiguities" },
        additionalProperties = false,
        properties = new
        {
            id = new { type = "string" },
            title = new { type = "string" },
            players = new { type = "object", required = new[] { "min", "max" },
                properties = new { min = new { type = "integer" }, max = new { type = "integer" } } },
            zones = new { type = "array", items = ZoneSpecSchema },
            pieces = new { type = "array", items = PieceSpecSchema },
            turnOrder = new { type = "string", @enum = new[] { "sequential", "hook-controlled" } },
            phases = new { type = "array", items = new { type = "string" } },
            winCondition = new { type = "string" },
            // Key: LLM must emit ambiguities explicitly
            ambiguities = new { type = "array", items = new { type = "object",
                required = new[] { "rule", "interpretation", "confidence" },
                properties = new
                {
                    rule = new { type = "string" },
                    interpretation = new { type = "string" },
                    confidence = new { type = "string", @enum = new[] { "HIGH", "MEDIUM", "LOW" } },
                    flagged = new { type = "boolean" }
                }
            }}
        }
    };
}
```

### Axial Hex: Neighbor and Connectivity Check (TypeScript for hooks.ts)

```typescript
// libs/games/hive/src/hex.ts — runs in Jint, so no imports
// All functions are plain JS, no TS annotations in the generated file

var HEX_DIRS = [
  {q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}
];

function hexKey(q, r) { return q + ',' + r; }

function getNeighborCoords(q, r) {
  return HEX_DIRS.map(function(d) { return {q: q+d.q, r: r+d.r}; });
}

// Returns true if all placed pieces remain connected after removing pieceAtCoord
// Uses BFS from any one remaining piece
function isHiveConnectedWithout(pieceCoordsMap, excludeQ, excludeR) {
  var keys = Object.keys(pieceCoordsMap).filter(function(k) {
    var c = pieceCoordsMap[k];
    return !(c.q === excludeQ && c.r === excludeR);
  });
  if (keys.length === 0) return true;
  var startCoord = pieceCoordsMap[keys[0]];
  var visited = {};
  var queue = [startCoord];
  visited[hexKey(startCoord.q, startCoord.r)] = true;
  while (queue.length > 0) {
    var cur = queue.shift();
    var neighbors = getNeighborCoords(cur.q, cur.r);
    for (var i = 0; i < neighbors.length; i++) {
      var nk = hexKey(neighbors[i].q, neighbors[i].r);
      if (!visited[nk] && pieceCoordsMap[nk] && !(neighbors[i].q === excludeQ && neighbors[i].r === excludeR)) {
        visited[nk] = true;
        queue.push(neighbors[i]);
      }
    }
  }
  return Object.keys(visited).length === keys.length;
}
```

### Chokidar: Game File Watcher (Vite Plugin)

```typescript
// Source: https://github.com/paulmillr/chokidar
// vite.config.ts (test harness app)
import chokidar from 'chokidar';
import type { Plugin } from 'vite';

function gameWatcherPlugin(gameDir: string): Plugin {
  return {
    name: 'bga2-game-watcher',
    configureServer(server) {
      const watcher = chokidar.watch(gameDir, {
        ignored: /(node_modules|\.git)/,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 200 } // debounce
      });
      watcher.on('change', (path) => {
        console.log(`[game-watcher] Changed: ${path} — reloading`);
        server.ws.send({ type: 'full-reload' });
      });
      return () => watcher.close(); // cleanup on server shutdown
    }
  };
}

export default defineConfig({
  plugins: [sveltekit(), gameWatcherPlugin('../../libs/games')]
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt Claude to "return JSON" + retry on parse error | Structured outputs (`output_config.format`) with schema-constrained decoding | 2025-11 (GA in 2026) | Eliminates retry loops; guarantees valid JSON every time |
| `Anthropic.SDK` (unofficial tghamm) | Official `Anthropic` NuGet package (v10+) | 2025 | Use official; unofficial moves to `tryAGI.Anthropic` |
| iTextSharp (AGPL) for PDF extraction | PdfPig (Apache 2.0) for text; Claude native PDF for visual | 2024 | Avoid AGPL in a local tool |
| chokidar v3 (many deps) | chokidar v4 (1 dep) | 2024-09 | Simpler install; v5 ESM-only requires Node 20 |
| Offset hex coordinates | Axial coordinates | N/A (always been better) | Algorithms are simpler; neighbors are additive |

**Deprecated/outdated:**
- `Anthropic.SDK` v3.x and below (tghamm): superseded by official SDK
- `anthropic-beta: structured-outputs-2025-11-13` header: no longer required (GA)
- `output_format` parameter: moved to `output_config.format` (old form still works during transition)

---

## Open Questions

1. **Does the official Anthropic C# SDK support structured outputs (`output_config.format`) in its current version?**
   - What we know: The SDK is at v12.x; structured outputs are GA. The SDK README shows basic messages but not structured output examples in C#.
   - What's unclear: Whether `OutputConfig` is a first-class parameter in the C# SDK or requires raw JSON construction via `HttpClient`.
   - Recommendation: Verify by checking the SDK's GitHub issues/source before Wave 0. If `OutputConfig` is not yet in the C# SDK, fall back to `tool_use` with `strict: true` (tool input schemas are also schema-constrained and widely supported) or raw HTTP with `System.Net.Http.Json`.

2. **What is the correct `ZoneType` extension path for `freeform` zones?**
   - What we know: `ZoneType` is a TypeScript union type in `shared-types`; `ZoneFactory` is an exhaustive switch; adding `freeform` requires changes to both.
   - What's unclear: Whether the PixiJS renderer (`AzulScene.ts`) has hardcoded zone rendering that needs generalization, or whether it already uses `ZoneDef.render` config generically.
   - Recommendation: Read `AzulScene.ts` fully before designing the freeform renderer. Plan as a separate Wave 0 task.

3. **Will the LLM reliably generate Jint-compatible hooks.ts for Hive's movement rules?**
   - What we know: STATE.md explicitly calls this MEDIUM confidence and recommends a pilot. Hive's One Hive Rule and Freedom-to-Move require graph connectivity checks — these are algorithmically complex.
   - What's unclear: Whether the LLM can produce correct BFS/DFS in Jint-compatible JavaScript without hand-correction.
   - Recommendation: Plan Wave 0 to include an Azul re-generation pilot (verify the pipeline works at all), then treat Hive hooks as a human-authored file that the pipeline generates a first draft of. Budget for significant manual correction of Hive movement rules.

4. **How should the S3 deployment (AIGC-07) integrate with the existing game discovery system?**
   - What we know: Games live in `libs/games/{id}/` locally. There is no existing game discovery system documented beyond the game list page.
   - What's unclear: What the server expects when loading a new game — does it read from `libs/games/` at startup, or from S3? Is there a game registry?
   - Recommendation: Check `GameService.cs` and `HookExecutor.LoadHooks()` to understand the current game-loading path before designing the S3 packaging. The server currently loads hooks from the monorepo path — S3 deployment may need a corresponding server-side change.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` — section included as standard best practice.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing — `libs/games/azul/vitest.config.ts`) |
| Config file | `libs/games/hive/vitest.config.ts` (Wave 0 gap) |
| Quick run command | `docker compose exec client npx nx test hive` |
| Full suite command | `docker compose exec client npx nx run-many --target=test --all` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIGC-01 | Tool ingests PDF rulebook without crashing | unit | `dotnet test apps/tools/game-creator/` | Wave 0 |
| AIGC-02 | Spec generation produces valid JSON matching schema | unit | `dotnet test apps/tools/game-creator/ --filter SpecGenerator` | Wave 0 |
| AIGC-03 | Generated hooks.ts runs in Jint without errors | integration | `docker compose exec server dotnet test --filter HookExecutor` | Wave 0 |
| AIGC-04 | File watcher triggers reload within 3 seconds | manual smoke | Puppeteer screenshot diff before/after file change | Wave 0 |
| AIGC-05 | Scenario JSON file loads and sets specific game state | integration | `npx nx test client --filter=harness` | Wave 0 |
| AIGC-06 | Review report contains checklist items and [AMBIGUOUS] flags | unit | `dotnet test --filter ReviewReporter` | Wave 0 |
| AIGC-07 | Package produces valid zip uploaded to S3 (LocalStack) | integration | `dotnet test --filter S3Packager` | Wave 0 |
| Hive gameplay | Hive hooks: valid moves exclude disconnecting moves | unit | `docker compose exec client npx nx test hive` | Wave 0 |

### Wave 0 Gaps

- [ ] `apps/tools/game-creator/` — new C# project (does not exist)
- [ ] `libs/games/hive/vitest.config.ts` — Hive game test configuration
- [ ] `libs/games/hive/src/hooks.test.ts` — Hive hook unit tests
- [ ] `apps/client/src/routes/dev/harness/` — test harness route (does not exist)
- [ ] Pilot test: one LLM call to generate hooks for Azul from its rulebook, verify Jint-executability
- [ ] Verify: official Anthropic C# SDK supports `output_config.format` structured outputs

---

## Sources

### Primary (HIGH confidence)
- [Official Anthropic C# SDK](https://github.com/anthropics/anthropic-sdk-csharp) — SDK API shape, model IDs, installation
- [Claude PDF Support Docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support) — PDF ingestion constraints (32MB, 100 pages), base64 and Files API options, prompt caching
- [Claude Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — `output_config.format`, GA models (Opus 4.6, Sonnet 4.6, Haiku 4.5), schema support
- [Red Blob Games: Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/) — Axial coordinate system, neighbor algorithms, distance calculation
- Existing codebase: `apps/server/Services/HookExecutor.cs` — Jint constraints, TypeScript stripping regex
- Existing codebase: `libs/games/azul/game.json` — reference game package format
- Existing codebase: `libs/shared-types/src/*.ts` — GameConfig, ZoneType, HookFunctions contracts
- Existing codebase: `apps/server/server.csproj` — existing NuGet dependencies (Jint 3.*, Npgsql, Hangfire)

### Secondary (MEDIUM confidence)
- [PdfPig NuGet](https://www.nuget.org/packages/PdfPig/) — v0.1.13, Apache 2.0 (verified via NuGet)
- [chokidar npm](https://www.npmjs.com/package/chokidar) — v4 released 2024-09; v5 ESM-only (verified via npm)
- [Hive game Wikipedia](https://en.wikipedia.org/wiki/Hive_(game)) — piece movement rules (Queen, Beetle, Grasshopper, Spider, Ant)
- [UltraBoardGames: Hive Rules](https://www.ultraboardgames.com/hive/game-rules.php) — One Hive Rule, Freedom-to-Move constraint descriptions

### Tertiary (LOW confidence)
- WebSearch: LLM code generation accuracy for board game hooks — no direct studies found; pilot required to establish baseline
- WebSearch: Anthropic C# SDK structured output C# examples — not found; may require raw HTTP fallback

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Official SDK, NuGet packages, Vite/chokidar are all verified
- Architecture: HIGH for pipeline structure; MEDIUM for freeform zone engine extension (untested)
- LLM generation accuracy: LOW — no empirical data without pilot; pilot is the first Wave 0 task
- Hive movement rules: MEDIUM — rules are well-documented; implementing BFS connectivity checks correctly is the risk
- S3 deployment: HIGH — straightforward AWSSDK.S3 upload; integration with game discovery is MEDIUM

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (Anthropic SDK and structured outputs are in active development; recheck SDK version before starting)
