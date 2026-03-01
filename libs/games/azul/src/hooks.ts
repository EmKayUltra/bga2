/**
 * Azul game hook implementations — Phase 2 full implementation.
 *
 * Implements getValidMoves, onMove, and onRoundEnd for complete standard Azul
 * rules supporting 2-4 players.
 *
 * CRITICAL: All hook functions mutate ctx.state in place — never reassign ctx.state.
 * This is required by HookExecutor.cs which reads ctx.state back via JSON.stringify.
 */
import type { HookContext, HookFunctions, ValidMove, Move } from '@bga2/shared-types';
import type { GameState, PlayerState } from '@bga2/shared-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Standard Azul wall color pattern (fixed layout, row-shifted).
 * wallPattern[row][col] = color name.
 * Row index 0 = pattern line 1 (capacity 1).
 */
const WALL_PATTERN: string[][] = [
  ['blue', 'yellow', 'red', 'black', 'white'],
  ['white', 'blue', 'yellow', 'red', 'black'],
  ['black', 'white', 'blue', 'yellow', 'red'],
  ['red', 'black', 'white', 'blue', 'yellow'],
  ['yellow', 'red', 'black', 'white', 'blue'],
];

/** Floor line penalty amounts by position (0-indexed). */
const FLOOR_PENALTIES: number[] = [-1, -1, -2, -2, -2, -3, -3];

/** All 5 tile colors. */
const TILE_COLORS: string[] = ['blue', 'yellow', 'red', 'black', 'white'];

/** The defId for the first-player token piece. */
const FIRST_PLAYER_TOKEN = 'first-player-token';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface AzulPatternLine {
  color: string | null;
  count: number;
}

interface AzulPlayerData {
  wall: boolean[][];
  patternLines: AzulPatternLine[];
  floorLine: string[];
  hasFirstPlayerToken: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the column index for a given color in a wall row.
 * Returns -1 if the color is not in the row (should not happen with valid colors).
 */
function getWallColumn(row: number, color: string): number {
  return WALL_PATTERN[row].indexOf(color);
}

/**
 * Scores a newly placed wall tile at (row, col).
 * Counts contiguous horizontal and vertical runs including the placed tile.
 * Isolated tile = 1 point. Connected runs = sum of horizontal + vertical run lengths.
 */
function scoreWallPlacement(wall: boolean[][], row: number, col: number): number {
  // Count horizontal run including self
  let hRun = 1;
  for (let c = col - 1; c >= 0 && wall[row][c]; c--) hRun++;
  for (let c = col + 1; c < 5 && wall[row][c]; c++) hRun++;

  // Count vertical run including self
  let vRun = 1;
  for (let r = row - 1; r >= 0 && wall[r][col]; r--) vRun--;
  for (let r = row + 1; r < 5 && wall[r][col]; r++) vRun--;

  // Re-count correctly
  hRun = 1;
  for (let c = col - 1; c >= 0 && wall[row][c]; c--) hRun++;
  for (let c = col + 1; c < 5 && wall[row][c]; c++) hRun++;

  vRun = 1;
  for (let r = row - 1; r >= 0 && wall[r][col]; r--) vRun++;
  for (let r = row + 1; r < 5 && wall[r][col]; r++) vRun++;

  // Isolated tile: 1 point
  if (hRun === 1 && vRun === 1) return 1;
  // Connected: sum of runs (each run counted separately if > 1)
  return (hRun > 1 ? hRun : 0) + (vRun > 1 ? vRun : 0);
}

/**
 * Returns true if all factory zones and center are empty.
 */
function areAllSourcesEmpty(state: GameState): boolean {
  const factoryKeys = Object.keys(state.zones).filter(k => k.startsWith('factory-'));
  const centerEmpty = state.zones['center'].pieces.length === 0;
  const factoriesEmpty = factoryKeys.every(k => state.zones[k].pieces.length === 0);
  return centerEmpty && factoriesEmpty;
}

/**
 * Shuffles an array in place using Fisher-Yates algorithm.
 */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}

/**
 * Creates a fresh bag of 100 Azul tiles (20 of each of the 5 colors).
 */
