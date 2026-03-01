---
phase: 01-engine-foundation
plan: "03"
subsystem: engine
tags: [typescript, xstate, fsm, state-machine, hierarchical, parallel, game-engine]

# Dependency graph
requires:
  - phase: 01-engine-foundation
    plan: "02"
    provides: GameState, PlayerState, ZoneState types from @bga2/shared-types

provides:
  - createGameFSM factory function (XState v5 machine from GameFSMConfig)
  - Hierarchical state structure: Game > playing > Phase(s) > turn (parallel or sequential) > done
  - Parallel regions for simultaneous player actions (player1/player2 each waiting->done final)
  - onDone auto-advancement when all parallel regions complete
  - FSMContext type (gameState, round, currentPlayerIndex) updated via assign
  - FSMEvent union type (PHASE_END, GAME_END, ROUND_END, SUBMIT_P1, SUBMIT_P2, SUBMIT_MOVE)
  - FSMStateValue, PhaseConfig, StageConfig, GameFSMConfig interfaces
  - 9 passing TDD tests covering all FSM behaviors

affects: [02-game-engine, 03-multiplayer, 04-async-play, 05-ai-toolkit]

# Tech tracking
tech-stack:
  added:
    - xstate@5.28.0 (state machine runtime, installed into engine-core workspace)
  patterns:
    - XState v5 createMachine + createActor (NOT v4 Machine/interpret)
    - Dynamic machine factory: createGameFSM(config) builds machine at runtime from config
    - Parallel regions pattern for simultaneous player turns (type: parallel, onDone fires when ALL complete)
    - assign action for FSMContext updates (round increment on ROUND_END)
    - Auto-advancing phases via onDone vs manual PHASE_END events
    - rootDir removed from engine-core tsconfig (same pattern as azul — cross-package imports)

key-files:
  created:
    - libs/engine/core/src/fsm/GameFSM.ts
    - libs/engine/core/src/fsm/types.ts
    - libs/engine/core/src/fsm/index.ts
    - libs/engine/core/src/fsm/__tests__/GameFSM.test.ts
    - .planning/phases/01-engine-foundation/deferred-items.md
  modified:
    - libs/engine/core/src/index.ts
    - libs/engine/core/tsconfig.json
    - libs/engine/core/package.json
    - package-lock.json

key-decisions:
  - "createGameFSM return type left as TypeScript-inferred rather than explicit AnyMachine alias — createMachine generic type with typed context function is not assignable to ReturnType<typeof createMachine> (which defaults to MachineContext); inferred type flows correctly through createActor and send calls"
  - "onDone added to each phase for auto-advancement in parallel mode; PHASE_END on event remains for sequential mode — dual-path design supports both play modes without config branching at runtime"
  - "FSMStateValue circular reference resolved via FSMStateValueMap interface indirection — TypeScript does not support directly recursive type aliases; interface provides the indirection needed"
  - "Removed rootDir from engine-core tsconfig — same fix as azul (01-02): cross-package @bga2/shared-types imports resolve through path aliases which traverse outside rootDir boundary; monorepo packages importing sibling packages should not set rootDir"

patterns-established:
  - "XState v5 machine factory pattern: createGameFSM(config) returns statically-typed machine; createActor(machine, { input }) initializes context from input object"
  - "Parallel regions pattern: type:parallel parent with N child states each having initial:waiting -> done:final; onDone on parallel parent fires only when ALL children reach final"
  - "onDone dual-mode: sequential phases advance via explicit PHASE_END events; parallel phases advance automatically via onDone when all player regions complete"

requirements-completed: [ENG-03]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 01 Plan 03: Hierarchical Game FSM with Parallel Regions Summary

**XState v5 machine factory (createGameFSM) with hierarchical Game > Phase > Turn > Stage structure, parallel regions for simultaneous player actions, and onDone synchronization firing only when ALL regions complete — 9 TDD tests passing**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-01T05:59:17Z
- **Completed:** 2026-03-01T06:04:08Z
- **Tasks:** 3 (TDD: RED, GREEN, REFACTOR — no refactor needed)
- **Files modified:** 8

## Accomplishments

- `createGameFSM(config: GameFSMConfig)` factory builds a fully dynamic XState v5 machine — each game defines its own phase/stage structure; the engine provides the runtime
- Hierarchical state machine: `Game (initial: playing) > playing (initial: firstPhase) > Phase (per-config) > turn (parallel|sequential) > done (final)` with `finished` as a top-level terminal state
- Parallel regions: `player1` and `player2` each have `waiting -> done (final)` regions inside a `type: 'parallel'` turn state. XState's `onDone` on the parallel state fires only when ALL child regions reach final — verified in tests 6 and 7
- FSMContext holds `gameState: GameState`, `round: number`, `currentPlayerIndex: number`; XState `assign` action increments `round` on `ROUND_END`
- Invalid transitions silently ignored by XState (test 5 confirms ROUND_END in draftingPhase has no effect)

## Task Commits

