---
phase: 01-engine-foundation
plan: "06"
subsystem: api
tags: [csharp, dotnet, aspnet, minimal-api, ef-core, postgresql, jint, javascript, game-hooks, optimistic-locking, jsonb]

# Dependency graph
requires:
  - phase: 01-engine-foundation
    plan: "02"
    provides: HookFunctions contract (getValidMoves, onMove), Move/ValidMove/MoveResult TypeScript types, Azul hooks.ts stubs
affects: [02-game-engine, 03-multiplayer, 04-async-play]

provides:
  - POST /games endpoint — creates GameSession in PostgreSQL with initial JSONB state
  - POST /games/{sessionId}/move endpoint — server-authoritative move validation via Jint hook execution
  - GET /games/{sessionId}/state endpoint — returns current state + validMoves[] for client highlighting
  - HookExecutor: in-process Jint JavaScript runtime with TypeScript annotation stripper for Phase 1 hooks.ts stubs
  - GameService: full move validation pipeline (load -> getValidMoves -> validate -> onMove -> persist -> return nextValidMoves)
  - GameDbContext: EF Core PostgreSQL context with JSONB game state and xmin optimistic locking
  - GameSession entity with xmin row version concurrency token

# Tech tracking
tech-stack:
  added:
    - Jint 3.1.6 (in-process JavaScript engine for C# — executes game hook functions)
    - Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11 (already in csproj from prior plan)
    - Microsoft.EntityFrameworkCore.Design 8.0.x (EF Core tooling)
  patterns:
    - Server-authoritative move validation: client sends move, server executes hooks, returns result + validMoves[]
    - Jint execution with timeout (5s) and memory limit (50MB) per hook invocation
    - TypeScript-to-JavaScript stripping via regex: removes import type, interface blocks, type aliases, param annotations, return types
    - HookContext passed as a Jint global var so onMove can mutate ctx.state in place
    - Optimistic locking via PostgreSQL xmin system column — EF Core throws DbUpdateConcurrencyException on race
    - Phase 1 permissive validation: if getValidMoves() returns empty list (stub behavior), all moves are accepted
    - Monorepo root discovery by walking up to nx.json for hook file loading

key-files:
  created:
    - apps/server/Data/GameSession.cs
    - apps/server/Data/GameDbContext.cs
    - apps/server/Models/GameModels.cs
    - apps/server/Endpoints/GameEndpoints.cs
    - apps/server/Services/GameService.cs
    - apps/server/Services/HookExecutor.cs
  modified:
    - apps/server/Program.cs

key-decisions:
  - "Jint in-process execution over Node.js sidecar — no Docker service overhead, no HTTP calls, 5s timeout guards against runaway hooks; Phase 2 will add proper tsc compile step"
  - "TypeScript annotation stripping via regex for Phase 1 — sufficient for Azul stub hooks which only use basic type syntax; intentionally minimal, not a general TS parser"
  - "Phase 1 permissive move validation — getValidMoves stubs return [] so all moves are accepted; this is correct behavior for Phase 1 stub hooks, not a bug"
  - "Removed .WithOpenApi() calls — requires Microsoft.AspNetCore.OpenApi NuGet package not in csproj; Swashbuckle.AspNetCore alone provides Swagger UI via .WithName()/.WithSummary()"
  - "xmin via UseXminAsConcurrencyToken() suppressed with #pragma warning — obsolete in Npgsql 8 but still the correct mechanism for mapping uint [Timestamp] to PostgreSQL xmin"

patterns-established:
  - "Move validation pipeline: load session -> get valid moves -> validate or allow-all (Phase 1) -> apply move -> persist -> get next valid moves -> return"
  - "HookExecutor isolation: each hook call creates a fresh Jint Engine instance — no shared state between calls"
  - "Server returns validMoves[] in every move response — client never computes legal moves, only renders them"
  - "JSONB game state: state stored as opaque JSON string in PostgreSQL, parsed/mutated only in Jint hook context"

requirements-completed: [ENG-04, ENG-05]

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 01 Plan 06: C# API Server with Move Validation and Jint Hook Execution Summary

**ASP.NET Core Minimal API with POST /games/{id}/move validated against Jint-executed TypeScript hooks, JSONB state persistence to PostgreSQL with xmin optimistic locking, and validMoves[] in every response**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T05:59:24Z
- **Completed:** 2026-03-01T06:05:00Z
- **Tasks:** 2 of 2
- **Files modified:** 7

## Accomplishments

- Complete server-authoritative move validation pipeline: POST /games/{sessionId}/move loads session, calls getValidMoves hook, validates move (or allows all in Phase 1 stub mode), calls onMove hook, persists new state with xmin optimistic locking, returns validMoves[] for next turn
- HookExecutor executes Phase 1 Azul hooks.ts via Jint 3.1.6 — strips TypeScript type annotations with regex patterns, builds HookContext JavaScript object, invokes getValidMoves(ctx) and onMove(ctx, move), extracts mutated state; 5-second timeout + 50MB memory limit guard against runaway hook code
- GameDbContext configures PostgreSQL JSONB column type for game state and xmin concurrency token for optimistic locking; DbUpdateConcurrencyException caught and returned as a user-friendly retry error
- REST API: POST /games (create session), POST /games/{id}/move (validate + apply), GET /games/{id}/state (read state + validMoves); all endpoints wire through GameService with clean separation from data layer
- Server builds with 0 warnings, 0 errors

## Task Commits

1. **Task 1: C# API server with move endpoint and data layer** - `e013bf1` (feat) — included in prior plan commit
2. **Task 2: Jint hook executor for TypeScript evaluation** - `42003ee` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `apps/server/Data/GameSession.cs` - EF Core entity: Id, GameId, State (JSONB), Version, RowVersion ([Timestamp] uint for xmin), timestamps
- `apps/server/Data/GameDbContext.cs` - EF Core DbContext with JSONB column type and UseXminAsConcurrencyToken()
- `apps/server/Models/GameModels.cs` - C# records: MoveRequest, ValidMove, MoveResult, MoveResponse, CreateGameResponse, GameStateResponse
- `apps/server/Endpoints/GameEndpoints.cs` - MapGameEndpoints() extension: POST /games, POST /games/{id}/move, GET /games/{id}/state
- `apps/server/Services/GameService.cs` - Orchestrates: CreateGame, ValidateAndApplyMove (full pipeline), GetGameState
- `apps/server/Services/HookExecutor.cs` - Jint engine wrapper: GetValidMoves, OnMove, LoadHooks, StripTypeScriptAnnotations
- `apps/server/Program.cs` - Updated: EF Core, HookExecutor, GameService, CORS, Swagger, game endpoint registration

## Decisions Made

- Used Jint 3.1.6 in-process JavaScript engine instead of a Node.js sidecar. No additional Docker service, no HTTP overhead, no subprocess management. Phase 2 will add a proper tsc compilation step to handle full TypeScript syntax.
- TypeScript annotation stripping is intentionally regex-based for Phase 1. The Azul hooks.ts stubs use only basic TypeScript (import type, : Type annotations, return type annotations, const satisfies). A full TS parser is unnecessary for Phase 1 stubs.
- Removed `.WithOpenApi()` calls from all endpoints — this requires `Microsoft.AspNetCore.OpenApi` (a separate NuGet) that isn't in the csproj. `Swashbuckle.AspNetCore` provides the Swagger UI and doesn't need `.WithOpenApi()`.
- `UseXminAsConcurrencyToken()` is obsolete in Npgsql 8 but still the correct call for mapping a `uint [Timestamp]` property to the PostgreSQL `xmin` system column. Suppressed CS0618 warning with `#pragma warning disable/restore`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed .WithOpenApi() — requires uninstalled Microsoft.AspNetCore.OpenApi package**
- **Found during:** Task 1 verification (dotnet build)
- **Issue:** `.WithOpenApi()` is an extension method from `Microsoft.AspNetCore.OpenApi` NuGet package (not included in the csproj). Swashbuckle provides Swagger UI without it. Build failed with CS1061 on every endpoint definition.
- **Fix:** Removed all `.WithOpenApi()` calls from GameEndpoints.cs and Program.cs. Swagger UI still works via Swashbuckle + `.WithName()` + `.WithSummary()`.
- **Files modified:** apps/server/Endpoints/GameEndpoints.cs, apps/server/Program.cs
- **Verification:** dotnet build succeeds with 0 errors
- **Committed in:** e013bf1 (Task 1 commit, included in prior plan run)

**2. [Rule 1 - Bug] Fixed Jint.Runtime.TimeoutException — non-existent type in Jint v3**
- **Found during:** Task 2 verification (dotnet build)
- **Issue:** `Jint.Runtime.TimeoutException` does not exist in Jint 3.1.6. Build failed with CS0234. Jint v3 uses `System.TimeoutException` for execution timeout.
- **Fix:** Replaced `catch (Jint.Runtime.TimeoutException)` with `catch (TimeoutException)` (System.TimeoutException).
- **Files modified:** apps/server/Services/HookExecutor.cs
- **Verification:** dotnet build succeeds with 0 errors
- **Committed in:** 42003ee (Task 2 commit)

**3. [Rule 1 - Bug] Suppressed UseXminAsConcurrencyToken obsolete warning**
- **Found during:** Task 1 verification (dotnet build)
- **Issue:** `UseXminAsConcurrencyToken()` is marked obsolete in Npgsql 8.0 (CS0618 warning). The warning message says "use IsRowVersion() or [Timestamp]", but the [Timestamp] attribute alone on a uint property is not sufficient to map to PostgreSQL's xmin column — the explicit call is still required.
- **Fix:** Added `#pragma warning disable/restore CS0618` around the call to suppress the misleading warning while keeping the required functionality.
- **Files modified:** apps/server/Data/GameDbContext.cs
- **Verification:** dotnet build succeeds with 0 warnings, 0 errors
- **Committed in:** e013bf1 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - Bug — build failures discovered during verification)
**Impact on plan:** All fixes address API contract differences between assumed and actual library versions. No scope creep. Core plan architecture implemented exactly as specified.

