---
phase: 01-engine-foundation
plan: "07"
subsystem: client
tags: [typescript, svelte, sveltekit, pixi.js, xstate, fsm, game-engine, integration]

# Dependency graph
requires:
  - phase: 01-engine-foundation
    plan: "03"
    provides: createGameFSM, GameFSMConfig, FSMContext, PhaseConfig, StageConfig
  - phase: 01-engine-foundation
    plan: "04"
    provides: GameLoader, RuntimeGameModel, Zone, Piece, PieceFactory
  - phase: 01-engine-foundation
    plan: "05"
    provides: PixiAdapter, StubRenderer, IRenderer interface
  - phase: 01-engine-foundation
    plan: "06"
    provides: POST /games, GET /games/:id/state, POST /games/:id/move endpoints

provides:
  - SceneManager: orchestrates renderer + FSM + game model + server API
  - AzulScene: Azul-specific board rendering using only IRenderer (renderer abstraction proven)
  - gameApi: createGame/getGameState/submitMove with error handling
  - SvelteKit game page at /game/[id] with SSR disabled, viewport canvas, dev toolbar
  - azulGameConfig: Azul game.json embedded as TypeScript for Vite module resolution

affects: [02-game-engine, 03-multiplayer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SSR-safe SceneManager: dynamic import of PixiAdapter inside init() (called only in onMount)
    - IRenderer abstraction proven: AzulScene imports only IRenderer types, no PixiJS direct
    - Svelte 5 runes: $state, $props for reactive game state in page component
    - SvelteKit ssr=false guard on game route (prevents PixiJS crash during SSR)
    - tsconfig extends array (TS 5.x feature): extends .svelte-kit/tsconfig.json + tsconfig.base.json for $types resolution
    - Dev toolbar pattern: fixed bottom bar showing FSM state for Phase 1 debugging

key-files:
  created:
    - apps/client/src/lib/api/gameApi.ts
    - apps/client/src/lib/engine/SceneManager.ts
    - apps/client/src/lib/engine/AzulScene.ts
    - apps/client/src/lib/azul-game-config.ts
    - apps/client/src/routes/game/[id]/+page.svelte
    - apps/client/src/routes/game/[id]/+page.ts
  modified:
    - apps/client/tsconfig.json

key-decisions:
  - "SceneManager uses dynamic import for both PixiAdapter and xstate's createActor — avoids SSR crashes; PixiAdapter requires browser globals, createActor is safe but dynamic import keeps the pattern consistent"
  - "azul-game-config.ts embeds game.json as TypeScript module — avoids Vite JSON import path alias complexity with @bga2/games-azul/game.json; in Phase 2 this will be replaced with server-side game registry"
  - "apps/client/tsconfig.json now extends array [.svelte-kit/tsconfig.json, tsconfig.base.json] — TypeScript 5.x array extends enables both SvelteKit $types path resolution (rootDirs) and NX monorepo path aliases"
  - "AzulScene renders all zones using IRenderer.createSprite with textureId encoding piece metadata (piece:defId:color:label) — PixiAdapter uses the textureId as a fallback key; proves renderer abstraction since StubRenderer also accepts any textureId"
  - "FSM initialized with stub GameState in SceneManager.init() — createGameFSM requires input.gameState; Phase 1 uses a hardcoded stub state; Phase 2 will use real state from server"

requirements-completed: [ENG-01, ENG-02, ENG-06, ENG-07, ENG-08, ENG-09, ENG-10]

# Metrics
duration: 8min
completed: 2026-03-01
---

# Phase 01 Plan 07: SvelteKit Game Page Integration with Azul Scene Summary

**Full-stack integration: SvelteKit game page mounting PixiJS canvas, SceneManager orchestrating renderer + FSM + GameLoader + server API, AzulScene rendering Azul board using only IRenderer abstraction — proven swappable with StubRenderer**

## Performance

- **Duration:** ~30 min (8 min auto tasks + visual verification iteration)
- **Started:** 2026-03-01T06:10:42Z
- **Completed:** 2026-03-01
- **Tasks:** 3 of 3 (2 auto + 1 visual verification checkpoint)
- **Files created/modified:** 12

## Accomplishments

- **`gameApi.ts`** (131 lines): `createGame(gameId)`, `getGameState(sessionId)`, `submitMove(sessionId, move)` — all with network error handling, 4xx body parsing, typed response interfaces

- **`SceneManager.ts`** (361 lines): Full orchestration layer. `init()` dynamically imports PixiAdapter (SSR-safe), initializes renderer with 2000x1500 world, enables viewport (drag/pinch/wheel), loads game model via GameLoader, creates XState FSM with factoryOffer/wallTiling phases using stub GameState input, creates AzulScene and renders board, wires piece click handlers. `handlePieceClick()` manages select → highlight → submit → animate → update cycle. `handleMoveResult()` handles valid/invalid server responses.

- **`AzulScene.ts`** (446 lines): Azul-specific rendering through IRenderer only. `renderBoard()` draws: 5 factory circles with 2×2 tile slots (or empty placeholder slots), center area, 2 player boards each with right-aligned pattern lines (1–5 cells), 5×5 wall grid, 7-slot floor line. `selectPiece()` applies blue glow (0x4a90ff). `highlightValidMoves()` applies green glow (0x22c55e) to pieces in valid destination zones. `animatePiece()` uses easeOutBack easing. **No PixiJS imports** — renderer abstraction proven.

- **`+page.svelte`** (305 lines): SvelteKit game page. `onMount` dynamically imports SceneManager, loads azulGameConfig, calls `init()`. Reactive dev toolbar using Svelte 5 `$state` runes — shows FSM state, session ID, valid move count, last move result. Loading spinner and error overlay. `onDestroy` calls `sceneManager.destroy()`.

- **`+page.ts`** (21 lines): `export const ssr = false` (primary SSR guard), `load()` extracts game ID from params.

- **`azulGameConfig.ts`** (87 lines): Azul game.json embedded as TypeScript — all 15 zones, 6 piece defs, typed as `GameConfig`.

- **`tsconfig.json` update**: Extended to `[".svelte-kit/tsconfig.json", "../../tsconfig.base.json"]` — enables `$types.js` module resolution via SvelteKit's `rootDirs` while keeping NX monorepo path aliases (`@bga2/engine-core`, `@bga2/shared-types`).

## Task Commits

1. **Task 1: Build SceneManager, AzulScene, and game API client** — `273cccc` (feat)
2. **Task 2: Mount game page in SvelteKit and wire end-to-end flow** — `e30ccfc` (feat)
3. **Task 3: Visual verification checkpoint** — `79080c1` (fix: setPosition, layout, Puppeteer harness), `e64ae08` (feat: wall colors, warm palette, body reset)

## Files Created/Modified

- `apps/client/src/lib/api/gameApi.ts` — createGame, getGameState, submitMove (131 lines)
- `apps/client/src/lib/engine/SceneManager.ts` — orchestration layer (361 lines)
- `apps/client/src/lib/engine/AzulScene.ts` — Azul board rendering via IRenderer only (446 lines)
- `apps/client/src/lib/azul-game-config.ts` — embedded Azul game.json as TypeScript (87 lines)
- `apps/client/src/routes/game/[id]/+page.svelte` — SvelteKit game page with dev toolbar (305 lines)
- `apps/client/src/routes/game/[id]/+page.ts` — ssr=false, load() (21 lines)
- `apps/client/tsconfig.json` — extended for SvelteKit $types + NX path aliases

## Decisions Made

- Dynamic PixiAdapter import inside `SceneManager.init()` (not at module top-level) — matches SvelteKit's `onMount` pattern; PixiAdapter's `@mszu/pixi-ssr-shim` first import is its own secondary guard, but the dynamic import ensures the module never runs on the server.
- Embedded `azulGameConfig.ts` instead of `@bga2/games-azul/game.json` import — the NX path alias `@bga2/games-azul` maps to `libs/games/azul/src/index.ts`, not the package root; resolving `@bga2/games-azul/game.json` would require explicit `exports` field in the azul package.json. Embedding as TypeScript is simpler for Phase 1.
- tsconfig.json array extends (TypeScript 5.x) — extends the svelte-kit generated tsconfig first for `rootDirs` (needed for `$types.d.ts` virtual module), then the monorepo base for `paths` (needed for `@bga2/*` aliases).
- FSM stub GameState in SceneManager — `createGameFSM`'s machine requires `input.gameState` via XState v5's `input` mechanism. Phase 1 uses a minimal stub object; Phase 2 will pass the real server state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] StageConfig and PhaseConfig do not have `label` fields**
- **Found during:** Task 1 (tsc --noEmit check)
- **Issue:** Plan specified creating FSM with `{ id: 'factoryOffer', label: 'Factory Offer', stages: [...] }` but `PhaseConfig` only has `id` and `stages`; `StageConfig` only has `id`. The `label` fields don't exist.
- **Fix:** Removed `label` from both `PhaseConfig` and `StageConfig` usage in `SceneManager.init()`
- **Files modified:** apps/client/src/lib/engine/SceneManager.ts
- **Commit:** 273cccc

