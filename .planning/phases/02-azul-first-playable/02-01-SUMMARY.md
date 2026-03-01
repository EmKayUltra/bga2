---
phase: 02-azul-first-playable
plan: "01"
subsystem: game-logic
tags: [azul, vitest, tdd, hooks, game-rules, typescript]

# Dependency graph
requires:
  - phase: 01-engine-foundation
    provides: HookContext, HookFunctions, ValidMove, Move, GameState shared-types contracts; HookExecutor.cs Jint pipeline that will execute hooks.ts
provides:
  - Complete Azul game logic in libs/games/azul/src/hooks.ts (getValidMoves, onMove, onRoundEnd)
  - 32 passing unit tests in libs/games/azul/src/hooks.test.ts covering AZUL-01 through AZUL-05
  - vitest.config.ts for the games-azul library
affects: 02-02, 02-03, 02-04, server-integration, hook-executor

# Tech tracking
tech-stack:
  added: [vitest (configured for games-azul library)]
  patterns:
    - "Azul state in GameState.players[i].data (AzulPlayerData: wall boolean[][], patternLines, floorLine, hasFirstPlayerToken)"
    - "Hook functions mutate ctx.state in place — never reassign ctx.state (HookExecutor Jint requirement)"
    - "WALL_PATTERN 5x5 color grid for fixed tile placement layout"
    - "getWallColumn(row, color) maps color to column for adjacency scoring"

key-files:
  created:
    - libs/games/azul/src/hooks.test.ts
    - libs/games/azul/vitest.config.ts
  modified:
    - libs/games/azul/src/hooks.ts
    - libs/games/azul/project.json

key-decisions:
  - "Floor overflow double-stage: picked tiles → pattern line → excess to floor → excess-of-floor to lid"
  - "First-player token saved before step 2 floor clearing to correctly set next round starting player"
  - "Lid-to-bag shuffle happens inside populateFactories (not onRoundEnd directly)"
  - "vitest.config.ts added to games-azul; project.json updated with configFile option for NX executor"
  - "Test fix: floor-cleared-to-lid test needs bag tiles to prevent lid from being consumed for factory refill"

patterns-established:
  - "AzulPlayerData: cast player.data as unknown as AzulPlayerData for type-safe access"
  - "scoreWallPlacement: count hRun and vRun including self; score = (hRun>1?hRun:0) + (vRun>1?vRun:0) or 1 for isolated tile"
  - "Save first-player token holder before clearing hasFirstPlayerToken in floor penalty step"

requirements-completed: [AZUL-01, AZUL-02, AZUL-03, AZUL-04, AZUL-05]

# Metrics
duration: 8min
completed: 2026-03-01
---

# Phase 2 Plan 01: Azul Game Hooks Summary

**Complete Azul rule engine (getValidMoves, onMove, onRoundEnd) with 32 passing unit tests covering all 5 requirements**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-01T15:59:08Z
- **Completed:** 2026-03-01T16:08:04Z
- **Tasks:** 1 (TDD: 2 commits — test RED, feat GREEN)
- **Files modified:** 4

## Accomplishments

- Full Azul factory-offer phase: `getValidMoves` enumerates all valid (source, color, patternLine) combinations including floor-line-only moves, enforces wall color constraints, and returns empty for non-factory-offer phases
- Complete tile drafting: `onMove` handles factory/center picks, first-player token acquisition (floor line + flag), floor-line overflow routing to lid, leftover tiles to center, turn advancement with wrap-around, round-end detection
- Full round-end pipeline: `onRoundEnd` handles wall tiling with adjacency scoring, floor penalties (-1/-1/-2/-2/-2/-3/-3, floor → 0), end-game bonuses (+2 row, +7 column, +10 color), tiebreak by complete rows, factory refill with lid-to-bag shuffle when bag empty, first-player token placement for next round
- 32 unit tests pass covering AZUL-01 through AZUL-05, TypeScript compiles clean with tsc --noEmit

## Task Commits

TDD execution with two commits:

