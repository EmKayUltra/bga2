/**
 * Move and validation types.
 *
 * Move: a player's submitted action — includes playerId for server-side auth.
 * ValidMove: an available action returned by getValidMoves — no playerId (implied).
 * MoveResult: the outcome of processing a move.
 */
import type { GameState } from './state.js';

// ─── Move ─────────────────────────────────────────────────────────────────────

/**
 * A player-submitted move action.
 * Sent by the client to the server for validation and execution.
 */
export interface Move {
  /** ID of the player submitting the move. */
  playerId: string;

  /** Action identifier (e.g. 'pick-from-factory', 'place-on-pattern-line'). */
  action: string;

  /** Source zone ID (where the piece is coming from). */
  source?: string;

  /** Destination zone ID (where the piece is going). */
  target?: string;

  /** Specific piece instance ID being moved. */
  pieceId?: string;

  /** Additional action-specific parameters (e.g. row index, color filter). */
  data?: Record<string, unknown>;
}

// ─── ValidMove ────────────────────────────────────────────────────────────────

/**
 * A legal move available to the current player.
 * Returned by HookFunctions.getValidMoves().
 * No playerId — the current player is implicit from HookContext.
 */
export interface ValidMove {
  /** Action identifier (matches Move.action). */
  action: string;

  /** Source zone ID. */
  source?: string;

  /** Destination zone ID. */
  target?: string;

  /** Specific piece instance ID. */
  pieceId?: string;

  /** Human-readable description for UI hints (e.g. 'Pick 2 blue tiles from factory 3'). */
  description?: string;
}

// ─── MoveResult ───────────────────────────────────────────────────────────────

/**
 * Result returned after processing a Move.
 * Produced by the engine after calling onMove hook.
 */
export interface MoveResult {
  /** True if the move was legal and successfully applied. */
  valid: boolean;

  /** Updated game state after the move (only present if valid is true). */
  newState?: GameState;

  /** Updated list of valid moves for the next player (only present if valid is true). */
  validMoves?: ValidMove[];

  /** Validation failure reasons (only present if valid is false). */
  errors?: string[];

  /**
   * True when the server returned 409 Conflict — a concurrent move collision.
   * The caller should re-fetch state and optionally retry the move.
   */
  conflict?: boolean;

  /**
   * Server-side state version after the move was applied.
   * Used by the client to order AppSync Events and ignore stale updates.
   */
  version?: number;
}
