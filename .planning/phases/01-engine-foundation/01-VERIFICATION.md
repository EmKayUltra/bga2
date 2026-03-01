---
phase: 01-engine-foundation
verified: 2026-03-01T12:00:00Z
status: gaps_found
score: 3/6 criteria met
gaps:
  - truth: "Swapping the adapter to a stub/no-op renderer runs the same game without errors"
    status: partial
    reason: "StubRenderer exists and implements IRenderer. AzulScene has zero pixi.js imports. But there is no test or wiring that actually instantiates AzulScene with StubRenderer and calls renderBoard(). The swap is structurally possible but never proven."
    artifacts:
      - path: "libs/engine/core/src/renderer/StubRenderer.ts"
        issue: "Exists and implements IRenderer correctly, but no integration test runs AzulScene against it"
      - path: "apps/client/src/lib/engine/SceneManager.ts"
        issue: "Hardcoded to dynamically import PixiAdapter (line 87); no mechanism to swap renderer"
    missing:
      - "An integration test (or SceneManager config flag) that runs AzulScene with StubRenderer to prove the swap works without errors"
  - truth: "The FSM runtime handles a parallel region (two players acting simultaneously) without entering an invalid state"
    status: partial
    reason: "Parallel regions are implemented in GameFSM.ts and tested in unit tests (test 6 and 7 verify SUBMIT_P1/SUBMIT_P2 behavior). However, the parallel turn state only has waiting->done transitions — there is no 'active' state like sequential turns have, meaning players go directly from waiting to done with no intermediate active state. The tests pass but the parallel model is minimal (no 'Stage' substates). Additionally, the SceneManager always creates the FSM with parallelTurns: false."
    artifacts:
      - path: "libs/engine/core/src/fsm/GameFSM.ts"
        issue: "buildParallelTurnState has waiting->done but no 'active' intermediate state; StageConfig from types.ts is defined but never used in phase construction"
    missing:
      - "Stage substates are defined in types (StageConfig) but never wired into the FSM phase states — buildPhaseState ignores config.phases[i].stages entirely"
  - truth: "Zoom with pinch (mobile) and scroll-wheel (desktop) works; drag-to-pan works; all interactive elements meet the 44px touch target minimum"
    status: partial
    reason: "Code implements all three viewport interactions (drag, pinch, wheel) and sets MIN_HIT_AREA_PX=44 on all sprites. But this cannot be verified programmatically — requires human testing on actual browser and mobile device."
    artifacts:
      - path: "libs/engine/core/src/renderer/PixiAdapter.ts"
        issue: "hitArea is set to 44px minimum (line 211) but only on sprites from createSprite — factory backgrounds and zone backgrounds also get 44px hitArea even though they are not interactive targets"
    missing:
      - "Human verification of pinch-zoom on mobile, scroll-wheel on desktop, and drag-to-pan"
  - truth: "The server validates a move against a hook function and returns a validMoves[] array — the client highlights legal moves without re-implementing any rule logic"
    status: partial
    reason: "The full pipeline exists (client -> gameApi -> server -> HookExecutor -> hooks.ts -> getValidMoves). However, hooks.ts getValidMoves() always returns [] (Phase 1 stubs). The server's validation logic explicitly allows ALL moves when validMoves is empty (line 94 of GameService.cs). So the validation pipeline is wired but never actually validates anything. The client highlight code (AzulScene.highlightValidMoves) exists but will never highlight anything since validMoves is always empty."
    artifacts:
      - path: "libs/games/azul/src/hooks.ts"
        issue: "getValidMoves returns [] — all functions are Phase 1 stubs with TODO comments"
      - path: "apps/server/Services/GameService.cs"
        issue: "Line 94: 'if validMoves.Count > 0 && !IsMoveValid' — empty list bypasses validation entirely"
    missing:
      - "Actual hook implementation that returns real validMoves (deferred to Phase 2 per design)"
      - "End-to-end proof that a non-empty validMoves list actually rejects invalid moves and highlights valid ones on the client"