**2. [Rule 1 - Bug] createActor requires 2 arguments (machine + options with input)**
- **Found during:** Task 1 (tsc --noEmit check)
- **Issue:** `createGameFSM` returns a machine whose context function requires `input: FSMContext`. Calling `createActor(machine)` with one argument fails because the machine has no default input. TypeScript reports TS2554 (expected 2 arguments, got 1).
- **Fix:** Added stub `GameState` object and `createActor(machine, { input: { gameState: stubState, round: 1, currentPlayerIndex: 0 } })` in SceneManager.init()
- **Files modified:** apps/client/src/lib/engine/SceneManager.ts
- **Commit:** 273cccc

**3. [Rule 3 - Blocking] SvelteKit $types module not resolving — tsconfig doesn't include svelte-kit types**
- **Found during:** Task 2 (tsc --noEmit check on +page.ts)
- **Issue:** `Cannot find module './$types.js'` because the client tsconfig didn't extend `.svelte-kit/tsconfig.json`, which provides the `rootDirs` mapping that makes `$types` virtual modules work.
- **Fix:** Updated `apps/client/tsconfig.json` to use array extends `[".svelte-kit/tsconfig.json", "../../tsconfig.base.json"]` and added `.svelte-kit/ambient.d.ts`, `.svelte-kit/non-ambient.d.ts`, `.svelte-kit/types/**/$types.d.ts` to the include list.
- **Files modified:** apps/client/tsconfig.json
- **Commit:** e30ccfc

