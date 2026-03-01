/**
 * @bga2/games-azul — Azul board game implementation
 *
 * Phase 1: Game definition (game.json) and hook stubs.
 * Phase 2: Full Azul game logic (tile placement, scoring, win conditions).
 */

// Hook implementations (satisfy HookFunctions contract)
export { getValidMoves, onMove, onRoundEnd, azulHooks } from './hooks.js';

// Game definition path constant — use this to load game.json at runtime
export const AZUL_GAME_JSON_PATH = new URL('../game.json', import.meta.url).pathname;