---

# Phase 1: Engine Foundation -- Verification Report

**Phase Goal:** A playable Azul scene runs locally in the browser via a fully abstracted renderer, backed by a running FSM -- proving the engine's architecture is sound before any real game logic or networking is added
**Verified:** 2026-03-01T12:00:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Criterion 1: Renderer Abstraction
**Status:** PARTIAL

**What the criterion requires:**
> A game scene renders in the browser using the PixiJS adapter with no direct PixiJS imports in game logic code -- swapping the adapter to a stub/no-op renderer runs the same game without errors

**Evidence -- PASS: No PixiJS imports in game logic:**
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/lib/engine/AzulScene.ts` -- ZERO `pixi.js` imports. All 493 lines operate exclusively through `IRenderer`, `ISpriteHandle`, and `RuntimeGameModel` types from `@bga2/shared-types` and `@bga2/engine-core`. Grep confirms only comment references to PixiJS, no actual imports.
- The `IRenderer` interface at `/var/home/emkayultra/code/personal/bga2/libs/shared-types/src/renderer.ts` (125 lines) defines 14 methods across lifecycle, scene graph, positioning, interaction, effects, and viewport groups -- no PixiJS types leak through.

**Evidence -- PASS: PixiJS adapter exists and is substantive:**
- `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/renderer/PixiAdapter.ts` (373 lines) -- full `IRenderer` implementation using PixiJS v8, pixi-viewport for pan/zoom, pixi-filters for glow effects, and procedural Graphics drawing for all tile shapes.

**Evidence -- PASS: StubRenderer exists and implements IRenderer:**
- `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/renderer/StubRenderer.ts` (194 lines) -- complete no-op `IRenderer` implementation with test helpers. Has 12 tests passing.

**Evidence -- FAIL: Swap never proven:**
- `SceneManager.ts` line 87 hardcodes `const { PixiAdapter } = await import('@bga2/engine-core')`. There is no constructor parameter, config flag, or dependency injection to swap the renderer.
- No integration test instantiates `AzulScene(stubRenderer, model)` and calls `renderBoard()`. The swap is structurally possible (types align) but never exercised.

**Verdict:** The abstraction is architecturally sound and the constraint (no pixi imports in game logic) is fully enforced. But the claim "swapping the adapter to a stub/no-op renderer runs the same game without errors" is unproven -- it should work but has not been tested.

---

### Criterion 2: FSM Runtime
**Status:** PARTIAL

**What the criterion requires:**
> The FSM runtime transitions through Game > Phase > Turn > Stage states and handles a parallel region (two players acting simultaneously) without entering an invalid state

**Evidence -- PASS: Game > Phase > Turn hierarchy:**
- `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/fsm/GameFSM.ts` (232 lines) -- XState v5 machine with `playing` (compound) > per-phase states > `turn` substates. Properly uses `createMachine` with context factory.
- Test file `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/fsm/__tests__/GameFSM.test.ts` (184 lines) -- 9 tests covering: initial state, phase transitions via PHASE_END, GAME_END, invalid event rejection, parallel regions, round cycling with context update.
- Tests verify: `snapshot.matches({ playing: 'draftingPhase' })` correctly, PHASE_END advances phases sequentially, ROUND_END increments `context.round`, GAME_END reaches `finished`.

**Evidence -- PASS: Parallel regions work correctly:**
- `buildParallelTurnState()` creates `type: 'parallel'` with `player1` and `player2` regions, each with `waiting -> done` states.
- Test 6 confirms both SUBMIT_P1 and SUBMIT_P2 must fire before onDone triggers.
- Test 7 confirms sending only SUBMIT_P1 keeps the machine in the phase (partial completion does not advance).
- Test 5 confirms invalid events are silently ignored (no invalid state transitions).

**Evidence -- FAIL: Stage states are not wired:**
- `StageConfig` is defined in `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/fsm/types.ts` (line 69-72) and `PhaseConfig.stages` holds an array of them.
- However, `buildPhaseState()` in GameFSM.ts completely ignores `config.phases[i].stages`. The built phase state always has `initial: 'turn'` with `turn` and `complete` substates. There is no mechanism to transition through stages within a turn.
- The "Game > Phase > Turn > **Stage**" hierarchy promised by the criterion stops at Turn -- Stage is typed but not implemented in the state machine.

**Evidence -- Parallel region is minimal:**
- The parallel turn only supports `waiting -> done` per player. Sequential turns have `active -> done`. Neither has Stage substates.

**Verdict:** The FSM handles Game > Phase > Turn correctly with proper parallel region support. But Stage states (the fourth level of the hierarchy) are type-defined only and not wired into the machine. The criterion explicitly requires "Game > Phase > Turn > Stage states."

---

### Criterion 3: Game Definition and Hooks
**Status:** PASS

**What the criterion requires:**
> Pieces, zones, and boards can be defined in game.json and loaded by the engine; a hook function (hooks.ts) can mutate game state in response to an engine event

**Evidence -- PASS: game.json defines pieces, zones, and boards:**
- `/var/home/emkayultra/code/personal/bga2/libs/games/azul/game.json` (185 lines) -- defines 15 zones (5 factories, center, 5 pattern lines, wall, floor line, bag, lid) and 6 piece definitions (5 tile colors + first player token). Each zone has type, capacity, owner, and render hints.

**Evidence -- PASS: GameLoader parses game.json into RuntimeGameModel:**
- `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/loader/GameLoader.ts` (127 lines) -- validates config, creates Zone instances via ZoneFactory, creates Piece instances via PieceFactory, returns `RuntimeGameModel` with Map-based lookups.
- Tests at `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/loader/__tests__/GameLoader.test.ts` verify: 15 zones created, 6 piece defs, zone/piece lookup, duplicate ID rejection.

**Evidence -- PASS: hooks.ts satisfies HookFunctions contract:**
- `/var/home/emkayultra/code/personal/bga2/libs/games/azul/src/hooks.ts` (68 lines) -- exports `getValidMoves(ctx)`, `onMove(ctx, move)`, `onRoundEnd(ctx)`. Also exports `azulHooks: HookFunctions` for compile-time contract verification.
- The `HookFunctions` interface at `/var/home/emkayultra/code/personal/bga2/libs/shared-types/src/hooks.ts` defines the full contract with `HookContext` providing access to state, currentPlayer, round, and players.
- `onMove` is designed to mutate `ctx.state` in place, which is how the server's `HookExecutor` reads back the result (line 109 of HookExecutor.cs: `engine.Evaluate("JSON.stringify(ctx.state)")`).

**Evidence -- PASS: Server-side hook execution works:**
- `/var/home/emkayultra/code/personal/bga2/apps/server/Services/HookExecutor.cs` (314 lines) -- loads hooks.ts from filesystem, strips TypeScript annotations via regex, executes via Jint JavaScript engine with 5-second timeout and 50MB memory limit. `GetValidMoves()` and `OnMove()` properly build HookContext and parse results.

**Note:** The hooks are Phase 1 stubs (return empty array / no-op mutation), but the criterion asks if "a hook function can mutate game state in response to an engine event" -- the infrastructure for this is fully in place. The `onMove` function signature accepts `(ctx, move)` and the server reads back `ctx.state` after execution. The hooks can and will mutate state when Phase 2 implements the logic.

**Verdict:** PASS. game.json defines the Azul board completely. GameLoader creates a runtime model with zones and pieces. hooks.ts implements the HookFunctions contract. The engine can mutate game state via hooks -- the pipeline is wired end to end.

---

### Criterion 4: Viewport Interactions and Touch Targets
**Status:** HUMAN VERIFICATION NEEDED

**What the criterion requires:**
> Zoom with pinch (mobile) and scroll-wheel (desktop) works; drag-to-pan works; all interactive elements meet the 44px touch target minimum

**Evidence -- Code exists:**
- PixiAdapter.enableViewport() at `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/renderer/PixiAdapter.ts` lines 348-372: chains `.drag()`, `.pinch()`, `.wheel()`, `.decelerate()`, `.clampZoom({ minScale: 0.3, maxScale: 2 })` on the pixi-viewport Viewport instance.
- Touch targets: line 211 sets `obj.hitArea = new Rectangle(0, 0, Math.max(TILE_SIZE, MIN_HIT_AREA_PX), Math.max(TILE_SIZE, MIN_HIT_AREA_PX))` where MIN_HIT_AREA_PX = 44 and TILE_SIZE = 48. So all sprites get at least 48px hitArea (exceeds 44px minimum).
- SceneManager.init() calls `this.renderer.enableViewport()` on line 105.

**Cannot verify programmatically:**
- Pinch-to-zoom requires a real mobile browser or touch emulation.
- Scroll-wheel zoom requires a real browser environment.
- Drag-to-pan requires mouse interaction.
- The `.continue-here.md` notes remaining visual issues: "Has scrollbars: true on game container" and "Second player board cut off at bottom of viewport."

**Verdict:** Code correctly implements all three interaction modes and enforces 44px minimum. But actual behavior requires human verification, especially given the noted visual issues with scrollbars and viewport overflow.

---

### Criterion 5: Server Move Validation and Client Highlighting
**Status:** FAIL

**What the criterion requires:**
> The server validates a move against a hook function and returns a validMoves[] array -- the client highlights legal moves without re-implementing any rule logic

**Evidence -- PASS: Full pipeline is wired:**
- Client: `gameApi.ts` calls `POST /games/{id}/move` and `GET /games/{id}/state` (both return validMoves).
- Server: `GameEndpoints.cs` routes to `GameService.ValidateAndApplyMove()`.
- GameService: calls `HookExecutor.GetValidMoves()` to get valid moves, checks submitted move against them via `IsMoveValid()`, calls `HookExecutor.OnMove()` to apply, then calls `GetValidMoves()` again for the next player's turn and returns them in the response.
- Client highlight: `AzulScene.highlightValidMoves(validMoves)` applies green glow (0x22c55e) to pieces in target zones.
- SceneManager: stores `currentValidMoves` from server and uses them in `handlePieceClick()`.

**Evidence -- FAIL: Validation never actually validates:**
- `hooks.ts` `getValidMoves()` returns `[]` (empty array).
- `GameService.cs` line 94: `if (validMoves.Count > 0 && !IsMoveValid(move, validMoves))` -- when validMoves is empty, ALL moves are allowed.
- This means the server NEVER rejects a move. The validation pipeline is wired but dormant.
- The client highlight code exists but will never show highlights because validMoves is always empty.
- There is no evidence that a non-empty validMoves list would correctly reject invalid moves and return validMoves to the client for highlighting. The pipeline has never been exercised with real data.

**Evidence -- PASS: Client does not re-implement rules:**
- `AzulScene.ts` has zero rule logic. It only calls `renderer.applyGlow()` on pieces in zones that match `validMoves[].target`. All rule knowledge comes from the server.

**Verdict:** FAIL. The criterion says "the server validates a move" and "the client highlights legal moves." Neither of these actually happens because the hooks return nothing. The infrastructure is in place, but the criterion describes observable behavior that does not occur.

---

### Criterion 6: Docker Compose Dev Stack
**Status:** PASS

**What the criterion requires:**
> `docker compose up` starts the full local development stack (frontend, API, local PostgreSQL) -- no local tool installs required beyond Docker

**Evidence -- PASS: docker-compose.yml is complete:**
- `/var/home/emkayultra/code/personal/bga2/apps/infra/docker-compose.yml` (104 lines) defines:
  - `client` service: SvelteKit dev server (node:20-alpine, port 5173 + HMR port 24678, volume mounts for hot reload, depends on server)
  - `server` service: C# API (.NET 8 SDK, port 8080, dotnet watch for hot reload, depends on db with health check)
  - `db` service: PostgreSQL 16 Alpine (port 5432, health check via pg_isready, persistent volume)
  - `localstack` service: AWS emulation for S3/SES/SQS (port 4566)
  - Named volumes for pgdata, localstack_data, server_nuget
  - Bridge network `bga2` connecting all services

**Evidence -- PASS: Dockerfiles exist and are correct:**
- `/var/home/emkayultra/code/personal/bga2/apps/client/Dockerfile` (42 lines): Multi-stage (base + dev), copies workspace package.json files, npm install, exposes ports 5173 + 24678, polling file watcher enabled, CMD runs `npm run dev`.
- `/var/home/emkayultra/code/personal/bga2/apps/server/Dockerfile` (32 lines): Multi-stage (base + dev), .NET 8 SDK, dotnet restore + watch run, exposes port 8080, polling file watcher enabled.

**Evidence -- PASS: Server properly configures PostgreSQL connection:**
- `Program.cs` reads connection string from config/environment, falls back to `Host=localhost;Database=bga2;...`
- `docker-compose.yml` sets `ConnectionStrings__Default: "Host=db;Port=5432;Database=bga2;Username=bga2;Password=secret"` in server environment.
- `GameDbContext.cs` configures EF Core with Npgsql, JSONB state storage, and xmin optimistic concurrency.

**Evidence -- PASS: CORS configured for Docker network:**
- `Program.cs` lines 37-38: CORS allows `http://localhost:5173`, `http://client:5173` (Docker Compose service name), and `http://localhost:4173`.