function createInitialBag(): Array<{ id: string; defId: string; zoneId: string }> {
  const tiles: Array<{ id: string; defId: string; zoneId: string }> = [];
  let counter = 0;
  for (const color of TILE_COLORS) {
    for (let i = 0; i < 20; i++) {
      counter++;
      tiles.push({ id: `tile-${color}-${counter}`, defId: color, zoneId: 'bag' });
    }
  }
  return tiles;
}

/**
 * Fills each factory with 4 tiles drawn from the bag.
 * If the bag runs empty mid-fill, shuffles the lid into the bag and continues.
 */
function populateFactories(state: GameState): void {
  const factoryKeys = Object.keys(state.zones)
    .filter(k => k.startsWith('factory-'))
    .sort();

  for (const factoryKey of factoryKeys) {
    const factory = state.zones[factoryKey];
    factory.pieces = [];

    for (let i = 0; i < 4; i++) {
      // If bag is empty, shuffle lid into bag
      if (state.zones['bag'].pieces.length === 0) {
        const lid = state.zones['lid'].pieces;
        if (lid.length === 0) break; // No more tiles at all
        // Move lid to bag and shuffle
        state.zones['bag'].pieces = lid.slice();
        state.zones['lid'].pieces = [];
        shuffleArray(state.zones['bag'].pieces);
      }

      const tile = state.zones['bag'].pieces.pop();
      if (tile) {
        tile.zoneId = factoryKey;
        factory.pieces.push(tile);
      }
    }
  }
}

/**
 * Gets the AzulPlayerData for a player (casts data to the Azul shape).
 */
function getPlayerData(player: PlayerState): AzulPlayerData {
  return player.data as unknown as AzulPlayerData;
}

// ---------------------------------------------------------------------------
// getValidMoves
// ---------------------------------------------------------------------------

/**
 * Returns all legal moves for the current player during factory-offer phase.
 *
 * A ValidMove has:
 *   action: 'pick-tiles'
 *   source: factory zone ID or 'center'
 *   target: pattern line zone ID or floor line zone ID
 *   pieceId: the color being picked (used as identifier for the color)
 */
export function getValidMoves(ctx: HookContext): ValidMove[] {
  const state = ctx.state;

  // Only return moves during factory-offer phase
  if (state.phase !== 'factory-offer') return [];
  if (state.finished) return [];

  const playerIdx = state.currentPlayerIndex;
  const player = state.players[playerIdx];
  const playerData = getPlayerData(player);
  const moves: ValidMove[] = [];

  // Gather all source zones with tiles
  const sourceZoneIds = Object.keys(state.zones).filter(zoneId => {
    if (zoneId === 'center') return state.zones[zoneId].pieces.length > 0;
    if (zoneId.startsWith('factory-')) return state.zones[zoneId].pieces.length > 0;
    return false;
  });

  for (const sourceId of sourceZoneIds) {
    const pieces = state.zones[sourceId].pieces;

    // Gather unique colors in this source (excluding first-player token)
    const colorsInSource = new Set<string>();
    for (const piece of pieces) {
      if (piece.defId !== FIRST_PLAYER_TOKEN) {
        colorsInSource.add(piece.defId);
      }
    }

    for (const color of Array.from(colorsInSource)) {
      // For each color, determine which pattern lines are valid targets
      for (let rowIdx = 0; rowIdx < 5; rowIdx++) {
        // rowIdx 0 = pattern line 1 (capacity 1), rowIdx 4 = pattern line 5 (capacity 5)
        const capacity = rowIdx + 1;
        const patternLine = playerData.patternLines[rowIdx];

        // Check: pattern line is not full
        if (patternLine.count >= capacity) continue;

        // Check: pattern line is empty OR already has this color
        if (patternLine.color !== null && patternLine.color !== color) continue;

        // Check: wall row does not already have this color
        const wallCol = getWallColumn(rowIdx, color);
        if (wallCol === -1) continue;
        if (playerData.wall[rowIdx][wallCol]) continue;

        const targetZoneId = `player-${playerIdx}-pattern-line-${capacity}`;
        moves.push({
          action: 'pick-tiles',
          source: sourceId,
          target: targetZoneId,
          pieceId: color,
          description: `Pick ${color} from ${sourceId} to pattern line ${capacity}`,
        });
      }

      // Always valid: dump all tiles directly to floor line
      moves.push({
        action: 'pick-tiles',
        source: sourceId,
        target: `player-${playerIdx}-floor-line`,
        pieceId: color,
        description: `Pick ${color} from ${sourceId} to floor line`,
      });
    }
  }

  return moves;
}

