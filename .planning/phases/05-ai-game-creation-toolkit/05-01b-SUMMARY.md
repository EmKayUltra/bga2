---
phase: 05-ai-game-creation-toolkit
plan: "01b"
subsystem: tooling
tags: [dotnet, csharp, anthropic, claude, cli, jint, pdfpig, game-creation]

# Dependency graph
requires:
  - phase: 05-ai-game-creation-toolkit
    provides: "Research and context for game-creator tool design (05-RESEARCH.md, 05-CONTEXT.md)"
provides:
  - "Standalone C# CLI tool at apps/tools/game-creator/ with ingest and generate subcommands"
  - "Two-stage LLM pipeline: rulebook -> game-spec.json (SpecGenerator), game-spec.json -> game.json + hooks.ts (CodeGenerator)"
  - "JintValidator: static + runtime validation that generated hooks.ts is Jint-compatible"
  - "ReviewReporter: markdown checklist report with [AMBIGUOUS] flags and confidence levels"
affects:
  - "05-02 (game-creator UX/iteration workflow)"
  - "05-03 (game testing harness uses generated game packages)"
  - "05-04 (game publishing pipeline consumes tool output)"

# Tech tracking
tech-stack:
  added:
    - "Anthropic 12.8.0 — official C# SDK for Claude API"
    - "PdfPig 0.1.13 — PDF file reading for rulebook ingestion"
    - "Jint 3.x — JavaScript engine for hooks.ts validation"
    - "System.CommandLine 2.0.0-beta4 — CLI subcommand framework"
  patterns:
    - "OutputConfig.Format (JsonOutputFormat + schema) for spec generation structured output"
    - "Tool + ToolUnion with tool_use force for code generation structured output"
    - "ContentBlockParam union for mixing DocumentBlockParam/ImageBlockParam/TextBlockParam"
    - "AnthropicClient.Messages.Create (not CreateAsync) returns Task<Message>"

key-files:
  created:
    - apps/tools/game-creator/game-creator.csproj
    - apps/tools/game-creator/Program.cs
    - apps/tools/game-creator/Commands/IngestCommand.cs
    - apps/tools/game-creator/Commands/GenerateCommand.cs
    - apps/tools/game-creator/Pipeline/RulebookIngestor.cs
    - apps/tools/game-creator/Pipeline/SpecGenerator.cs
    - apps/tools/game-creator/Pipeline/CodeGenerator.cs
    - apps/tools/game-creator/Pipeline/ReviewReporter.cs
    - apps/tools/game-creator/Pipeline/JintValidator.cs
    - apps/tools/game-creator/Schema/GameSpecSchema.cs
    - apps/tools/game-creator/Prompts/SpecPrompt.cs
    - apps/tools/game-creator/Prompts/CodePrompt.cs
  modified: []

key-decisions:
  - "Anthropic C# SDK 12.x uses OutputConfig.Format (JsonOutputFormat) not a separate beta API — first-class structured output support"
  - "CodeGenerator uses tool_use (Tool + ToolUnion) to return mixed-type response (gameJson object + hooksTs string) — OutputConfig only supports homogeneous JSON"
  - "PdfPig package ID is 'PdfPig' not 'UglyToad.PdfPig' — corrected from plan spec"
  - "Anthropic SDK method is Create() not CreateAsync() — returns Task<Message>, still awaitable"
  - "ToolUnion wrapper required when building Tools array — MessageCreateParams.Tools is IReadOnlyList<ToolUnion> not Tool[]"
  - "Base64ImageSource requires property initialization (Data + MediaType), no positional string constructor"
  - "MediaType enum: ImageWebP not ImageWebp (SDK casing)"
  - "CacheControlEphemeral applied to PDF DocumentBlockParam for iterative ingest re-runs cost savings"

patterns-established:
  - "Anthropic SDK API pattern: new MessageCreateParams { ..., OutputConfig = new OutputConfig { Format = new JsonOutputFormat { Schema = schema } } }"
  - "Anthropic SDK tool pattern: new Tool { Name, Description, InputSchema = new InputSchema(rawData) }, Tools = new ToolUnion[] { new ToolUnion(tool) }"
  - "ContentBlockParam construction: new ContentBlockParam(new TextBlockParam(...)) or new ContentBlockParam(docBlock)"

requirements-completed: [AIGC-01, AIGC-02, AIGC-03, AIGC-06]

# Metrics
duration: 13min
completed: 2026-03-03
---

# Phase 5 Plan 01b: AI Game Creator CLI Summary

**Standalone .NET 8 CLI with two-stage Claude pipeline — rulebook-to-spec (OutputConfig/JsonOutputFormat) and spec-to-game-files (tool_use), with Jint compatibility validation and markdown review report generation**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-03-03T00:15:44Z
- **Completed:** 2026-03-03T00:29:00Z
- **Tasks:** 1
- **Files modified:** 12

## Accomplishments
- Standalone C# CLI tool (`dotnet run -- ingest/generate`) with two subcommands for the complete AI game creation pipeline
- SpecGenerator uses Claude's native structured output (OutputConfig.Format with JsonOutputFormat + schema) guaranteeing valid game-spec.json
- CodeGenerator uses tool_use with forced tool selection to return both game.json (object) and hooks.ts (string) in one call
- JintValidator performs static pattern checks and a live Jint runtime parse to catch import/export/async/TypeScript before the developer sees errors
- ReviewReporter generates a markdown checklist of zones/pieces/phases/scoring rules with an ambiguities table showing [AMBIGUOUS] flags and confidence levels

