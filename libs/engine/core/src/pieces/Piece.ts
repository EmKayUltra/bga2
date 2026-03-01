/**
 * Piece — a single runtime piece instance.
 *
 * Pieces are the movable tokens in a board game engine.
 * Each Piece references a PieceDef for its type definition and carries
 * mutable runtime state (current zone, owner, arbitrary game state).
 */

import type { PieceDef, PieceType, PieceFallback } from '@bga2/shared-types';

export class Piece {
  /** Unique runtime identifier (e.g. "tile-blue-0"). */
  readonly id: string;

  /** References the PieceDef.id this instance was created from. */
  readonly defId: string;

  /** The category of piece (tile, card, token, die). */
  readonly type: PieceType;

  /** Current zone this piece resides in. */
  zoneId: string;

  /** Player ID if this piece belongs to a specific player. */
  ownerId?: string;

  /** Optional sprite asset identifier. */
  readonly asset?: string;

  /** Procedural fallback rendering spec. */
  readonly fallback: PieceFallback;

  /** Mutable game-specific state (face-up/down, selected, locked, etc.). */
  state: Record<string, unknown>;

  constructor(
    id: string,
    def: PieceDef,
    zoneId: string,
    ownerId?: string
  ) {
    this.id = id;
    this.defId = def.id;
    this.type = def.type;
    this.zoneId = zoneId;
    this.ownerId = ownerId;
    this.asset = def.asset;
    this.fallback = def.fallback;
    this.state = { ...(def.properties ?? {}) };
  }

  /** Update the piece's current zone. */
  moveTo(zoneId: string): void {
    this.zoneId = zoneId;
  }
}