// ---------------------------------------------------------------------------
// onMove
// ---------------------------------------------------------------------------

/**
 * Applies a player's move to the game state.
 *
 * Expected move shape:
 *   action: 'pick-tiles'
 *   source: 'factory-N' or 'center'
 *   data.color: string — the color being picked
 *   data.patternLineRow: number — 0-based row index (0 = row 1, 4 = row 5)
 *                        or -1 to dump directly to floor line
 *
 * Mutates ctx.state in place.
 */
export function onMove(ctx: HookContext, move: Move): void {
  if (move.action !== 'pick-tiles') return;

  const state = ctx.state;
  const playerIdx = state.currentPlayerIndex;
  const player = state.players[playerIdx];
  const playerData = getPlayerData(player);

  const sourceId = move.source as string;
  const color = (move.data as Record<string, unknown>)['color'] as string;
  const patternLineRow = (move.data as Record<string, unknown>)['patternLineRow'] as number;

  const sourceZone = state.zones[sourceId];

  // Separate same-color tiles from leftovers
  const picked: typeof sourceZone.pieces = [];
  const leftover: typeof sourceZone.pieces = [];
  let hasToken = false;

  for (const piece of sourceZone.pieces) {
    if (piece.defId === FIRST_PLAYER_TOKEN) {
      hasToken = true;
    } else if (piece.defId === color) {
      picked.push(piece);
    } else {
      leftover.push(piece);
    }
  }

  // Clear the source zone
  state.zones[sourceId].pieces = [];

  // Handle first-player token (only when picking from center)
  if (sourceId === 'center' && hasToken) {
    // Player takes the first-player token — it goes to their floor line
    playerData.hasFirstPlayerToken = true;
    const tokenPiece = { id: 'first-player-token', defId: FIRST_PLAYER_TOKEN, zoneId: `player-${playerIdx}-floor-line` };
    state.zones[`player-${playerIdx}-floor-line`].pieces.unshift(tokenPiece);
    if (!playerData.floorLine) playerData.floorLine = [];
    playerData.floorLine.unshift(FIRST_PLAYER_TOKEN);
  }

  if (sourceId !== 'center') {
    // Picking from factory: leftover (other-color tiles) goes to center
    for (const piece of leftover) {
      piece.zoneId = 'center';
      state.zones['center'].pieces.push(piece);
    }
  } else {
    // Picking from center: leftover (other-color tiles) stays in center — put them back
    for (const piece of leftover) {
      state.zones['center'].pieces.push(piece);
    }
  }

  // Determine where to place the picked tiles
  const floorZoneId = `player-${playerIdx}-floor-line`;

  if (patternLineRow < 0) {
    // Dump all to floor line
    addToFloorLine(state, playerData, playerIdx, picked, floorZoneId);
  } else {
    // Place on pattern line
    const capacity = patternLineRow + 1;
    const patternZoneId = `player-${playerIdx}-pattern-line-${capacity}`;
    const currentCount = playerData.patternLines[patternLineRow].count;
    const spaceOnLine = capacity - currentCount;

    const toLine = picked.slice(0, spaceOnLine);
    const toFloor = picked.slice(spaceOnLine);

    // Place on pattern line
    for (const piece of toLine) {
      piece.zoneId = patternZoneId;
      state.zones[patternZoneId].pieces.push(piece);
    }
    playerData.patternLines[patternLineRow].color = color;
    playerData.patternLines[patternLineRow].count = currentCount + toLine.length;

    // Overflow to floor line
    if (toFloor.length > 0) {
      addToFloorLine(state, playerData, playerIdx, toFloor, floorZoneId);
    }
  }

  // Check if all factories and center are empty → round ends
  if (areAllSourcesEmpty(state)) {
    state.phase = 'wall-tiling';
  } else {
    // Advance turn
    state.currentPlayerIndex = (playerIdx + 1) % state.players.length;
  }
}

