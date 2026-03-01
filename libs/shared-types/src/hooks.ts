/**
 * Hook contract types.
 *
 * HookContext: the data passed into every hook function call.
 * HookFunctions: the interface that every game's hooks.ts must implement.
 *
 * Hook functions are pure: given context, return a result (or mutate state via framework).
 * They run in the browser (move hints) and on the server (move validation).
 */
import type { GameState } from './state.js';
import type { Move, ValidMove } from './moves.js';

// ─── Player info ──────────────────────────────────────────────────────────────

/** Minimal player info passed into hooks. */
export interface PlayerInfo {
  /** Unique player identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** 0-based turn order index. */
  index: number;
}

// ─── Hook context ─────────────────────────────────────────────────────────────

/**
 * Context object passed to every hook function call.
 * Provides read access to full game state and metadata.
 */
export interface HookContext {
  /** Current authoritative game state. */
  state: GameState;

  /** ID of the player whose turn it currently is. */
  currentPlayer: string;

  /** Current round number (1-indexed). */
  round: number;

  /** All players in turn order with their index. */
  players: PlayerInfo[];
}

// ─── Hook functions interface ─────────────────────────────────────────────────

/**
 * Contract that every game's hooks.ts must satisfy.
 * The engine calls these functions at the appropriate lifecycle moments.
 *
 * Functions must be exported as named exports from the hooks file.
 */
export interface HookFunctions {
  /**
   * Return all legal moves available to the current player.
   * Called after each move to update valid-move hints in the UI.
   */
  getValidMoves(ctx: HookContext): ValidMove[];

  /**
   * Apply a player's move to the game state.
   * Mutates ctx.state in place (or returns — engine handles both patterns).
   * Called when a player submits a move.
   */
  onMove(ctx: HookContext, move: Move): void;

  /**
   * Called at the end of each game round.
   * Handles scoring, board reset, phase transitions.
   */
  onRoundEnd(ctx: HookContext): void;
}
