/**
 * Piece type definitions.
 *
 * Pieces are the movable tokens in a board game — tiles, cards, dice, counters.
 * Each piece has a definition (PieceDef in game.json) and runtime state (PieceState).
 * Rendering uses a sprite asset when available; falls back to a procedural shape.
 */

// ─── Piece type ───────────────────────────────────────────────────────────────

/** The fundamental categories of game pieces. */
export type PieceType = 'tile' | 'card' | 'token' | 'die';

// ─── Piece definition ─────────────────────────────────────────────────────────

/** Procedural fallback rendering spec (used when no asset image is available). */
export interface PieceFallback {
  /** Geometric shape: 'square' | 'circle' | 'triangle' | 'hex'. */
  shape: string;
  /** Fill color as CSS hex string (e.g. '#4A90D9'). */
  color: string;
  /** Short label rendered inside the shape (e.g. 'B' for blue). */
  label: string;
}

/**
 * Declarative definition of a piece type in a game.
 * Defined in game.json; one entry per distinct piece type.
 */
export interface PieceDef {
  /** Unique identifier within the game (e.g. 'tile-blue', 'card-action'). */
  id: string;

  /** Piece category — determines default physics and interaction behavior. */
  type: PieceType;

  /** Texture asset identifier (loaded from assets registry). Optional. */
  asset?: string;

  /** Procedural rendering fallback used when no asset is available. */
  fallback: PieceFallback;

  /** Game-specific properties (e.g. point value, color enum, suit). */
  properties?: Record<string, unknown>;
}

// ─── Piece state ─────────────────────────────────────────────────────────────

/**
 * Runtime state of a single piece instance.
 * Multiple instances of the same PieceDef can exist simultaneously.
 */
export interface PieceState {
  /** Unique instance identifier (UUID). */
  id: string;

  /** Reference to the PieceDef.id this instance belongs to. */
  defId: string;

  /** ID of the zone this piece is currently in. */
  zoneId: string;

  /**
   * Position within the zone.
   * Grid zones use { row, col }; stack/hand/deck/discard use { index }.
   */
  position?: { row: number; col: number } | { index: number };

  /** Player ID if this piece belongs to a specific player. */
  ownerId?: string;

  /** Mutable game-specific state (e.g. face-up/face-down, selected, locked). */
  state?: Record<string, unknown>;
}