/**
 * Adds tiles to a player's floor line, routing excess to the lid.
 */
function addToFloorLine(
  state: GameState,
  playerData: AzulPlayerData,
  playerIdx: number,
  tiles: Array<{ id: string; defId: string; zoneId: string }>,
  floorZoneId: string
): void {
  const floorZone = state.zones[floorZoneId];
  const floorSpace = 7 - floorZone.pieces.length;

  const toFloor = tiles.slice(0, floorSpace);
  const toLid = tiles.slice(floorSpace);

  for (const piece of toFloor) {
    piece.zoneId = floorZoneId;
    floorZone.pieces.push(piece);
    if (!playerData.floorLine) playerData.floorLine = [];
    playerData.floorLine.push(piece.defId);
  }

  for (const piece of toLid) {
    piece.zoneId = 'lid';
    state.zones['lid'].pieces.push(piece);
  }
}

// ---------------------------------------------------------------------------
// onRoundEnd
// ---------------------------------------------------------------------------

/**
 * Called at the end of each round.
 *
 * Steps:
 *   1. Wall tiling — score and clear completed pattern lines
 *   2. Floor penalties — apply penalties, clear floor lines
 *   3. End-game check — if any player has a complete wall row, apply end-game bonuses, set winner
 *   4. If game continues — refill factories, place first-player token in center, increment round
 *
 * Mutates ctx.state in place.
 */