1. **RED — failing tests** — `474fda9` (test)
2. **GREEN — full implementation** — `1905ed7` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `libs/games/azul/src/hooks.ts` — Full Azul logic: 3 hook functions + 7 helpers + constants (WALL_PATTERN, FLOOR_PENALTIES, TILE_COLORS)
- `libs/games/azul/src/hooks.test.ts` — 32 unit tests, 3 describe blocks (getValidMoves, onMove, onRoundEnd)
- `libs/games/azul/vitest.config.ts` — vitest config using nxViteTsPaths plugin
- `libs/games/azul/project.json` — Updated test target with configFile option

## Decisions Made

- **First-player token save order**: Must capture which player has `hasFirstPlayerToken` BEFORE step 2 clears it. Fixed bug where `nextStartPlayerIdx` was re-computed after clearing.
- **Center leftover restoration**: When picking from center, separated leftover pieces were being lost. Fixed by putting leftover back into center zone after clearing it.
- **Lid-consumed-for-refill test scenario**: Floor-cleared-to-lid test needed bag tiles; without them, `populateFactories` consumes the lid tiles (correct behavior) making lid appear empty. Test updated to include bag tiles.
- **vitest config**: NX `@nx/vite:test` executor requires `configFile` option pointing to the vitest.config.ts to correctly find test files in the library.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed center-pick leftover tile loss**
- **Found during:** GREEN phase (test "picking from center leaves other colors in center" failing)
- **Issue:** `state.zones[sourceId].pieces = []` clears the center zone, then leftover pieces were put back for factories but NOT for center source
- **Fix:** Added else branch to put leftover back into center.pieces when source is 'center'
- **Files modified:** libs/games/azul/src/hooks.ts
- **Commit:** 1905ed7

**2. [Rule 1 - Bug] Fixed first-player token holder detection order**
- **Found during:** GREEN phase (test "player with first-player token starts next round" failing)
- **Issue:** Step 2 clears `hasFirstPlayerToken` for all players; step 4 re-checked it after clearing — always returned 0
- **Fix:** Saved `nextRoundStartPlayerIdx` BEFORE step 2 floor-clearing loop
- **Files modified:** libs/games/azul/src/hooks.ts
- **Commit:** 1905ed7

**3. [Rule 1 - Bug] Fixed test scenario for floor-to-lid verification**
- **Found during:** GREEN phase (test "floor line cleared and tiles moved to lid" failing)
- **Issue:** Test had empty bag, so `populateFactories` consumed the lid tiles (correct Azul behavior), making lid appear empty post-onRoundEnd
- **Fix:** Added bag tiles to test state so lid is not consumed; also strengthened assertion to check specific defIds in lid
- **Files modified:** libs/games/azul/src/hooks.test.ts
- **Commit:** 1905ed7

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs discovered during GREEN phase)
**Impact on plan:** All auto-fixes were necessary for correctness. No scope creep.

## Issues Encountered

- NX `@nx/vite:test` executor silently fails without `configFile` option — worked around by running `npx vitest run --config libs/games/azul/vitest.config.ts` directly for test verification, and updating project.json to fix the NX integration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Azul hook logic complete and tested — server's `GameService.cs` can now activate real move validation (the `validMoves.Count > 0` guard will engage)
- `onRoundEnd` is implemented but the server's `ValidateAndApplyMove` pipeline needs to call it when all factories are empty (see RESEARCH.md Open Question 1)
- `HookExecutor.cs BuildHookContext` still has `players: []` bug documented in RESEARCH.md — Phase 2 server work must fix it
- Ready for Phase 02-02 which will wire the server and client to use real hook output

## Self-Check: PASSED

- hooks.ts: FOUND
- hooks.test.ts: FOUND
- vitest.config.ts: FOUND
- SUMMARY.md: FOUND
- commit 474fda9 (test RED): FOUND
- commit 1905ed7 (feat GREEN): FOUND

---
*Phase: 02-azul-first-playable*
*Completed: 2026-03-01*
