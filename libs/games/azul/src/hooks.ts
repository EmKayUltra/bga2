/**
 * Azul game hook implementations.
 *
 * PHASE 1 STUBS — Full Azul game logic is implemented in Phase 2.
 * These stubs satisfy the HookFunctions contract so the engine can load
 * Azul without errors during Phase 1 development.
 *
 * Phase 2 will implement:
 *   - getValidMoves: factory-offer phase (pick same-color tiles from factory or center)
 *   - getValidMoves: wall-tiling phase (move completed pattern line tiles to wall)
 *   - onMove: tile placement, first-player-token handling, floor line overflow
 *   - onRoundEnd: wall-tiling scoring, floor line penalties, refill factories from bag
 *   - Win condition: end-of-game scoring (completed rows, columns, color sets)
 */
import type { HookContext, HookFunctions, ValidMove, Move } from '@bga2/shared-types';

/**
 * Return all legal moves for the current player.
 *
 * Azul phases:
 *   'factory-offer' — pick all tiles of one color from one factory/center
 *   'wall-tiling'   — move completed pattern lines to the wall (auto in standard Azul)
 *
 * TODO Phase 2: implement factory-offer move enumeration
 */
export function getValidMoves(_ctx: HookContext): ValidMove[] {
  // TODO Phase 2: enumerate tiles on factory displays and center area
  // Return one ValidMove per (factory, color) combination the current player can pick
  return [];
}

/**
 * Apply a player's move to the game state.
 *
 * Azul move types:
 *   'pick-from-factory' — take all tiles of one color from a factory, move rest to center
 *   'pick-from-center'  — take all tiles of one color from center
 *   'place-on-pattern-line' — place picked tiles onto a pattern line row
 *   'place-on-floor-line' — overflow tiles go to floor line (penalty)
 *
 * TODO Phase 2: implement tile movement, first-player-token tracking
 */
export function onMove(_ctx: HookContext, _move: Move): void {
  // TODO Phase 2: validate move against current phase, apply tile movement
}

/**
 * Called at the end of each round.
 *
 * Azul round-end steps:
 *   1. Wall-tiling phase: move completed pattern line tiles to the wall, score each
 *   2. Apply floor line penalties
 *   3. Return leftover tiles to the lid (box cover)
 *   4. Check end-of-game condition (any player has completed a horizontal wall row)
 *   5. If game continues: refill factory displays from bag (shuffle lid back in if bag empties)
 *
 * TODO Phase 2: implement full Azul round-end logic
 */
export function onRoundEnd(_ctx: HookContext): void {
  // TODO Phase 2: wall-tiling, scoring, floor penalties, factory refill
}

// Export as HookFunctions to allow compile-time contract verification
export const azulHooks: HookFunctions = {
  getValidMoves,
  onMove,
  onRoundEnd,
};
