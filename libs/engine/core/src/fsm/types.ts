/**
 * FSM event, context, and config types for the hierarchical game state machine.
 *
 * These types are consumed by GameFSM.ts and by game hooks that need to
 * interact with FSM-level state.
 */
import type { GameState } from '@bga2/shared-types';

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * Runtime context held by the XState machine.
 * Immutably updated via assign actions on transitions.
 */
export interface FSMContext {
  /** Full authoritative game state (passed in on createActor input). */
  gameState: GameState;
  /** Current round number (1-indexed, incremented on ROUND_END). */
  round: number;
  /** Index into GameState.players of the player whose turn it is. */
  currentPlayerIndex: number;
}

// ─── Events ───────────────────────────────────────────────────────────────────

/** Signal the current phase is over; advance to the next phase. */
export interface PhaseEndEvent { type: 'PHASE_END' }

/** Signal the game is over; transition to the top-level finished state. */
export interface GameEndEvent { type: 'GAME_END' }

/** Signal the current round is over; increment round counter and restart phases. */
export interface RoundEndEvent { type: 'ROUND_END' }

/** Player 1 submits their action (used in parallel turn regions). */
export interface SubmitP1Event { type: 'SUBMIT_P1' }

/** Player 2 submits their action (used in parallel turn regions). */
export interface SubmitP2Event { type: 'SUBMIT_P2' }

/** Generic move submission event. */
export interface SubmitMoveEvent { type: 'SUBMIT_MOVE'; move: unknown }

/** Union of all FSM events. */
export type FSMEvent =
  | PhaseEndEvent
  | GameEndEvent
  | RoundEndEvent
  | SubmitP1Event
  | SubmitP2Event
  | SubmitMoveEvent;

// ─── State value type ─────────────────────────────────────────────────────────

/** Nested map of state names used in hierarchical state value representations. */
export interface FSMStateValueMap {
  [key: string]: FSMStateValue;
}

/**
 * Represents the nested state value structure returned by actor.getSnapshot().value.
 * Can be a simple string (top-level) or a nested object (hierarchical).
 */
export type FSMStateValue = string | FSMStateValueMap;

// ─── Config types ─────────────────────────────────────────────────────────────

/** Configuration for a single stage within a phase. */
export interface StageConfig {
  /** Stage identifier (e.g. 'pick', 'place', 'score'). */
  id: string;
}

/** Configuration for a game phase, composed of sequential stages. */
export interface PhaseConfig {
  /** Phase identifier (e.g. 'draftingPhase', 'tilingPhase'). */
  id: string;
  /** Ordered list of stages within this phase. */
  stages: StageConfig[];
}

/**
 * Top-level factory configuration for createGameFSM.
 * Describes the game's phase/stage structure and turn mode.
 */
export interface GameFSMConfig {
  /** Ordered list of phases in a round. */
  phases: PhaseConfig[];
  /**
   * When true, the turn state uses `type: 'parallel'` — all players submit
   * simultaneously; onDone fires only when ALL regions reach their final state.
   */
  parallelTurns: boolean;
}
