---
phase: 02-azul-first-playable
plan: "02"
subsystem: api
tags: [csharp, jint, typescript-strip, game-state, hooks, azul, ef-core, postgresql]

# Dependency graph
requires:
  - phase: 02-azul-first-playable
    plan: "01"
    provides: "Complete Azul hooks.ts (getValidMoves, onMove, onRoundEnd) with 32 passing tests"
  - phase: 01-engine-foundation
    provides: "GameService.cs, HookExecutor.cs, GameSession.cs, GameDbContext — server foundation"
provides:
  - POST /games accepting playerNames[] creates correct Azul initial state (5/7/9 factories, 100 tiles, player zones)
  - HookExecutor.BuildHookContextScript populates ctx.players from state.players, ctx.currentPlayer from currentPlayerIndex
  - HookExecutor.OnRoundEnd method executes onRoundEnd(ctx) hook with correct state
  - GameService.ValidateAndApplyMove auto-calls OnRoundEnd when phase transitions to "wall-tiling"
  - GameService.ExtractPlayerAndRound reads currentPlayerIndex and derives player ID from players array
  - TypeScript stripper handles full Azul hooks.ts including generics, inline object types, multiline signatures
affects: 02-03, 02-04, client-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BuildHookContextScript returns JS string (not JsValue) so ctx runs in same Jint engine as hook functions"
    - "TypeScript type stripping: 15 regex steps handling imports, interfaces, generics, assertions, variable/param annotations"
    - "Param annotations restricted to PascalCase types + known primitives — prevents stripping object literal properties"
    - "getValidMoves result uses JSON.stringify in JS engine (not JsValue.ToString) for reliable array serialization"
    - "EnsureCreated in Program.cs for dev schema creation (no EF migrations yet)"
    - "tile defId = plain color name ('blue') not 'tile-blue' — must match WALL_PATTERN in hooks.ts"

key-files:
  created: []
  modified:
    - apps/server/Services/HookExecutor.cs
    - apps/server/Services/GameService.cs
    - apps/server/Endpoints/GameEndpoints.cs
    - apps/server/Data/GameSession.cs
    - apps/server/Program.cs
    - apps/infra/docker-compose.yml

key-decisions:
  - "BuildHookContextScript returns JS string not JsValue — context must be in same Jint engine scope as hook functions"
  - "TypeScript param annotation stripping restricted to PascalCase types + known primitives to avoid mangling object literals"
  - "Use JSON.stringify inside Jint engine for valid moves result — JsValue.ToString() returns JS .toString() not JSON"
  - "tile defId uses plain color name (blue) not prefixed (tile-blue) to match WALL_PATTERN constants in hooks.ts"
  - "EnsureCreated used for dev DB setup — no EF Core migrations (tool not available in Docker container)"

patterns-established:
  - "Jint context pattern: execute context setup JS string on same engine as hooks, not separate engine"
  - "TS stripper iterative approach: each regex step handles one TS construct, Python-simulated and node --check validated"
  - "tile defId convention: pure color name matches hook constants (TILE_COLORS = ['blue', 'yellow', ...])"

requirements-completed: [AZUL-01, AZUL-04]

# Metrics
duration: 27min
completed: 2026-03-01
---

# Phase 2 Plan 02: Server Integration Summary

**C# server wired to Azul hooks: correct initial state creation (5/7/9 factories, 100 tiles), players-populated HookContext, and automatic onRoundEnd trigger — returning 84-96 valid moves for a fresh 2-player game**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-01T16:10:46Z
- **Completed:** 2026-03-01T16:38:23Z
- **Tasks:** 2 (plus 7 auto-fix deviations)
- **Files modified:** 6

## Accomplishments

