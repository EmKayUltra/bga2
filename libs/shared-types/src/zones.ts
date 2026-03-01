/**
 * Zone type definitions.
 *
 * Zones are the fundamental spatial containers in a board game — a factory display,
 * a player hand, a draw pile, a discard pile, a game board grid.
 * The engine knows how to render and interact with each zone type by default;
 * hooks can override zone behavior for custom game rules.
 */

// ─── Zone type enum ───────────────────────────────────────────────────────────

/** The fundamental categories of board game zones. */
export type ZoneType = 'grid' | 'stack' | 'hand' | 'deck' | 'discard';

// ─── Zone render config ───────────────────────────────────────────────────────

/** Visual rendering parameters for a zone. */
export interface ZoneRenderConfig {
  /** Zone border shape ('rect' | 'circle' | 'hex'). */
  shape?: string;
  /** Total zone size in logical units. */
  size?: { width: number; height: number };
  /** Size of each grid cell in logical units (used for grid zones). */
  cellSize?: number;
}

// ─── Zone definition ─────────────────────────────────────────────────────────

/**
 * Declarative definition of a zone in a game.
 * Defined in game.json; consumed by the engine loader and renderer.
 */
export interface ZoneDef {
  /** Unique identifier within the game (e.g. 'factory-0', 'player-wall'). */
  id: string;

  /** Zone category — determines default render and interaction behavior. */
  type: ZoneType;

  /** Maximum number of pieces this zone can hold. */
  capacity?: number;

  /** Number of rows (grid zones). */
  rows?: number;

  /** Number of columns (grid zones). */
  cols?: number;

  /**
   * Ownership model.
   * 'player' — one instance per player (id is a template, instantiated per player).
   * 'shared' — single shared zone for all players.
   */
  owner?: 'player' | 'shared';

  /** Logical position on the game board. */
  position?: { x: number; y: number };

  /** Optional render overrides. */
  render?: ZoneRenderConfig;
}

// ─── Zone state ───────────────────────────────────────────────────────────────
// (Runtime representation — defined here for co-location with ZoneDef)
// Re-exported from state.ts as well via index.ts barrel.

export interface ZoneState {
  /** Zone identifier (matches ZoneDef.id). */
  id: string;
  /** Ordered list of pieces currently in this zone. */
  pieces: import('./pieces.js').PieceState[];
}