## Task Commits

1. **Task 1: Create C# CLI tool with two-stage LLM pipeline, review reporter, and Jint validator** - `7dc50ef` (feat)

**Plan metadata:** *(created below)*

## Files Created/Modified
- `apps/tools/game-creator/game-creator.csproj` - Project with Anthropic 12.x, PdfPig, Jint, System.CommandLine deps
- `apps/tools/game-creator/Program.cs` - CLI entry point with rootCommand + subcommands
- `apps/tools/game-creator/Commands/IngestCommand.cs` - `ingest <game-id> <rulebook> [--output]` subcommand
- `apps/tools/game-creator/Commands/GenerateCommand.cs` - `generate <game-id> <spec-path> [--output]` subcommand
- `apps/tools/game-creator/Pipeline/RulebookIngestor.cs` - Loads PDF/PNG/JPG/GIF/WEBP/TXT/MD files, returns (mediaType, content, isText)
- `apps/tools/game-creator/Pipeline/SpecGenerator.cs` - LLM call 1: rulebook -> game-spec.json via OutputConfig structured output
- `apps/tools/game-creator/Pipeline/CodeGenerator.cs` - LLM call 2: game-spec.json -> game.json + hooks.ts via tool_use
- `apps/tools/game-creator/Pipeline/ReviewReporter.cs` - Markdown review report with checklist and ambiguities table
- `apps/tools/game-creator/Pipeline/JintValidator.cs` - Static + runtime Jint validation of hooks.ts
- `apps/tools/game-creator/Schema/GameSpecSchema.cs` - JSON schema for game-spec structured output
- `apps/tools/game-creator/Prompts/SpecPrompt.cs` - System + user prompts for rulebook analysis
- `apps/tools/game-creator/Prompts/CodePrompt.cs` - System + user prompts for game package generation

## Decisions Made
- Used `OutputConfig.Format` (JsonOutputFormat + schema) for SpecGenerator — this is the native structured output path in Anthropic SDK 12.x, not a tool-use workaround
- Used tool_use for CodeGenerator because the response mixes types (gameJson is a JSON object, hooksTs is a plain string) — a single JsonOutputFormat schema for this would produce suboptimal results
- PdfPig package name corrected from `UglyToad.PdfPig` to `PdfPig` (the actual NuGet ID)
- Anthropic SDK 12.x `IMessageService.Create()` returns `Task<Message>` — awaitable, no separate `CreateAsync` method exists

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected PdfPig NuGet package ID**
- **Found during:** Task 1 (dotnet restore)
- **Issue:** Plan specified `UglyToad.PdfPig` but NuGet package is `PdfPig` (version 0.1.13)
- **Fix:** Updated game-creator.csproj PackageReference from `UglyToad.PdfPig` to `PdfPig`
- **Files modified:** apps/tools/game-creator/game-creator.csproj
- **Verification:** `dotnet restore` succeeded
- **Committed in:** 7dc50ef

**2. [Rule 1 - Bug] Fixed Anthropic SDK API mismatches**
- **Found during:** Task 1 (first build attempt)
- **Issue 1:** `client.Messages.CreateAsync()` does not exist — method is `Create()` returning `Task<Message>`
- **Issue 2:** `MessageCreateParams.Tools` is `IReadOnlyList<ToolUnion>` not `Tool[]` — needs `new ToolUnion(tool)` wrapper
- **Issue 3:** `Base64ImageSource(string)` constructor does not exist — must use property initialization `{ Data = content, MediaType = ... }`
- **Issue 4:** MediaType enum uses `ImageWebP` not `ImageWebp`
- **Fix:** Updated SpecGenerator.cs and CodeGenerator.cs with correct API calls
- **Files modified:** Pipeline/SpecGenerator.cs, Pipeline/CodeGenerator.cs
- **Verification:** `dotnet build` succeeds with 0 errors, 0 warnings
- **Committed in:** 7dc50ef

---

**Total deviations:** 2 auto-fixed (1 blocking package name, 1 bug — API surface mismatches)
**Impact on plan:** All fixes necessary for compilation. No scope creep.

## Issues Encountered
- Anthropic SDK exploration required to discover the correct API surface (OutputConfig, ToolUnion, Create vs CreateAsync, Base64ImageSource constructors). Resolved by runtime reflection inspection of the SDK DLL.

## User Setup Required

**External services require configuration before using the tool.**

To use the game-creator CLI:
1. Get an Anthropic API key from https://console.anthropic.com/settings/keys
2. Set environment variable: `export ANTHROPIC_API_KEY=your-key-here`
3. Run from the tool directory: `dotnet run -- ingest <game-id> /path/to/rulebook.pdf --output /tmp/output`

## Next Phase Readiness
- CLI tool is built and compiles cleanly
- Ready for plan 05-02 (UX/iteration workflow, pilot testing with Azul rulebook)
- User must provide ANTHROPIC_API_KEY before live testing

## Self-Check: PASSED

All created files verified present on disk. Commit 7dc50ef verified in git log.

---
*Phase: 05-ai-game-creation-toolkit*
*Completed: 2026-03-03*