## Issues Encountered

None beyond the three auto-fixed build errors documented above.

## User Setup Required

None — this plan creates C# server code only. Requires PostgreSQL running (via Docker Compose from plan 01-01) before the server can create game sessions. No API keys or external services beyond the local dev stack.

## Next Phase Readiness

- Server-authoritative move validation pipeline complete — ready for Phase 2 (full Azul hook logic)
- HookExecutor TypeScript stripper is Phase 1 pragmatic — Phase 2 must add proper tsc/esbuild compile step when hooks use advanced TypeScript
- POST /games/{id}/move endpoint ready for SvelteKit client integration (Plan 07+)
- validMoves[] pipeline in place — client can receive legal moves and apply GlowFilter highlighting
- Optimistic locking configured — concurrent move conflicts return user-friendly retry errors

## Self-Check: PASSED

All required files present:
- apps/server/Data/GameSession.cs — present (41 lines)
- apps/server/Data/GameDbContext.cs — present (48 lines)
- apps/server/Models/GameModels.cs — present
- apps/server/Endpoints/GameEndpoints.cs — present (85 lines, exceeds 30 minimum)
- apps/server/Services/GameService.cs — present (183 lines, exceeds 60 minimum)
- apps/server/Services/HookExecutor.cs — present (314 lines, exceeds 40 minimum)
- apps/server/Program.cs — present (modified)

Commits verified:
- e013bf1 — Task 1 files (in git log, committed by prior plan run 01-05 with same content)
- 42003ee — Task 2 HookExecutor.cs

Build verified: `dotnet build server.csproj` → Build succeeded, 0 Warning(s), 0 Error(s)

---
*Phase: 01-engine-foundation*
*Completed: 2026-03-01*