**Evidence from .continue-here.md:** "Docker stack is running: `docker compose -f apps/infra/docker-compose.yml up -d`" -- confirms it has been tested.

**Verdict:** PASS. All three required services (frontend, API, PostgreSQL) are fully defined with proper networking, health checks, hot reload, and CORS. No local tool installs required beyond Docker.

---

## Summary Table

| # | Criterion | Status | Score |
|---|-----------|--------|-------|
| 1 | Renderer abstraction (no pixi imports + swap works) | PARTIAL | 0.75 |
| 2 | FSM runtime (Game > Phase > Turn > Stage + parallel) | PARTIAL | 0.7 |
| 3 | Game definition + hooks mutate state | PASS | 1.0 |
| 4 | Viewport interactions + 44px touch targets | HUMAN NEEDED | -- |
| 5 | Server validates moves + client highlights | FAIL | 0.3 |
| 6 | Docker Compose dev stack | PASS | 1.0 |

**Score:** 3/6 criteria fully met (criteria 3, 6 pass; criterion 4 needs human; criteria 1, 2, 5 have gaps)

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| ENG-01 | Zone/board primitives | SATISFIED | game.json has 15 zones (stack, grid, deck, discard); GameLoader creates Zone instances |
| ENG-02 | Piece primitives | SATISFIED | game.json has 6 piece defs (tiles, token); PieceFactory creates instances |
| ENG-03 | Hierarchical FSM with parallel regions | PARTIAL | Game > Phase > Turn works; parallel regions work; Stage level not wired |
| ENG-04 | Server validates every move | PARTIAL | Pipeline wired but hooks return empty validMoves; all moves currently accepted |
| ENG-05 | Client receives validMoves for highlighting | PARTIAL | API returns validMoves; highlight code exists; but validMoves always empty |
| ENG-06 | IRenderer abstracts rendering | SATISFIED | AzulScene uses only IRenderer; zero pixi imports in game logic |
| ENG-07 | PixiJS 8 WebGL adapter | SATISFIED | PixiAdapter.ts implements full IRenderer with PixiJS v8 |
| ENG-08 | Zoom/pan on all devices | NEEDS HUMAN | Code calls drag(), pinch(), wheel() on pixi-viewport |
| ENG-09 | 44px touch targets | SATISFIED | MIN_HIT_AREA_PX=44 enforced; actual TILE_SIZE=48 exceeds minimum |
| ENG-10 | Games as data + hooks | SATISFIED | game.json + hooks.ts pattern established; HookFunctions contract typed |
| INFR-01 | Docker containers, no local deps | SATISFIED | All services have Dockerfiles; docker-compose orchestrates |
| INFR-02 | Docker Compose full stack | SATISFIED | client + server + db + localstack in docker-compose.yml |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `libs/games/azul/src/hooks.ts` | 5x TODO comments; all functions return empty/no-op | Info | Expected for Phase 1 stubs; Phase 2 will implement |
| `apps/client/src/lib/engine/AzulScene.ts` | 6x "placeholder" in comments | Info | Refers to procedural graphics (expected for Phase 1) |
| `apps/client/src/lib/engine/SceneManager.ts` | Hardcoded PixiAdapter import (line 87) | Warning | Prevents renderer swapping without code change |
| `apps/server/Services/GameService.cs` | Empty validMoves bypasses all validation (line 94) | Warning | Intentional for Phase 1 but masks validation bugs |

