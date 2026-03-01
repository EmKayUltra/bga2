---
phase: 02-azul-first-playable
plan: "03"
subsystem: ui
tags: [svelte5, pixi, typescript, game-state, azul, scene-manager, turn-ui, animations]

# Dependency graph
requires:
  - phase: 02-azul-first-playable
    plan: "02"
    provides: "Server integration: POST /games, 84 valid moves, onRoundEnd auto-trigger"
  - phase: 02-azul-first-playable
    plan: "01"
    provides: "Complete Azul hooks.ts with getValidMoves, onMove, onRoundEnd"
provides:
  - SceneManager tracks currentPlayerIndex from server state (not hardcoded 'player-1')
  - SceneManager submits moves with action='pick-tiles', source zone ID, data.color and data.patternLineRow
  - SceneManager.onTurnChange and onGameFinished callbacks for page integration
  - AzulScene renders 2-4 player boards dynamically from real server GameState
  - AzulScene two-step tap-select: selectSource highlights color tiles + valid destinations
  - AzulScene animateMove tiles from source to destination with easeOutBack
  - Game page: turn banner toast, active player info bar, score summary overlay on game end
  - Floor overflow opt-in warning toggle (localStorage, default off)
affects: 02-04, game-routing, hot-seat-play

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SceneManagerState uses currentPlayerIndex/playerNames/playerScores arrays instead of single playerId"
    - "Two-step interaction: onSourceClick(zoneId, color) then onDestinationClick(zoneId) — no inline piece-piece click"
    - "Server zone IDs for multi-player: player-{n}-pattern-line-{row}, player-{n}-floor-line, player-{n}-wall"
    - "AzulScene.clearAll() full re-render on updateFromState — simple but correct for Phase 2"
    - "Turn banner auto-hides via setTimeout (2s), cleared on unmount via onDestroy"

key-files:
  created: []
  modified:
    - apps/client/src/lib/engine/SceneManager.ts
    - apps/client/src/lib/engine/AzulScene.ts
    - apps/client/src/routes/game/[id]/+page.svelte

key-decisions:
  - "SceneManager creates game session internally when no sessionId provided — removes page complexity"
  - "AzulScene clearAll() + full re-render on each move (not incremental update) — simple for Phase 2, Phase 3 can optimize"
  - "Server zone naming convention: player-{1-indexed}-pattern-line-{row} — AzulScene derives from playerIndex + 1"
  - "Score breakdown in score summary reads from player.data fields (wallScore, rowBonus etc) set by server hooks — display only, no client-side scoring"
  - "Floor overflow warning is opt-in (default off) stored in localStorage — consistent with CONTEXT.md decision"

patterns-established:
  - "AzulScene callback pattern: onSourceClick(zoneId, color) and onDestinationClick(zoneId) registered by SceneManager"
  - "SceneManager.wireClickHandlers() called after every updateFromState to keep callbacks current"
  - "Turn banner lifecycle: showTurnBanner → setTimeout 2s → clear, interrupted by next turn change"

requirements-completed: [AZUL-01, AZUL-02, AZUL-05]

# Metrics
duration: 11min
completed: 2026-03-01
---

# Phase 2 Plan 03: Client Scene and Turn UI Summary

**Multi-player Azul game page with two-step tap-select interaction, turn banner toast, active player info bar, animated tile moves, and game-end score summary overlay — driven by real server state**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-01T16:41:21Z
- **Completed:** 2026-03-01T16:52:20Z
- **Tasks:** 2 (Task 1 changes pre-committed by 02-04 agent; Task 2 committed here)
- **Files modified:** 3

## Accomplishments