1. **TDD RED: Failing tests for hierarchical game FSM** - `74cbce3` (test)
2. **TDD GREEN: Implement FSM types, GameFSM factory, fsm/index.ts** - `d9184d8` (feat)

**Plan metadata:** TBD (docs commit)

_Note: No REFACTOR commit needed — implementation was clean on first pass._

## Files Created/Modified

- `libs/engine/core/src/fsm/GameFSM.ts` — createGameFSM factory + buildParallelTurnState/buildSequentialTurnState/buildPhaseState/buildPlayingState helpers; 230 lines
- `libs/engine/core/src/fsm/types.ts` — FSMContext, FSMEvent union (6 event types), FSMStateValue/FSMStateValueMap, PhaseConfig, StageConfig, GameFSMConfig
- `libs/engine/core/src/fsm/index.ts` — Barrel export for all FSM types and createGameFSM
- `libs/engine/core/src/fsm/__tests__/GameFSM.test.ts` — 9 TDD tests (all passing)
- `libs/engine/core/src/index.ts` — Updated to export FSM module from engine-core barrel
- `libs/engine/core/tsconfig.json` — Removed rootDir, disabled declaration/declarationMap; excluded test files
- `libs/engine/core/package.json` — Added xstate@^5.28.0 dependency
- `package-lock.json` — xstate resolution added

## Decisions Made

- Inferred return type on `createGameFSM` rather than explicit annotation — XState v5's typed context function creates a `StateMachine<ContextFn, ...>` that is not assignable to `StateMachine<MachineContext, ...>` (the default `ReturnType<typeof createMachine>`). TypeScript correctly infers the full type and all downstream consumers (createActor, send, getSnapshot) work without explicit annotation.
- Dual-path phase advancement: `onDone` (automatic, fires when turn completes) + `PHASE_END` (manual event). Parallel mode uses `onDone`; sequential mode uses `PHASE_END`. Both paths coexist on each phase — no runtime branching needed.
- `FSMStateValueMap` interface to break the circular `FSMStateValue` self-reference — TypeScript TS2456 error on directly recursive type aliases; interfaces allow the indirection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed rootDir from engine-core tsconfig**
- **Found during:** TDD GREEN (tsc compile check)
- **Issue:** `rootDir: "./src"` caused tsc to reject cross-package source files resolved via `@bga2/shared-types` path alias — same issue as azul in 01-02
- **Fix:** Removed `rootDir` from `libs/engine/core/tsconfig.json`. Also disabled `declaration: false` (engine-core doesn't need emitted declarations since it's consumed via path aliases in the monorepo). Added `src/**/*.test.ts` exclusion to match shared-types pattern.
- **Files modified:** libs/engine/core/tsconfig.json
- **Verification:** `npx tsc --noEmit -p libs/engine/core/tsconfig.json` passes (only pre-existing PixiAdapter.ts errors remain, which are out of scope)
- **Committed in:** d9184d8 (GREEN commit)

**2. [Rule 1 - Bug] Parallel onDone not advancing past phase — added onDone to phase state**
- **Found during:** TDD GREEN (test 6 failing: expected bidPhase to complete after both submits)
- **Issue:** Phase state had `on` handlers but no `onDone`. When all parallel turn regions completed and turn transitioned to `complete (final)`, XState fired `phase.onDone` — but no handler existed, so the machine stayed in bidPhase.
- **Fix:** Added `onDone` to each phase in `buildPlayingState`. Non-last phases: `onDone -> nextPhase.id`. Last phase: `onDone -> #gameFSM.finished`.
- **Files modified:** libs/engine/core/src/fsm/GameFSM.ts
- **Verification:** All 9 tests pass including test 6 (parallel onDone) and test 7 (partial submit stays in phase)
- **Committed in:** d9184d8 (GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - Blocking, 1 Rule 1 - Bug)
**Impact on plan:** Both auto-fixes are essential for correctness. No scope creep.

## Issues Encountered

- Pre-existing `PixiAdapter.ts` TS18048 errors (`obj` possibly undefined) found when removing rootDir. These are out of scope — logged to `.planning/phases/01-engine-foundation/deferred-items.md`.

## User Setup Required

None — this plan adds an npm package (xstate) to an existing workspace package. `npm install` was run automatically during execution.

## Next Phase Readiness

- FSM runtime complete — all downstream plans can import `createGameFSM` from `@bga2/engine-core` and build a machine from their GameFSMConfig
- The parallel regions pattern is tested and ready for multi-player turn synchronization in Phase 3 (multiplayer)
- FSMContext carries full GameState — the FSM and game state are co-located, ready for hook integration in Plan 04+

## Self-Check: PASSED

All key files verified present:
- libs/engine/core/src/fsm/GameFSM.ts — present
- libs/engine/core/src/fsm/types.ts — present
- libs/engine/core/src/fsm/index.ts — present
- libs/engine/core/src/fsm/__tests__/GameFSM.test.ts — present
- .planning/phases/01-engine-foundation/01-03-SUMMARY.md — present

Commits verified: 74cbce3 (RED), d9184d8 (GREEN) — both in git log.