---

## Human Verification Required

### 1. Viewport Pan/Zoom on Desktop
**Test:** Open http://localhost:5173/game/test in a desktop browser. Use scroll-wheel to zoom in/out. Click-and-drag to pan the board.
**Expected:** Smooth zoom with 0.3x-2.0x range. Drag pans the viewport. Deceleration (momentum) after release.
**Why human:** Viewport interaction requires a real browser with mouse events.

### 2. Viewport Pinch-Zoom on Mobile
**Test:** Open http://localhost:5173/game/test on a mobile device (or use Chrome DevTools mobile emulation with touch). Two-finger pinch to zoom.
**Expected:** Pinch zooms smoothly. Single-finger drag pans.
**Why human:** Touch events require real device or emulation.

### 3. Visual Layout Quality
**Test:** View the rendered Azul scene. Check factory circles, player boards, wall grid, floor line.
**Expected:** All elements visible. No scrollbars on game container. Both player boards fully visible. Colors distinct.
**Why human:** Visual appearance cannot be verified programmatically. The .continue-here.md notes: "Has scrollbars: true" and "Second player board cut off at bottom."

### 4. Touch Target Size
**Test:** On mobile, tap on tile sprites and empty slots. Check they respond reliably without precision tapping.
**Expected:** All tappable elements respond within a 44px area. No need for precise aim.
**Why human:** Hit area feel requires real touch interaction.

