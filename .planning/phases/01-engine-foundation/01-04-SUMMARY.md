---
phase: 01-engine-foundation
plan: 04
subsystem: engine
tags: [vitest, tdd, zones, pieces, game-loader, typescript, board-game-engine]

# Dependency graph
requires:
  - phase: 01-engine-foundation
    plan: 02
    provides: "shared-types: ZoneDef, PieceDef, GameConfig, PieceType, ZoneType"

provides:
  - "Zone hierarchy: GridZone, StackZone, HandZone, DeckZone, DiscardZone with type-specific behavior"
  - "ZoneFactory: creates Zone instances from ZoneDef"
  - "Piece class: runtime piece with state management and fallback rendering info"
  - "PieceFactory: creates N piece instances from PieceDef with unique runtime ids"
  - "GameLoader: parses GameConfig into RuntimeGameModel with zones, pieceDefs, pieces, getZone(), getPiece()"
  - "All exported from @bga2/engine-core index"

affects:
  - 01-engine-foundation (plan 05+)
  - FSM integration (zones and pieces are the runtime objects FSM operates on)
  - Renderer (zones and pieces are what gets displayed)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zone class hierarchy: abstract base class with concrete subclasses in single file (Zone.ts)"
    - "Factory pattern for constructing typed runtime objects from declarative defs (ZoneFactory, PieceFactory)"
    - "RuntimeGameModel: value-object wrapping Maps + array for O(1) lookups by id"
    - "TDD red-green-commit pattern: failing test commit, then implementation commit per task"

key-files:
  created:
    - libs/engine/core/src/zones/Zone.ts
    - libs/engine/core/src/zones/ZoneFactory.ts
    - libs/engine/core/src/zones/index.ts
    - libs/engine/core/src/zones/__tests__/Zone.test.ts
    - libs/engine/core/src/pieces/Piece.ts
    - libs/engine/core/src/pieces/PieceFactory.ts
    - libs/engine/core/src/pieces/index.ts
    - libs/engine/core/src/pieces/__tests__/Piece.test.ts
    - libs/engine/core/src/loader/GameLoader.ts
    - libs/engine/core/src/loader/index.ts
    - libs/engine/core/src/loader/__tests__/GameLoader.test.ts
  modified:
    - libs/engine/core/src/index.ts

key-decisions:
  - "Zone subclasses colocated in Zone.ts — all 5 are small and tightly related; separate files would increase import complexity with no benefit"
  - "PieceFactory createPieces uses defId-N naming (tile-blue-0, tile-blue-1) — deterministic ids support reproducible tests and serialization"
  - "GameLoader does not load/execute hooks — hooks are the server's responsibility; loader is pure data transform"
  - "PieceFactory defaults to count=1 per def — Azul-specific quantities (20 tiles per color) come from future GameConfig.counts field"
  - "RuntimeGameModel uses Map for zones/pieceDefs and array for pieces — O(1) lookups plus ordered iteration"

patterns-established:
  - "Zone factory pattern: ZoneFactory.createZone(def) dispatches on ZoneType union with exhaustive switch"
  - "Piece initial zone: 'unplaced' sentinel value until GameLoader or hook places pieces into zones"

requirements-completed:
  - ENG-01
  - ENG-02

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 1 Plan 4: Game Loader and Zone/Piece Primitives Summary

**Five zone types (GridZone, StackZone, HandZone, DeckZone, DiscardZone) plus Piece class and GameLoader that parses GameConfig into a RuntimeGameModel with 22 passing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T05:59:28Z
- **Completed:** 2026-03-01T06:03:40Z
- **Tasks:** 2
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments

- Zone class hierarchy with 5 concrete types: GridZone ((row,col) addressing + occupied-cell rejection), StackZone (LIFO push/pop + capacity enforcement), HandZone (set semantics + hasPiece), DeckZone (Fisher-Yates shuffle + draw/drawN), DiscardZone (append + getAllPieces + clear)
- ZoneFactory.createZone dispatches on ZoneType with exhaustive switch covering all 5 types
- Piece class carrying id, defId, type, zoneId, ownerId, asset, fallback rendering info, mutable state, and moveTo()
- PieceFactory.createPieces creates N uniquely-identified instances from PieceDef with deterministic naming (defId-N)
- GameLoader.load validates GameConfig, builds zones via ZoneFactory, pieces via PieceFactory, returns RuntimeGameModel with getZone()/getPiece() lookup methods
- All 22 tests pass across 3 test files (12 zone tests + 4 piece tests + 6 loader tests); total engine-core test suite: 43 passing

## Task Commits

Each task followed TDD red-green pattern with atomic commits:

1. **Task 1 RED: Zone tests** - `a7d3692` (test)
2. **Task 1 GREEN: Zone implementations** - `6cbca14` (feat)
3. **Task 2 RED: Piece and loader tests** - `b1d67cb` (test)
4. **Task 2 GREEN: Piece and loader implementations** - `9165d52` (feat)
5. **Index update: barrel exports** - `0cec453` (chore)

**Plan metadata:** (docs commit — see below)

_Note: TDD tasks committed in red-green pairs per the TDD execution flow_

## Files Created/Modified

- `libs/engine/core/src/zones/Zone.ts` - Abstract Zone base + GridZone/StackZone/HandZone/DeckZone/DiscardZone
- `libs/engine/core/src/zones/ZoneFactory.ts` - createZone(def) factory dispatching on ZoneType
- `libs/engine/core/src/zones/index.ts` - Barrel exports for all zone classes and factory
- `libs/engine/core/src/zones/__tests__/Zone.test.ts` - 12 tests covering all zone types and ZoneFactory
- `libs/engine/core/src/pieces/Piece.ts` - Runtime piece class with state management
- `libs/engine/core/src/pieces/PieceFactory.ts` - createPieces with count support
- `libs/engine/core/src/pieces/index.ts` - Barrel exports
- `libs/engine/core/src/pieces/__tests__/Piece.test.ts` - 4 tests for Piece and PieceFactory
- `libs/engine/core/src/loader/GameLoader.ts` - GameLoader.load() and RuntimeGameModel interface
- `libs/engine/core/src/loader/index.ts` - Barrel exports
- `libs/engine/core/src/loader/__tests__/GameLoader.test.ts` - 6 tests including Azul config fixture and validation
- `libs/engine/core/src/index.ts` - Updated to export zones, pieces, loader modules

## Decisions Made

- Zone subclasses colocated in Zone.ts — all 5 are small and tightly related; separate files would add import complexity for no benefit
- PieceFactory uses defId-N naming (tile-blue-0, tile-blue-1) — deterministic, supports reproducible tests and future serialization
- GameLoader does not load or execute hooks — hooks are the server's responsibility; loader is a pure synchronous data transform
- PieceFactory defaults to count=1 per def — Azul-specific quantities (20 tiles per color) require a future `counts` extension in GameConfig
- RuntimeGameModel uses Map for O(1) zone/piece lookups and flat array for ordered piece iteration

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Zone and piece primitives are ready for FSM integration in subsequent plans
- GameLoader successfully parses real Azul game.json (15 zones, 6 piece defs verified by test)
- All exports available from @bga2/engine-core public index
- No blockers

---
*Phase: 01-engine-foundation*
*Completed: 2026-03-01*

## Self-Check: PASSED

- All 8 implementation files confirmed present on disk
- All 5 commits (a7d3692, 6cbca14, b1d67cb, 9165d52, 0cec453) confirmed in git history
- 22 tests passing across zone + piece + loader test suites
- 43 total engine-core tests passing (no regressions)