export function onRoundEnd(ctx: HookContext): void {
  const state = ctx.state;

  // Step 1: Wall tiling — for each player, for each completed pattern line
  for (let playerIdx = 0; playerIdx < state.players.length; playerIdx++) {
    const player = state.players[playerIdx];
    const playerData = getPlayerData(player);

    for (let rowIdx = 0; rowIdx < 5; rowIdx++) {
      const capacity = rowIdx + 1;
      const patternLine = playerData.patternLines[rowIdx];

      if (patternLine.count < capacity) continue; // Not full — skip
      if (!patternLine.color) continue; // Empty — skip

      const color = patternLine.color;
      const wallCol = getWallColumn(rowIdx, color);

      // Place tile on wall
      playerData.wall[rowIdx][wallCol] = true;

      // Score the placed tile (adjacency scoring)
      const points = scoreWallPlacement(playerData.wall, rowIdx, wallCol);
      player.score += points;

      // Clear pattern line — excess tiles (all but 1) go to lid
      const patternZoneId = `player-${playerIdx}-pattern-line-${capacity}`;
      const patternPieces = state.zones[patternZoneId].pieces;

      // One tile was placed on wall; the rest (capacity - 1) go to lid
      const excessPieces = patternPieces.slice(0, patternPieces.length - 1);
      for (const piece of excessPieces) {
        piece.zoneId = 'lid';
        state.zones['lid'].pieces.push(piece);
      }
      // The last piece conceptually becomes the wall tile (we just track it as boolean)
      // Move it to lid too (wall is tracked in playerData.wall boolean grid)
      const placedPiece = patternPieces[patternPieces.length - 1];
      if (placedPiece) {
        placedPiece.zoneId = 'lid';
        state.zones['lid'].pieces.push(placedPiece);
      }
      state.zones[patternZoneId].pieces = [];

      // Reset pattern line data
      playerData.patternLines[rowIdx] = { color: null, count: 0 };
    }
  }

  // Step 2: Floor penalties — for each player
  // Find the next-round starting player BEFORE clearing hasFirstPlayerToken
  let nextRoundStartPlayerIdx = 0; // default to player 0
  for (let i = 0; i < state.players.length; i++) {
    if (getPlayerData(state.players[i]).hasFirstPlayerToken) {
      nextRoundStartPlayerIdx = i;
      break;
    }
  }

  for (let playerIdx = 0; playerIdx < state.players.length; playerIdx++) {
    const player = state.players[playerIdx];
    const playerData = getPlayerData(player);

    const floorZoneId = `player-${playerIdx}-floor-line`;
    const floorPieces = state.zones[floorZoneId].pieces.slice(); // copy to avoid mutation issues
    let penalty = 0;

    for (let i = 0; i < floorPieces.length && i < FLOOR_PENALTIES.length; i++) {
      penalty += FLOOR_PENALTIES[i];
    }

    // Apply penalty (score cannot go below 0)
    player.score = Math.max(0, player.score + penalty);

    // Move floor tiles to lid (except first-player token which is simply discarded)
    for (const piece of floorPieces) {
      if (piece.defId !== FIRST_PLAYER_TOKEN) {
        piece.zoneId = 'lid';
        state.zones['lid'].pieces.push(piece);
      }
    }
    state.zones[floorZoneId].pieces = [];

    // Clear player data floor line and token
    playerData.floorLine = [];
    playerData.hasFirstPlayerToken = false;
  }

  // Step 3: End-game check — any player with a completed horizontal row?
  const anyComplete = state.players.some((player) => {
    const wall = getPlayerData(player).wall;
    return wall.some(row => row.every(cell => cell));
  });

  if (anyComplete) {
    state.finished = true;

    // Apply end-game bonuses for ALL players
    for (let playerIdx = 0; playerIdx < state.players.length; playerIdx++) {
      const player = state.players[playerIdx];
      const wall = getPlayerData(player).wall;

      // +2 per complete row
      for (let row = 0; row < 5; row++) {
        if (wall[row].every(cell => cell)) {
          player.score += 2;
        }
      }

      // +7 per complete column
      for (let col = 0; col < 5; col++) {
        let colComplete = true;
        for (let row = 0; row < 5; row++) {
          if (!wall[row][col]) { colComplete = false; break; }
        }
        if (colComplete) player.score += 7;
      }

      // +10 per complete color set (all 5 placements of one color)
      for (let colorIdx = 0; colorIdx < TILE_COLORS.length; colorIdx++) {
        const color = TILE_COLORS[colorIdx];
        let colorComplete = true;
        for (let row = 0; row < 5; row++) {
          const col = getWallColumn(row, color);
          if (!wall[row][col]) { colorComplete = false; break; }
        }
        if (colorComplete) player.score += 10;
      }
    }

    // Determine winner: highest score. Tiebreak: most complete rows.
    let winnerId = state.players[0].id;
    let winnerScore = state.players[0].score;
    let winnerRows = countCompleteRows(getPlayerData(state.players[0]).wall);

    for (let i = 1; i < state.players.length; i++) {
      const player = state.players[i];
      const playerRows = countCompleteRows(getPlayerData(player).wall);

      if (
        player.score > winnerScore ||
        (player.score === winnerScore && playerRows > winnerRows)
      ) {
        winnerId = player.id;
        winnerScore = player.score;
        winnerRows = playerRows;
      }
    }

    state.winnerId = winnerId;
    state.phase = 'finished';
    return;
  }

  // Step 4: Prepare next round
  // Refill factories from bag
  populateFactories(state);

  // Place first-player token in center
  state.zones['center'].pieces.push({
    id: 'first-player-token',
    defId: FIRST_PLAYER_TOKEN,
    zoneId: 'center',
  });

  // Advance round
  state.round = (state.round || 1) + 1;

  // Set starting player for next round (the player who had the first-player token)
  state.currentPlayerIndex = nextRoundStartPlayerIdx;

  // Return to factory-offer phase
  state.phase = 'factory-offer';
}

/**
 * Counts the number of complete horizontal rows in a wall.
 */
function countCompleteRows(wall: boolean[][]): number {
  let count = 0;
  for (const row of wall) {
    if (row.every(cell => cell)) count++;
  }
  return count;
}

// Export as HookFunctions to allow compile-time contract verification
export const azulHooks: HookFunctions = {
  getValidMoves,
  onMove,
  onRoundEnd,
};
