---
phase: 05-ai-game-creation-toolkit
plan: "02"
subsystem: ui
tags: [sveltekit, vite, chokidar, pixi, devtools, testing]

# Dependency graph
requires:
  - phase: 05-01a
    provides: FreeformZone zone type added to engine, enabling freeform in schemaValidator validTypes
provides:
  - Browser-based dev test harness at /dev/harness for iterating on game packages
  - Random bot validator that plays random valid moves and reports crashes/deadlocks
  - Game config schema validator (game.json against GameConfig shape)
  - Vite game watcher plugin with chokidar watching libs/games/ and virtual:game-list module
  - Scenario load/export for jumping to specific game states
  - Dev panel for state manipulation (trigger round end/game end, advance turn, set score/phase/round)
affects: [05-03, 05-04, future-game-packages]

# Tech tracking
tech-stack:
  added: [chokidar@4]
  patterns:
    - "Vite virtual module pattern: resolveId('\0virtual:game-list') + load() for dynamic game discovery"
    - "import.meta.glob for static analysis of game.json files at build time"
    - "Svelte 5 runes: $state() in harness page, Svelte 4 <slot /> in layout"
    - "virtual.d.ts ambient declaration file for Vite virtual module TypeScript types"

key-files:
  created:
    - apps/client/src/routes/dev/+layout.svelte
    - apps/client/src/routes/dev/harness/+page.svelte
    - apps/client/src/routes/dev/harness/harness.ts
    - apps/client/src/routes/dev/harness/botRunner.ts
    - apps/client/src/routes/dev/harness/schemaValidator.ts
    - apps/client/src/virtual.d.ts
  modified:
    - apps/client/vite.config.ts
    - apps/client/src/app.d.ts
    - apps/client/package.json

key-decisions:
  - "virtual:game-list TypeScript declaration goes in separate virtual.d.ts (not app.d.ts) — avoids export{}/declare module conflict in ambient files"
  - "import.meta.glob for game.json loading instead of dynamic string import — Vite requires static analysis of dynamic imports"
  - "Comment block containing '*/' pattern causes early comment termination — JSDoc comment rewritten to avoid the pattern"
  - "chokidar@4 is ESM-only — uses named 'watch' export (not default), no require() usage"

patterns-established:
  - "Virtual Vite module pattern: resolveId + load handlers for build-time dynamic data"
  - "Game watcher plugin watches libs/games/ with chokidar, invalidates virtual module, sends full-reload HMR"
  - "Type declarations for Vite virtual modules in src/virtual.d.ts"

requirements-completed: [AIGC-04, AIGC-05]

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 5 Plan 02: Test Harness Summary

**Browser dev harness at /dev/harness with PixiJS renderer, chokidar HMR, virtual game discovery, schema validation, random bot validator, and scenario management**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-02T00:00:00Z
- **Completed:** 2026-03-02T00:15:00Z
- **Tasks:** 2
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments
- Built complete browser-based dev test harness at `/dev/harness` — dynamically discovers game packages, renders with PixiJS SceneManager, falls back to JSON viewer on error
- Implemented Vite `gameWatcherPlugin` with chokidar@4 watching `libs/games/` and `virtual:game-list` virtual module for zero-hardcoded game discovery
- Random bot validator plays up to 200 random valid moves, reports success/failure with reason (game-ended-normally, deadlock, max-moves-reached, error), move count, and duration
- Game config schema validator checks id/version/title/players/zones/pieces/turnOrder/hooks fields before session creation
- Dev panel with state manipulation (trigger round end/game end, advance turn, set score/phase/round), scenario load/export/copy, and auto-run bot on page load

## Task Commits

Each task was committed atomically:

1. **Task 1: Add game watcher Vite plugin and dev layout** - `2f17e97` (feat)
2. **Task 2: Build test harness page with dev panel, scenario management, and bot validator** - `3a1d5cd` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `apps/client/vite.config.ts` - Added chokidar imports, gameWatcherPlugin() function, plugin registered in plugins array
- `apps/client/src/routes/dev/+layout.svelte` - Dev-only layout wrapper with red DEV badge and Test Harness link, no auth requirement
- `apps/client/src/routes/dev/harness/+page.svelte` - Main test harness page: game selector, PixiJS renderer container, JSON state viewer, dev panel, bot validator UI, schema error display, scenario management
- `apps/client/src/routes/dev/harness/harness.ts` - Core harness logic: discoverGames() via virtual:game-list, fetchGameConfig() via import.meta.glob, createTestGame(), fetchGameState(), loadScenario(), exportScenario(), triggerRoundEnd(), triggerGameEnd(), setState()
- `apps/client/src/routes/dev/harness/botRunner.ts` - runBotValidation(): fetches state, picks random valid move, submits via POST /games/{id}/move, loops until finished/deadlock/maxMoves/error
- `apps/client/src/routes/dev/harness/schemaValidator.ts` - validateGameConfig(): validates game.json shape including zones with 'freeform' as valid type
- `apps/client/src/virtual.d.ts` - TypeScript ambient declaration for virtual:game-list module
- `apps/client/src/app.d.ts` - Cleaned up (removed failed virtual module declaration attempt)
- `apps/client/package.json` - chokidar@4 added to devDependencies

## Decisions Made
- **virtual:game-list TypeScript declaration in virtual.d.ts**: app.d.ts has `export {}` which makes it a module file — placing `declare module` after `export {}` doesn't register as ambient. Separate `virtual.d.ts` resolves this cleanly.
- **import.meta.glob for game.json files**: Vite cannot statically analyze `import(\`../${gameId}/game.json\`)` with variable paths. Using `import.meta.glob('../../../../libs/games/*/game.json')` creates a static map Vite can bundle; lookup by computed key at runtime.
- **Avoid `*/` in JSDoc block comments**: The pattern `libs/games/*/)` inside a `/* ... */` comment terminates the comment early at `*/`, causing parse errors. Comment rewritten to use plain text description instead.
- **chokidar@4 ESM imports**: chokidar@4 is ESM-only, uses named export `watch`. Cannot use `require()` or default import. vite.config.ts imports `{ watch as chokidarWatch }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed JSDoc comment containing '*/' causing early comment termination**
- **Found during:** Task 2 (harness.ts compilation)
- **Issue:** The comment `libs/games/*/)` inside a block comment terminated the comment at `*/`, causing 30+ TypeScript parse errors on subsequent lines
- **Fix:** Rewrote the comment line to use plain text without the problematic pattern: "enumerates libs/games/ dirs" instead of "enumerates libs/games/*/"
- **Files modified:** apps/client/src/routes/dev/harness/harness.ts
- **Verification:** tsc --noEmit passes cleanly
- **Committed in:** 3a1d5cd (Task 2 commit)

**2. [Rule 3 - Blocking] Created separate virtual.d.ts for virtual module type declaration**
- **Found during:** Task 2 (harness.ts compilation — virtual:game-list module not found)
- **Issue:** `declare module 'virtual:game-list'` in app.d.ts after `export {}` is not picked up by TypeScript as an ambient module declaration
- **Fix:** Created `apps/client/src/virtual.d.ts` as a pure ambient declaration file (no `export {}`) containing the virtual module type; removed declaration from app.d.ts
- **Files modified:** apps/client/src/virtual.d.ts (created), apps/client/src/app.d.ts (cleaned)
- **Verification:** tsc --noEmit passes cleanly, import resolves
- **Committed in:** 3a1d5cd (Task 2 commit)

**3. [Rule 1 - Bug] Replaced dynamic string import with import.meta.glob for game.json loading**
- **Found during:** Task 2 (fetchGameConfig implementation)
- **Issue:** Plan specified `import(\`../../../../libs/games/${gameId}/game.json\`)` — Vite cannot bundle dynamic imports with variable paths
- **Fix:** Used `import.meta.glob('../../../../libs/games/*/game.json', { eager: false })` to create a static map, then looks up by computed key at runtime. Added fallback to server API endpoint.
- **Files modified:** apps/client/src/routes/dev/harness/harness.ts
- **Verification:** tsc --noEmit passes cleanly
- **Committed in:** 3a1d5cd (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required. The harness uses existing Docker services (client:5173, server:8080).

## Next Phase Readiness
- Test harness is ready for use with the azul game package
- When Plan 05-03 generates new game packages, they will be automatically discovered by the harness via virtual:game-list
- Bot validator will run against generated hooks.ts implementations to catch crashes before human playtesting
- Scenario export allows saving interesting game states as regression test fixtures

---
*Phase: 05-ai-game-creation-toolkit*
*Completed: 2026-03-02*
