/**
 * @bga2/engine-core FSM module
 *
 * Barrel export for the hierarchical game state machine.
 * Import createGameFSM to build an XState v5 machine from a GameFSMConfig.
 *
 * Usage:
 *   import { createGameFSM } from '@bga2/engine-core/fsm';
 *   import type { FSMContext, FSMEvent, GameFSMConfig } from '@bga2/engine-core/fsm';
 */

export { createGameFSM } from './GameFSM.js';
export type { GameFSMConfig } from './GameFSM.js';

export type {
  FSMContext,
  FSMEvent,
  FSMStateValue,
  PhaseConfig,
  StageConfig,
  PhaseEndEvent,
  GameEndEvent,
  RoundEndEvent,
  SubmitP1Event,
  SubmitP2Event,
  SubmitMoveEvent,
} from './types.js';