**4. [Rule 1 - Bug] @bga2/games-azul/game.json import not resolvable via NX path alias**
- **Found during:** Task 2 (planning the import strategy)
- **Issue:** The NX tsconfig path alias `@bga2/games-azul` maps to `libs/games/azul/src/index.ts` — it doesn't expose a sub-path for `game.json`. The azul package.json also has no `exports` field for json files.
- **Fix:** Created `apps/client/src/lib/azul-game-config.ts` embedding the game config as TypeScript; imported via `$lib/azul-game-config.js` alias which is reliably resolved by SvelteKit.
- **Files modified:** apps/client/src/lib/azul-game-config.ts (created), +page.svelte (updated import)
- **Commit:** e30ccfc

---

**Total deviations:** 4 auto-fixed (2 Rule 1 - Bug, 1 Rule 3 - Blocking, 1 Rule 1 - Bug)
**Impact on plan:** All fixes are essential for compilation. Core architecture implemented exactly as specified.

## Checkpoint Status: PASSED

Task 3 visual verification completed via Puppeteer screenshot harness. Rendering fixes applied:
- Added setPosition() to IRenderer (sprites were at 0,0)
- Azul wall ghost color pattern (5-color rotating grid)
- Warm tan factory circles, light board backgrounds
- Factory radius 68px to contain 2x2 tile grid
- Player boards stacked vertically, world 640x1200
- Body margin reset, container height accounts for dev toolbar
- Both player boards fully visible with floor lines

## Self-Check: PASSED

Files verified:
- apps/client/src/lib/api/gameApi.ts — present (131 lines)
- apps/client/src/lib/engine/SceneManager.ts — present (361 lines, min 80 required)
- apps/client/src/lib/engine/AzulScene.ts — present (446 lines, min 100 required)
- apps/client/src/routes/game/[id]/+page.svelte — present (305 lines, min 40 required)
- apps/client/src/routes/game/[id]/+page.ts — present (21 lines)
- apps/client/src/lib/azul-game-config.ts — present (87 lines)

Key exports verified:
- gameApi: submitMove, getGameState, createGame — all exported
- SceneManager: SceneManager class — exported
- AzulScene: AzulScene class — exported

Commits verified:
- 273cccc (feat — Task 1) — in git log
- e30ccfc (feat — Task 2) — in git log

TypeScript: npx tsc --noEmit → 0 errors (verified twice)

---
*Phase: 01-engine-foundation*
*Completed: 2026-03-01*
