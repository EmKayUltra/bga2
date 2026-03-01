/**
 * Game definition types.
 *
 * GameConfig is the top-level type for game.json — the declarative description
 * of a complete board game. The engine loader reads game.json, validates it
 * against this type, and uses it to instantiate zones, pieces, and hook functions.
 */
import type { ZoneDef } from './zones.js';
import type { PieceDef } from './pieces.js';

// ─── Turn order ───────────────────────────────────────────────────────────────

/**
 * Turn order strategy.
 * 'sequential' — players take turns in index order (0, 1, 2, ..., 0, 1, ...).
 * 'simultaneous' — all players act at the same time.
 * 'hook-controlled' — hooks determine the next player via onMove return value.
 */
export type TurnOrder = 'sequential' | 'simultaneous' | 'hook-controlled';

// ─── Hook reference ───────────────────────────────────────────────────────────

/**
 * Reference to the hooks module that implements game logic.
 * The engine loader resolves this path relative to the game package root.
 */
export interface HookRef {
  /** Relative path to the hooks file (e.g. 'hooks.ts' or 'src/hooks.ts'). */
  file: string;

  /** List of hook event names this file handles (for validation and documentation). */
  events: string[];
}

// ─── Game config ─────────────────────────────────────────────────────────────

/**
 * Complete declarative definition of a board game.
 * Stored in game.json at the root of each game package.
 *
 * The engine reads this at game load time to:
 * - Validate the definition
 * - Instantiate all zones and pieces
 * - Load and bind hook functions
 * - Set up turn order
 */
export interface GameConfig {
  /** Unique game identifier (e.g. 'azul', 'ticket-to-ride'). */
  id: string;

  /** Semantic version of this game definition (e.g. '1.0.0'). */
  version: string;

  /** Human-readable game title for display in the lobby. */
  title: string;

  /** Player count constraints. */
  players: {
    min: number;
    max: number;
  };

  /** All zones that exist in this game (shared + per-player templates). */
  zones: ZoneDef[];

  /** All piece type definitions for this game. */
  pieces: PieceDef[];

  /** How turns are ordered between players. */
  turnOrder: TurnOrder;

  /** Reference to the game's hook implementation module. */
  hooks: HookRef;
}