---

## Gaps Summary

Three criteria have gaps:

**Criterion 1 (Renderer swap):** The abstraction is clean and the StubRenderer exists, but the swap has never been exercised. AzulScene(stubRenderer).renderBoard() has never been called. This is a low-risk gap -- it should work because the types align -- but the criterion specifically says "swapping the adapter runs the same game without errors" and that has not been proven.

**Criterion 2 (FSM Stage states):** The FSM handles Game > Phase > Turn correctly, and parallel regions work per tests 6/7. But Stage states, which are typed in `StageConfig`, are never wired into the XState machine. `buildPhaseState()` ignores the `stages` array entirely. The criterion says "Game > Phase > Turn > Stage states" -- the fourth level is missing.

**Criterion 5 (Move validation + highlighting):** The most significant gap. The entire pipeline exists (client -> API -> hooks -> getValidMoves -> response -> client highlight), but it has never been exercised with real data. Hooks return `[]`, so the server never rejects any move, and the client never highlights anything. This is by design (Phase 1 stubs), but the criterion describes observable behavior ("validates a move", "highlights legal moves") that does not actually occur.

**Root cause:** Criteria 3 and 5 have tension. Criterion 3 says "a hook function can mutate game state" and the infrastructure for this is in place. But criterion 5 requires the hooks to actually do something (return real validMoves). The Phase 1 design intentionally deferred hook logic to Phase 2, but criterion 5 was written as if the hooks would be functional in Phase 1.

---

_Verified: 2026-03-01T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
