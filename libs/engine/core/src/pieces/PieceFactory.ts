/**
 * PieceFactory — creates Piece runtime instances from PieceDef objects.
 *
 * Multiple piece instances of the same definition can exist simultaneously
 * (e.g., 20 blue tiles in Azul). The factory assigns unique runtime ids.
 */

import type { PieceDef } from '@bga2/shared-types';
import { Piece } from './Piece.js';

export const PieceFactory = {
  /**
   * Create runtime Piece instances from a list of definitions.
   *
   * @param defs     Array of piece type definitions.
   * @param counts   Optional map of defId → quantity to create. Defaults to 1 per def.
   * @param zoneId   Initial zone for all created pieces (defaults to 'unplaced').
   */
  createPieces(
    defs: PieceDef[],
    counts?: Record<string, number>,
    zoneId = 'unplaced'
  ): Piece[] {
    const pieces: Piece[] = [];
    for (const def of defs) {
      const count = counts?.[def.id] ?? 1;
      for (let i = 0; i < count; i++) {
        pieces.push(new Piece(`${def.id}-${i}`, def, zoneId));
      }
    }
    return pieces;
  },
};
