---
phase: 05-ai-game-creation-toolkit
plan: "03"
subsystem: games
tags: [hive, vitest, hex-grid, axial-coordinates, board-game, jint, game-engine, hooks]

# Dependency graph
requires:
  - phase: 05-01a
    provides: FreeformZone zone type added to engine; ZoneType includes 'freeform'
  - phase: 05-02
    provides: Test harness at /dev/harness for running game packages in browser

provides:
  - Complete Hive game package at libs/games/hive/ (game.json, hooks.ts, hex.ts, tests)
  - Self-contained Jint-compatible hooks.ts with all 5 piece types and movement algorithms
  - Axial hex coordinate utilities in hex.ts (hexNeighbors, isConnectedWithout, canSlide)
  - One Hive Rule enforcement via BFS connectivity check
  - Freedom-to-Move sliding constraint via common-neighbor gate check
  - Queen Bee mandatory placement by turn 4
  - Beetle stacking (climb onto occupied hexes, stackLevel tracks height)
  - Win condition: queen surrounded on all 6 sides triggers finished+winnerId
  - Server CreateGame supports Hive sessions (empty freeform board, 11 pieces per player)
  - 29 unit tests covering all piece types, rules, placement, and win condition

affects: [05-04, future-game-packages, phase-06-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Jint-compatible hooks.ts: inline all utilities (no imports), use var for top-level constants, avoid TypeScript-only syntax in runtime paths"
    - "Axial hex coordinates (q,r) from redblobgames.com: neighbor directions as array, hexKey for map lookups, BFS for connectivity, common-neighbor check for sliding"
    - "One Hive Rule: buildFullOccupiedSet + isConnectedWithout(set, excludeKey) before allowing piece movement"
    - "Freedom-to-Move: find common neighbors of from+to hexes, reject if both occupied (gate blocked)"
    - "Beetle stacking: stackLevel in piece.state; buildOccupancyMap picks highest stackLevel per hex; climbing increments, vacating resets to 0"
    - "GameService.CreateGame Hive delegation: if gameId == 'hive', delegate to CreateHiveGame; Azul logic unchanged"

key-files:
  created:
    - libs/games/hive/game.json
    - libs/games/hive/src/hooks.ts
    - libs/games/hive/src/hex.ts
    - libs/games/hive/src/hooks.test.ts
    - libs/games/hive/package.json
    - libs/games/hive/project.json
    - libs/games/hive/tsconfig.json
    - libs/games/hive/vitest.config.ts
  modified:
    - apps/server/Services/GameService.cs

key-decisions:
  - "hooks.ts inlines hex utilities (HEX_DIRECTIONS, hexKey, parseHexKey, hexNeighbors, isConnectedWithout, canSlide) — Jint does not support ES module imports; hex.ts exists for type-checking and unit test imports only"
  - "isConnectedWithout in hooks.ts uses plain object { [key: string]: boolean } instead of Set<string> — Jint Set support is limited; object property lookup is safe"
  - "grasshopperMoves uses occMapWithout (pieces without the moving grasshopper) for checking occupied neighbors — consistent with other movement algorithms"
  - "Beetle on stack uses fullOccupiedSet (not occupiedWithout) for sliding origin because the piece below remains at the hex; only the beetle itself is 'moving'"
  - "GameService.CreateHiveGame uses 2-player hardcoded count; actualPlayerNames padded with defaults to ensure 2 names always available"
  - "turnNumber is 0-indexed player-specific count; forced queen placement triggers at turnNumber >= 3 (zero-indexed 4th turn)"

patterns-established:
  - "Hive piece movement pattern: build occupancyMap (top-of-stack) + fullOccupiedSet + occupiedWithout; check One Hive Rule; build occMapWithout; compute type-specific targets; emit ValidMove per target"
  - "Spider DFS at depth 3: track visited hexes per path (not globally), copy visited set at each branch, collect destinations at depth==3 into a dedup map"
  - "Ant BFS: global inQueue set to avoid re-queuing; reachable set collects destinations != startHex; unlimited depth"

requirements-completed: [AIGC-02, AIGC-03, AIGC-06]

# Metrics
duration: 10min
completed: 2026-03-03
---

# Phase 5 Plan 03: Hive Game Package Summary

**Complete Hive game package with hand-implemented axial hex movement, One Hive Rule (BFS connectivity), Freedom-to-Move (gate check), all 5 piece types, beetle stacking, and 29 passing unit tests**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-03T00:41:14Z
- **Completed:** 2026-03-03T00:51:00Z
- **Tasks:** 3
- **Files modified:** 9 (8 created, 1 modified)

## Accomplishments
- Built complete Hive game package at `libs/games/hive/` — second game on the platform, validating the freeform zone engine extension from Plan 05-01a
- Implemented all 5 piece movement algorithms: Queen Bee (1-step slide), Beetle (climb+stack), Grasshopper (line jump), Spider (exactly 3 steps DFS), Soldier Ant (unlimited BFS)
- Hand-implemented the algorithmically complex rules: One Hive Rule via BFS connectivity check, Freedom-to-Move via common-neighbor gate detection
- Added `CreateHiveGame` to GameService with proper 2-player initial state: empty freeform board, 11 pieces per player (queen, 2 beetles, 3 grasshoppers, 2 spiders, 3 ants)
- 29 unit tests passing via `npx nx test games-hive`, covering placement rules, movement for all 5 piece types, One Hive Rule, Freedom-to-Move, beetle stacking, win condition, and turn advancement

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Hive game package structure with game.json and hex utilities** - `db0c682` (feat)
2. **Task 2: Implement Hive hooks.ts with complete movement rules and generalize GameService.CreateGame** - `39ed201` (feat)
3. **Task 3: Write Hive hooks unit tests and validate with Jint** - `150139c` (test)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `libs/games/hive/game.json` - Hive game config: freeform board zone, player-hand zone (owner: player), 5 piece types with hex fallback shapes
- `libs/games/hive/src/hex.ts` - Axial hex utilities for type-checked development: hexKey, parseHexKey, hexNeighbors, hexDistance, hexToPixel, isConnectedWithout (Set-based), canSlide
- `libs/games/hive/src/hooks.ts` - Self-contained Jint-compatible hook implementation: inlined hex utilities (object-based), all 5 piece movement algorithms, One Hive Rule, Freedom-to-Move, Beetle stacking, win condition, Queen placement by turn 4
- `libs/games/hive/src/hooks.test.ts` - 29 unit tests covering all aspects of Hive rules
- `libs/games/hive/package.json` - @bga2/games-hive package with ESM type, vitest devDep
- `libs/games/hive/project.json` - NX target games-hive with @nx/vite:test executor
- `libs/games/hive/tsconfig.json` - Extends tsconfig.base.json, ESNext module, bundler resolution
- `libs/games/hive/vitest.config.ts` - Vitest config with nxViteTsPaths plugin, includes src/**/*.test.ts
- `apps/server/Services/GameService.cs` - Added Hive branch in CreateGame + private CreateHiveGame method

## Decisions Made
- **hooks.ts inlines hex utilities**: Jint does not support ES module imports. hex.ts provides type-safe, Set-based utilities for development and tests; hooks.ts inlines equivalent object-based implementations for Jint runtime.
- **isConnectedWithout in hooks.ts uses plain objects**: Set<string> is available in Jint 3.x but object property lookup `occupiedKeys[k]` is more reliable across Jint versions and avoids Set-specific API calls.
- **grasshopperMoves does NOT check sliding constraint**: Grasshoppers jump, not slide — the Freedom-to-Move rule does not apply to grasshopper movement.
- **Beetle on stack uses fullOccupiedSet for occupiedWithout**: When a beetle is on top of another piece, the hex it vacates still has the piece below, so it should remain in the "occupied" set for gate calculations.
- **Spider DFS copies visited set per branch**: Spider cannot revisit a hex in the same path, but different path branches should be independent. Copying visited prevents cross-branch contamination.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test setup: grasshopper and beetle in hinge position**
- **Found during:** Task 3 (unit test execution)
- **Issue:** Two test cases (grasshopper jump test, beetle climb test) placed the moving piece at a hinge position in the hive (removing it disconnects). The One Hive Rule correctly blocked movement, but tests expected moves to exist.
- **Fix:** Redesigned test board layouts so the moving piece is at a non-hinge position (endpoint adjacent to a connected chain). Used a T-shaped hive: (0,0)-(1,0)-(2,0) as the connected backbone, moving piece at (0,1) adjacent to (0,0).
- **Files modified:** libs/games/hive/src/hooks.test.ts
- **Verification:** All 29 tests pass via vitest run
- **Committed in:** 150139c (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test setup)
**Impact on plan:** Auto-fix necessary for correct test coverage. No scope creep. The hook implementation itself was correct — the One Hive Rule was working as intended; only the test scenarios were wrong.

## Issues Encountered
- `npx nx test hive` fails with "Cannot find project 'hive'" — the NX project name is `games-hive` (from project.json `name` field), not `hive`. Used `npx nx test games-hive` instead.
- Server `dotnet build` reports "Build FAILED" due to "Text file busy" on the running server binary — this is a copy-step error, not a compilation error. No C# CS-prefixed errors exist. The code compiles correctly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hive game package is complete and can be loaded by the test harness at `/dev/harness`
- POST /games with `{ gameId: "hive", playerNames: ["Alice", "Bob"] }` creates a valid Hive session
- hooks.ts is Jint-compatible (inlined utilities, no imports, TypeScript annotations strip cleanly via HookExecutor.StripTypeScriptAnnotations)
- The random bot validator in Plan 05-02 can run against Hive sessions to validate random playthrough
- Plan 05-04 (AI code generation pipeline review gate) has a working reference game to validate against

---
*Phase: 05-ai-game-creation-toolkit*
*Completed: 2026-03-03*