- `POST /games` with `playerNames` creates a fully initialized Azul game: 5 factories (2P), 7 factories (3P), 9 factories (4P), each with 4 tiles; center with first-player-token; bag with remaining 80 tiles; per-player pattern lines, wall, and floor-line zones
- `HookExecutor.BuildHookContextScript` returns a JS string (not a cross-engine JsValue) — context now lives in the same Jint engine scope as the hook functions
- `HookExecutor.OnRoundEnd` added with same pattern as `OnMove` — executes `onRoundEnd(ctx)` and extracts mutated state via `JSON.stringify`
- `GameService.ValidateAndApplyMove` auto-detects round end (phase == "wall-tiling") and calls `OnRoundEnd` before persisting
- `ExtractPlayerAndRound` reads `currentPlayerIndex` and derives player ID from `players[currentPlayerIndex].id`
- GET /games/{id}/state returns 84 valid moves for a fresh 2-player Azul game (correct Azul enumeration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix HookExecutor — BuildHookContext with players, add OnRoundEnd** - `ada23e4` (feat)
2. **Task 2: GameService.CreateGame and ValidateAndApplyMove with round-end detection** - `0513a7b` (feat)
3. **Deviation fixes** - `96bb4f7` (fix — Rule 1+3 auto-fixes)

## Files Created/Modified

- `apps/server/Services/HookExecutor.cs` — BuildHookContextScript, OnRoundEnd, improved TypeScript stripper (15 steps), JSON.stringify for valid moves
- `apps/server/Services/GameService.cs` — CreateGame with full Azul state, ExtractPlayerAndRound with currentPlayerIndex, ExtractPhase, auto-OnRoundEnd in ValidateAndApplyMove, tile defId fix
- `apps/server/Endpoints/GameEndpoints.cs` — CreateGameRequest with PlayerNames, endpoint passes playerNames to CreateGame
- `apps/server/Data/GameSession.cs` — removed [Timestamp] attribute (xmin duplicate mapping fix)
- `apps/server/Program.cs` — added EnsureCreated for dev DB schema creation
- `apps/infra/docker-compose.yml` — added libs volume mount to server service

## Decisions Made

- **BuildHookContextScript returns string not JsValue**: The original `BuildHookContext` created a separate Jint engine and returned a JsValue from it. GetValidMoves/OnMove created their own engines, so the returned JsValue was from a different scope and ctx was inaccessible in the hook execution engine. Fix: return JS setup script as string, execute on the caller's engine.
- **TypeScript param annotation restriction to PascalCase/primitives**: Initial attempt used a broad character class that matched inside object literals (`source: sourceId`). Fix: restrict to types starting with uppercase (PascalCase TS convention) or known primitives (number, string, boolean, etc. with optional [] suffixes).
- **JSON.stringify for valid moves**: `JsValue.ToString()` returns JS `.toString()` on arrays (`[object Object],[object Object]`), not JSON. Fixed by executing `var __validMovesResult = getValidMoves(ctx)` then `JSON.stringify(__validMovesResult)` in the Jint engine.
- **tile defId = plain color name**: Initial implementation used `tile-{color}` as defId. The hooks.ts `WALL_PATTERN` and `TILE_COLORS` constants use plain color names (`'blue'`, `'yellow'`). Fixed defId to match hook conventions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added libs volume mount to server Docker service**
- **Found during:** Task 1/2 verification (API test)
- **Issue:** `hooks.ts` not accessible — server Docker service only mounts `apps/server`, not `libs/`
- **Fix:** Added `../../libs:/app/libs` volume mount to server service in docker-compose.yml
- **Files modified:** apps/infra/docker-compose.yml
- **Verification:** Server logs no longer show "Hooks file not found" warning
- **Committed in:** 96bb4f7

**2. [Rule 1 - Bug] Removed [Timestamp] attribute from GameSession.RowVersion**
- **Found during:** Task 2 verification (first API call)
- **Issue:** `UseXminAsConcurrencyToken()` in GameDbContext + `[Timestamp]` on RowVersion both mapped to xmin column — `InvalidOperationException: duplicate column mapping` at runtime
- **Fix:** Removed `[Timestamp]` attribute; `UseXminAsConcurrencyToken()` alone handles the xmin mapping
- **Files modified:** apps/server/Data/GameSession.cs
- **Verification:** Server starts and handles requests without the InvalidOperationException
- **Committed in:** 96bb4f7

**3. [Rule 3 - Blocking] Added EnsureCreated in Program.cs for DB schema**
- **Found during:** Task 2 verification
- **Issue:** `GameSessions` table did not exist — no EF Core migrations, no init SQL
- **Fix:** Added `db.Database.EnsureCreated()` in Program.cs startup block
- **Files modified:** apps/server/Program.cs
- **Verification:** POST /games creates game session successfully after fix
- **Committed in:** 96bb4f7

**4. [Rule 1 - Bug] Fixed TypeScript stripper — 7 regex improvements for full hooks.ts**
- **Found during:** Task 1/2 verification
- **Issue:** The minimal stripper from Phase 1 (written for stub hooks) failed on the full Azul hooks.ts which uses generics, inline object types, multiline function signatures, and type assertions
- **Fix:** Iterative improvements guided by Python simulation + `node --check` validation:
  - Return type stripping uses single-line char class (no cross-line `\s`) to prevent eating function bodies
  - `as Type<Generics>` assertions handled before simple `as Type` stripping
  - Variable type annotations include `:` in char class for `Array<{ id: string; ... }>`
  - Step 12a handles complex param types like `Array<{ id: string; ... }>` before step 12b
  - Step 12b restricted to PascalCase types + known primitives (prevents object literal property mangling)
  - `(?=\s*[,)=])` lookahead allows trailing whitespace/newline before delimiter
- **Files modified:** apps/server/Services/HookExecutor.cs
- **Verification:** Python simulation passes `node --check`; API returns 84-96 valid moves
- **Committed in:** 96bb4f7

**5. [Rule 1 - Bug] Switched getValidMoves result serialization to JSON.stringify**
- **Found during:** Task 2 verification
- **Issue:** `ParseValidMoves(JsValue result)` called `result.ToString()` which returns JS `.toString()` for arrays — producing `[object Object],[object Object]` instead of JSON
- **Fix:** Changed GetValidMoves to execute `var __validMovesResult = getValidMoves(ctx)` then `JSON.stringify(__validMovesResult)` in the Jint engine; updated ParseValidMoves to accept string
- **Files modified:** apps/server/Services/HookExecutor.cs
- **Verification:** ValidMoves count went from 0 (parse error) to 13 (then 84 after defId fix)
- **Committed in:** 96bb4f7

**6. [Rule 1 - Bug] Fixed tile defId to use plain color name**
- **Found during:** Task 2 verification (validMoves = 13 floor-only moves instead of pattern-line moves)
- **Issue:** GameService built tiles with `defId = "tile-blue"` but hooks.ts WALL_PATTERN and TILE_COLORS use plain `"blue"`. `getWallColumn(rowIdx, "tile-blue")` returned -1 (not found) so all pattern-line targets were skipped, leaving only floor-line moves
- **Fix:** Changed tile creation to use `defId = color` (just `"blue"` etc.)
- **Files modified:** apps/server/Services/GameService.cs
- **Verification:** ValidMoves count went from 13 (floor-only) to 84 (pattern lines + floor)
- **Committed in:** 96bb4f7

---

**Total deviations:** 6 auto-fixed (2 Rule 3 — blocking, 4 Rule 1 — bugs)
**Impact on plan:** All auto-fixes were necessary for correctness and functionality. The TypeScript stripper was the most significant deviation — the Phase 1 minimal stripper was not designed for the full hooks.ts. No scope creep.

## Issues Encountered

- The TypeScript stripping required multiple iterations (7 regex refinements) because the full hooks.ts uses features not present in Phase 1 stubs: generics in function signatures, inline object types (`Array<{ id: string }>`), multiline function signatures, complex type assertions, and variable type annotations with nested generics. Each iteration was guided by Python simulation + `node --check` validation to avoid shipping broken JS.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Server correctly creates Azul game sessions with proper initial state and processes valid moves
- `onRoundEnd` is wired — factory exhaustion in a real game should trigger wall-tiling and factory refill
- Ready for Phase 02-03 (client wiring: SceneManager multi-player, turn UI)
- Phase 02-04 (routes and game creation: landing page, game list, CreateGame API) can now be built on top of working POST /games
- One remaining concern: `dotnet watch` doesn't always reload when files change — manual container restart was needed during development. This is a dev workflow issue, not a production concern.

## Self-Check: PASSED

- HookExecutor.cs: FOUND
- GameService.cs: FOUND
- GameEndpoints.cs: FOUND
- GameSession.cs: FOUND
- Program.cs: FOUND
- docker-compose.yml: FOUND
- commit ada23e4 (Task 1 — HookExecutor): FOUND
- commit 0513a7b (Task 2 — GameService): FOUND
- commit 96bb4f7 (deviation fixes): FOUND
- API returns 84 valid moves for fresh 2-player Azul game: VERIFIED

---
*Phase: 02-azul-first-playable*
*Completed: 2026-03-01*
