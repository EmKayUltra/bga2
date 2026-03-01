/**
 * @bga2/engine-core — Game engine primitives
 *
 * Current exports:
 *   fsm      — Hierarchical FSM runtime (createGameFSM, types)
 *   renderer — PixiAdapter (PixiJS v8 WebGL), StubRenderer (headless testing)
 *   zones    — Zone hierarchy: GridZone, StackZone, HandZone, DeckZone, DiscardZone, ZoneFactory
 *   pieces   — Piece runtime class and PieceFactory
 *   loader   — GameLoader and RuntimeGameModel
 */

// FSM module
export { createGameFSM } from './fsm/GameFSM.js';
export type {
  GameFSMConfig,
  FSMContext,
  FSMEvent,
  FSMStateValue,
  PhaseConfig,
  StageConfig,
} from './fsm/index.js';

// Renderer module
export { PixiAdapter, StubRenderer } from './renderer/index.js';

// Zone primitives
export {
  Zone,
  GridZone,
  StackZone,
  HandZone,
  DeckZone,
  DiscardZone,
  ZoneFactory,
} from './zones/index.js';

// Piece primitives
export { Piece, PieceFactory } from './pieces/index.js';

// Game loader
export { GameLoader } from './loader/index.js';
export type { RuntimeGameModel } from './loader/index.js';
