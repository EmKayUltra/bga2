---
phase: 02-azul-first-playable
plan: "04"
subsystem: ui
tags: [svelte5, sveltekit, typescript, localstorage, game-creation]

# Dependency graph
requires:
  - phase: 02-azul-first-playable
    plan: "02"
    provides: "POST /games accepting playerNames[], GET /games/:id/state returning GameState"
provides:
  - "Landing page at / with 2-4 player name entry and Azul game creation flow"
  - "Game list page at /games reading localStorage bga2-recent-games, fetching status from server"
  - "Updated gameApi.ts: createGame(gameId, playerNames[]) returning {sessionId, gameId, version}"
  - "localStorage helpers: saveRecentGame, loadRecentGames, removeRecentGame"
affects: [02-azul-first-playable/02-03, future-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Svelte 5 runes ($state, $derived) for reactive form state"
    - "SvelteKit goto() for post-form-submit navigation"
    - "localStorage for client-side game history (key: bga2-recent-games)"
    - "Promise.all for parallel status fetching in game list"

key-files:
  created:
    - apps/client/src/routes/+page.svelte
    - apps/client/src/routes/games/+page.svelte
  modified:
    - apps/client/src/lib/api/gameApi.ts
    - apps/client/src/lib/engine/SceneManager.ts
    - apps/client/src/routes/game/[id]/+page.svelte

key-decisions:
  - "createGame signature: (gameId, playerNames[]) — server POST /games body includes playerNames"
  - "CreateGameResponse: {sessionId, gameId, version} — sessionId replaces old id field"
  - "localStorage key bga2-recent-games holds array of RecentGame objects (prepended, max 20 entries)"
  - "Game status: fetched via getGameState per session; not-found (404) → expired badge + remove option"

patterns-established:
  - "Landing page as game entry point: player count selector drives dynamic name input count"
  - "Post-game-creation flow: save to localStorage then goto /game/{sessionId}"
  - "Game list: localStorage read on mount, parallel status fetch, cached for session lifetime"

requirements-completed: [PLAT-01]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 2 Plan 04: Routes and Game Creation Summary

**Landing page with 2-4 player name entry, game creation via POST /games with playerNames, and game list page reading localStorage with parallel server status checks — full entry flow for Azul**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T16:41:34Z
- **Completed:** 2026-03-01T16:46:37Z
- **Tasks:** 2 of 3 complete (Task 3 awaiting human verification)
- **Files modified:** 5

## Accomplishments

- Landing page at / with player count dropdown (2-4), dynamic name inputs, loading state, error handling, and goto navigation post-creation
- Game list at /games with localStorage read, parallel `getGameState` fetches, status badges (In Progress/Finished/Expired), Continue links, and expired-game removal
- gameApi.ts updated: `createGame(gameId, playerNames[])` with `{sessionId, gameId, version}` response, plus localStorage helpers (`saveRecentGame`, `loadRecentGames`, `removeRecentGame`)
- Fixed downstream callers (SceneManager.ts, game/[id]/+page.svelte) to use new `createGame` signature and `response.sessionId`

## Task Commits

Each task was committed atomically:

1. **Task 1: Landing page with player name entry and game creation flow** - `1aaa71c` (feat)
2. **Task 2: Game list page for resuming games** - `7058e57` (feat)
3. **Task 3: Visual and functional verification** - PENDING human checkpoint

## Files Created/Modified

- `apps/client/src/routes/+page.svelte` - Landing page: player count selector, dynamic name inputs, createGame call, localStorage save, goto navigation
- `apps/client/src/routes/games/+page.svelte` - Game list: reads bga2-recent-games localStorage, parallel status fetch, status badges, Continue/Remove actions
- `apps/client/src/lib/api/gameApi.ts` - Updated createGame signature, new CreateGameResponse type, added RecentGame type + localStorage helpers
- `apps/client/src/lib/engine/SceneManager.ts` - Fixed createGame call to new signature (playerNames arg) and response.sessionId
- `apps/client/src/routes/game/[id]/+page.svelte` - Fixed test createGame call to new signature and response.sessionId

## Decisions Made

- `createGame` accepts `playerNames: string[]` — passed directly to POST /games body, which Azul server hooks use to initialize `ctx.players`
- `CreateGameResponse` now returns `{sessionId, gameId, version}` matching the server response shape from Plan 02-02 (old `{id}` shape was Plan 01 legacy)
- localStorage key `bga2-recent-games` stores an array; new games prepended (most recent first); max 20 entries to prevent unbounded growth
- 404 on `getGameState` treated as "expired" — shows badge and Remove button rather than crashing the list

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SceneManager.ts using old createGame signature**
- **Found during:** Task 2 (tsc check after gameApi.ts update)
- **Issue:** SceneManager.ts called `createGame('azul')` (single arg) and accessed `response.id` — both broken after gameApi signature update
- **Fix:** Updated call to `createGame('azul', ['Player 1', 'Player 2'])` and `response.sessionId`
- **Files modified:** `apps/client/src/lib/engine/SceneManager.ts`
- **Verification:** tsc --noEmit passes
- **Committed in:** `7058e57` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed game/[id]/+page.svelte using old createGame signature**
- **Found during:** Task 1 (grep for createGame usages before updating +page.svelte)
- **Issue:** Test demo path called `createGame('azul')` and `response.id` — both broken after API update
- **Fix:** Updated to `createGame('azul', ['Player 1', 'Player 2'])` and `response.sessionId`
- **Files modified:** `apps/client/src/routes/game/[id]/+page.svelte`
- **Verification:** tsc --noEmit passes
- **Committed in:** `1aaa71c` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug fixes from signature propagation)
**Impact on plan:** Both auto-fixes necessary for TypeScript correctness. Fully in scope as direct consequence of the gameApi update.

## Issues Encountered

- Pre-existing uncommitted SceneManager.ts changes (from Plan 02-03 work) initially caused AzulScene method errors in tsc; resolved by ensuring only the two direct `createGame`-related errors were fixed. After fixing those two lines, full tsc passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Task 3 (human verify) pending: start Docker, open http://localhost:5173/, exercise full Azul game flow
- After human verification: phase 2 complete — all four plans done
- Phase 3 readiness: real-time relay layer decision needed before planning (AppSync vs Cloudflare vs API Gateway WebSockets)

---
*Phase: 02-azul-first-playable*
*Completed: 2026-03-01*
