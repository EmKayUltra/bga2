/**
 * Game state types.
 *
 * GameState is the authoritative runtime representation of a game in progress.
 * Stored as JSONB in PostgreSQL; transmitted over the wire; validated on every move.
 */
import type { ZoneState } from './zones.js';

// Re-export ZoneState from here so consumers can import from state.ts or zones.ts
export type { ZoneState } from './zones.js';

// ─── Player state ─────────────────────────────────────────────────────────────

/** Runtime state of a player in a game session. */
export interface PlayerState {
  /** Unique player identifier (matches auth user ID). */
  id: string;

  /** Display name. */
  name: string;

  /** Current score (aggregated by hook logic). */
  score: number;

  /** Game-specific player data (e.g. pattern lines filled, wall tiles, floor penalties). */
  data: Record<string, unknown>;
}

// ─── Game state ───────────────────────────────────────────────────────────────

/**
 * Complete authoritative game state.
 * Produced by onMove / onRoundEnd hooks; consumed by renderer and move validator.
 */
export interface GameState {
  /** Unique match session identifier. */
  id: string;

  /** Game definition ID (matches GameConfig.id). */
  gameId: string;

  /** Optimistic locking version — incremented on every committed move. */
  version: number;

  /** Current game phase name (e.g. 'factory-offer', 'wall-tiling', 'scoring'). */
  phase: string;

  /** Index into GameState.players of the player whose turn it is. */
  currentPlayerIndex: number;

  /** All players in turn order. */
  players: PlayerState[];

  /** All zones, keyed by zone ID. */
  zones: Record<string, ZoneState>;

  /** Current round number (1-indexed). */
  round: number;

  /** True when the game has ended. */
  finished: boolean;

  /** ID of the winning player (set when finished is true). */
  winnerId?: string;
}