- SceneManager fully rewired: drops hardcoded `playerId: 'player-1'`, derives `currentPlayerIndex`/`playerNames`/`playerScores` from server GameState on init and after every move
- SceneManager submits moves with Azul format: `action='pick-tiles'`, `source`, `data.color`, `data.patternLineRow` — matching server hook expectations
- AzulScene renders 2-4 player boards dynamically from real GameState zones, with active player highlighted via board border glow
- AzulScene implements two-step tap-select: step 1 selects source zone+color with blue glow and highlights valid destinations green; step 2 fires destination click → SceneManager submits move
- Game page replaces Phase 1 dev toolbar with production player info bar (Round N, Player Name's Turn, Score X, Move count) plus Floor warn toggle
- Turn banner animates in on each `onTurnChange` callback, auto-hides after 2 seconds
- Score summary overlay on game end: per-player breakdown table (Wall/Rows/Cols/Colors/Floor/Total), winner row in gold, "New Game" button navigates to lobby

## Task Commits

1. **Task 1: SceneManager multi-player turn tracking** - `7058e57` (feat — pre-committed by 02-04 agent)
   - Note: SceneManager was updated in the 02-04 execution context which ran before 02-03.
   - AzulScene was also committed in `534845b` (docs/02-04 partial summary commit)
2. **Task 2: AzulScene interaction + game page UI** - `ba74cba` (feat — this execution)

## Files Created/Modified

- `apps/client/src/lib/engine/SceneManager.ts` — Multi-player state: currentPlayerIndex from server, pick-tiles move format, onTurnChange/onGameFinished callbacks, auto-creates session if none provided (committed `7058e57`)
- `apps/client/src/lib/engine/AzulScene.ts` — 2-4 player board layout, selectSource/deselectSource/onSourceClick/onDestinationClick, animateMove, setActivePlayer, updateFromState (committed `534845b`)
- `apps/client/src/routes/game/[id]/+page.svelte` — Turn banner, player info bar, score summary overlay, floor overflow toggle, SceneManager callback wiring (committed `ba74cba`)

## Decisions Made

- **SceneManager creates session internally**: When `init()` called without sessionId, SceneManager calls `createGame` automatically. Previously the page did this separately. Centralizes session lifecycle.
- **Full re-render on move**: `updateFromState()` calls `clearAll()` + `renderBoard()`. Simple but correct for Phase 2. Phase 3+ can do incremental diff updates when performance matters.
- **Player index +1 for zone IDs**: Server zone IDs use `player-1-pattern-line-1` (1-indexed). AzulScene derives from `playerIndex + 1`. Matched server hook conventions established in Plan 02.
- **Score breakdown from player.data**: Final scores are computed server-side by hooks. The overlay reads `player.data.wallScore`, `rowBonus`, `colBonus`, `colorBonus`, `floorPenalty` if present, and falls back to 0. Display-only — no client-side scoring.

## Deviations from Plan

### Out-of-Order Execution

**Context: 02-04 agent ran before 02-03**
- **Found during:** Initial state read — `git log` showed commits `7058e57` and `534845b` modifying SceneManager.ts and AzulScene.ts under `feat(02-04)` labels.
- **Issue:** The 02-04 agent (landing page + game creation flow) updated `gameApi.ts` to require `playerNames[]` and changed `CreateGameResponse.id` to `CreateGameResponse.sessionId`. It then updated SceneManager.ts to match the new API signature. AzulScene.ts was committed in `534845b` (02-04 partial summary).
- **Resolution:** Both SceneManager and AzulScene were already in HEAD with all Phase 2 changes. Verified TypeScript compiled (0 errors), then focused on the remaining Task 2 work: updating `+page.svelte` with turn banner, info bar, and score summary.
- **Impact:** No duplicate work. Plan 02-03 tasks were split across two executions but all requirements met.

---

**Total deviations:** 1 (out-of-order execution — resolved automatically)
**Impact on plan:** All success criteria met. No functional gaps.

## Issues Encountered

- The `createGame` API signature changed between plans (02-03 planned `createGame('azul')` but 02-04 updated it to require `playerNames[]`). SceneManager.ts correctly uses the new signature `createGame('azul', ['Player 1', 'Player 2'])`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Game page is fully wired for interactive hot-seat play when connected to the running server
- In offline mode (server not available), the board renders correctly with empty factories and player boards
- Turn banner, info bar, score summary, and floor warning are all production-ready
- Ready for Phase 02-04 completion (game list route, lobby) — already committed as `534845b`
- Phase 3 concerns: real-time relay for remote play, incremental AzulScene updates for performance

## Self-Check: PASSED

- apps/client/src/lib/engine/SceneManager.ts: FOUND (7058e57)
- apps/client/src/lib/engine/AzulScene.ts: FOUND (534845b)
- apps/client/src/routes/game/[id]/+page.svelte: FOUND (ba74cba)
- TypeScript: 0 errors
- Puppeteer screenshot: game loads, 5 factories, 2 player boards, player info bar visible

---
*Phase: 02-azul-first-playable*
*Completed: 2026-03-01*
