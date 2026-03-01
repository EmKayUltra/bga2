/**
 * Azul hooks unit tests — Phase 2 implementation
 *
 * Covers:
 *   AZUL-01: Tile drafting via getValidMoves + onMove (factory-offer phase)
 *   AZUL-02: Wall tiling in onRoundEnd
 *   AZUL-03: Per-round and end-game scoring
 *   AZUL-04: 2-4 player factory count correctness
 *   AZUL-05: Edge cases (floor overflow, factory exhaustion, first-player token)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getValidMoves, onMove, onRoundEnd } from './hooks.js';
import type { HookContext } from '@bga2/shared-types';
import type { GameState, PlayerState } from '@bga2/shared-types';

// ---------------------------------------------------------------------------
// Helpers to build minimal game state
// ---------------------------------------------------------------------------

function makePiece(id: string, color: string, zoneId: string) {
  return { id, defId: color, zoneId };
}

function makePlayer(index: number, overrides: Record<string, unknown> = {}): PlayerState {
  return {
    id: `player-${index}`,
    name: `Player ${index + 1}`,
    score: 0,
    data: {
      wall: [
        [false, false, false, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false],
      ],
      patternLines: [
        { color: null, count: 0 },
        { color: null, count: 0 },
        { color: null, count: 0 },
        { color: null, count: 0 },
        { color: null, count: 0 },
      ],
      floorLine: [] as string[],
      hasFirstPlayerToken: false,
      ...overrides,
    },
  };
}

function makeZones(factoryCount: number, playerCount: number): GameState['zones'] {
  const zones: GameState['zones'] = {};
  for (let i = 0; i < factoryCount; i++) {
    zones[`factory-${i}`] = { id: `factory-${i}`, pieces: [] };
  }
  zones['center'] = { id: 'center', pieces: [] };
  zones['bag'] = { id: 'bag', pieces: [] };
  zones['lid'] = { id: 'lid', pieces: [] };

  for (let p = 0; p < playerCount; p++) {
    for (let row = 1; row <= 5; row++) {
      const zoneId = `player-${p}-pattern-line-${row}`;
      zones[zoneId] = { id: zoneId, pieces: [] };
    }
    zones[`player-${p}-wall`] = { id: `player-${p}-wall`, pieces: [] };
    zones[`player-${p}-floor-line`] = { id: `player-${p}-floor-line`, pieces: [] };
  }
  return zones;
}

function makeState(
  factoryCount: number,
  playerCount: number,
  overrides: Partial<GameState> = {}
): GameState {
  return {
    id: 'test-game',
    gameId: 'azul',
    version: 1,
    phase: 'factory-offer',
    currentPlayerIndex: 0,
    players: Array.from({ length: playerCount }, (_, i) => makePlayer(i)),
    zones: makeZones(factoryCount, playerCount),
    round: 1,
    finished: false,
    ...overrides,
  };
}

function makeCtx(state: GameState): HookContext {
  return {
    state,
    currentPlayer: state.players[state.currentPlayerIndex]?.id ?? 'player-0',
    round: state.round,
    players: state.players.map((p, i) => ({ id: p.id, name: p.name, index: i })),
  };
}

let pieceCounter = 0;
function pid(color: string): ReturnType<typeof makePiece> {
  pieceCounter++;
  return makePiece(`p${pieceCounter}`, color, '');
}

// ---------------------------------------------------------------------------
// getValidMoves tests
// ---------------------------------------------------------------------------

describe('getValidMoves', () => {
  beforeEach(() => {
    pieceCounter = 0;
  });

  it('AZUL-01: returns empty array when phase is not factory-offer', () => {
    const state = makeState(5, 2, { phase: 'wall-tiling' });
    const ctx = makeCtx(state);
    expect(getValidMoves(ctx)).toEqual([]);
  });

  it('AZUL-01: returns empty array when game is finished', () => {
    const state = makeState(5, 2, { phase: 'factory-offer', finished: true });
    const ctx = makeCtx(state);
    expect(getValidMoves(ctx)).toEqual([]);
  });

  it('AZUL-01: returns empty array when all factories and center are empty', () => {
    const state = makeState(5, 2);
    const ctx = makeCtx(state);
    expect(getValidMoves(ctx)).toEqual([]);
  });

  it('AZUL-01: returns moves for each (source, color, patternLine) combination', () => {
    const state = makeState(5, 2);
    // factory-0 has 2 blue, 1 red, 1 yellow
    state.zones['factory-0'].pieces = [
      pid('blue'), pid('blue'), pid('red'), pid('yellow'),
    ];
    const ctx = makeCtx(state);
    const moves = getValidMoves(ctx);

    // Should have moves for blue, red, yellow from factory-0
    // Each can go to 5 pattern lines (rows 1-5) + floor line = 6 targets each
    // Actually: some rows may be invalid (e.g., wall already has that color) — in fresh state all are valid
    const blueFromFactory0 = moves.filter(m => m.source === 'factory-0' && m.pieceId === 'blue');
    const redFromFactory0 = moves.filter(m => m.source === 'factory-0' && m.pieceId === 'red');
    const yellowFromFactory0 = moves.filter(m => m.source === 'factory-0' && m.pieceId === 'yellow');

    expect(blueFromFactory0.length).toBeGreaterThan(0);
    expect(redFromFactory0.length).toBeGreaterThan(0);
    expect(yellowFromFactory0.length).toBeGreaterThan(0);
  });

  it('AZUL-01: includes floor-line-only moves (dump tiles directly to floor)', () => {
    const state = makeState(5, 2);
    state.zones['factory-0'].pieces = [pid('blue'), pid('blue')];
    const ctx = makeCtx(state);
    const moves = getValidMoves(ctx);

    const floorMoves = moves.filter(
      m => m.source === 'factory-0' && m.target === 'player-0-floor-line'
    );
    expect(floorMoves.length).toBeGreaterThan(0);
  });

  it('AZUL-01: returns moves from center when center has tiles', () => {
    const state = makeState(5, 2);
    state.zones['center'].pieces = [pid('red'), pid('black')];
    const ctx = makeCtx(state);
    const moves = getValidMoves(ctx);

    const redFromCenter = moves.filter(m => m.source === 'center' && m.pieceId === 'red');
    expect(redFromCenter.length).toBeGreaterThan(0);
  });

  it('AZUL-01: pattern line already partially filled with correct color — move valid', () => {
    const state = makeState(5, 2);
    state.zones['factory-0'].pieces = [pid('blue')];
    // Row 3 (index 2) has 2 blue tiles, capacity 3
    (state.players[0].data as Record<string, unknown>).patternLines = [
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: 'blue', count: 2 },
      { color: null, count: 0 },
      { color: null, count: 0 },
    ];
    const ctx = makeCtx(state);
    const moves = getValidMoves(ctx);

    const toRow3 = moves.filter(
      m => m.source === 'factory-0' && m.pieceId === 'blue' && m.target === 'player-0-pattern-line-3'
    );
    expect(toRow3.length).toBe(1);
  });

  it('AZUL-01: full pattern line is NOT a valid target', () => {
    const state = makeState(5, 2);
    state.zones['factory-0'].pieces = [pid('blue')];
    // Row 1 (index 0, capacity 1) is already full with blue
    (state.players[0].data as Record<string, unknown>).patternLines = [
      { color: 'blue', count: 1 },
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: null, count: 0 },
    ];
    const ctx = makeCtx(state);
    const moves = getValidMoves(ctx);

    const toRow1 = moves.filter(
      m => m.source === 'factory-0' && m.pieceId === 'blue' && m.target === 'player-0-pattern-line-1'
    );
    expect(toRow1.length).toBe(0);
  });

  it('AZUL-01: wall row already has color — cannot target that pattern line', () => {
    const state = makeState(5, 2);
    state.zones['factory-0'].pieces = [pid('blue')];
    // Wall row 0 already has blue (column 0)
    const wall = (state.players[0].data as Record<string, unknown>).wall as boolean[][];
    wall[0][0] = true; // row 0, col 0 = blue (WALL_PATTERN row 0: blue, yellow, red, black, white)
    const ctx = makeCtx(state);
    const moves = getValidMoves(ctx);

    // Pattern line row 1 (index 0) maps to wall row 0 — blue is already placed there
    const toRow1WithBlue = moves.filter(
      m => m.source === 'factory-0' && m.pieceId === 'blue' && m.target === 'player-0-pattern-line-1'
    );
    expect(toRow1WithBlue.length).toBe(0);
  });

  it('AZUL-04: 2-player game has 5 factories', () => {
    const state = makeState(5, 2);
    const factoryZones = Object.keys(state.zones).filter(k => k.startsWith('factory-'));
    expect(factoryZones.length).toBe(5);
  });

  it('AZUL-04: 4-player game has 9 factories', () => {
    const state = makeState(9, 4);
    const factoryZones = Object.keys(state.zones).filter(k => k.startsWith('factory-'));
    expect(factoryZones.length).toBe(9);

    // Seed one factory and verify moves come back
    state.zones['factory-0'].pieces = [pid('red')];
    const ctx = makeCtx(state);
    const moves = getValidMoves(ctx);
    expect(moves.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// onMove tests
// ---------------------------------------------------------------------------

describe('onMove', () => {
  beforeEach(() => {
    pieceCounter = 0;
  });

  it('AZUL-01: pick-tiles from factory places same-color on pattern line, rest to center', () => {
    const state = makeState(5, 2);
    const blueA = pid('blue');
    const blueB = pid('blue');
    const red = pid('red');
    const yellow = pid('yellow');
    state.zones['factory-0'].pieces = [blueA, blueB, red, yellow];

    const ctx = makeCtx(state);
    onMove(ctx, {
      playerId: 'player-0',
      action: 'pick-tiles',
      source: 'factory-0',
      data: { color: 'blue', patternLineRow: 2 }, // row 3 (0-indexed = row index 2, pattern line 3)
    });

    // 2 blue should be on pattern line 3 (capacity 3)
    const patternLine = state.zones['player-0-pattern-line-3'].pieces;
    expect(patternLine.length).toBe(2);
    expect(patternLine.every(p => p.defId === 'blue')).toBe(true);

    // factory-0 should be empty
    expect(state.zones['factory-0'].pieces.length).toBe(0);

    // red and yellow should be in center
    const center = state.zones['center'].pieces;
    const centerColors = center.map(p => p.defId);
    expect(centerColors).toContain('red');
    expect(centerColors).toContain('yellow');

    // Player data updated
    const playerData = state.players[0].data as Record<string, unknown>;
    const patternLines = playerData.patternLines as Array<{ color: string | null; count: number }>;
    expect(patternLines[2].color).toBe('blue');
    expect(patternLines[2].count).toBe(2);
  });

  it('AZUL-01: picking from center leaves other colors in center', () => {
    const state = makeState(5, 2);
    state.zones['center'].pieces = [pid('red'), pid('red'), pid('blue')];
    const ctx = makeCtx(state);

    onMove(ctx, {
      playerId: 'player-0',
      action: 'pick-tiles',
      source: 'center',
      data: { color: 'red', patternLineRow: 0 },
    });

    // red goes to pattern line 1
    const pl1 = state.zones['player-0-pattern-line-1'].pieces;
    expect(pl1.length).toBe(1); // capacity 1, so 1 red placed
    expect(pl1[0].defId).toBe('red');

    // blue stays in center
    const center = state.zones['center'].pieces;
    expect(center.some(p => p.defId === 'blue')).toBe(true);
    // The other red (overflow) should go to floor
    const floor = state.zones['player-0-floor-line'].pieces;
    expect(floor.length).toBe(1);
    expect(floor[0].defId).toBe('red');
  });

  it('AZUL-05: first-player token taken when picking from center', () => {
    const state = makeState(5, 2);
    // Center has token (defId='first-player-token') and a red tile
    state.zones['center'].pieces = [
      { id: 'fpt', defId: 'first-player-token', zoneId: 'center' },
      pid('red'),
    ];
    const ctx = makeCtx(state);

    onMove(ctx, {
      playerId: 'player-0',
      action: 'pick-tiles',
      source: 'center',
      data: { color: 'red', patternLineRow: 0 },
    });

    // player-0 should have hasFirstPlayerToken = true
    const playerData = state.players[0].data as Record<string, unknown>;
    expect(playerData.hasFirstPlayerToken).toBe(true);

    // Token should be on floor line
    const floor = state.zones['player-0-floor-line'].pieces;
    expect(floor.some(p => p.defId === 'first-player-token')).toBe(true);
  });

  it('AZUL-05: floor line overflow goes to lid when floor exceeds 7', () => {
    const state = makeState(5, 2);
    // Floor already has 6 tiles
    const floorId = 'player-0-floor-line';
    state.zones[floorId].pieces = [
      pid('black'), pid('black'), pid('black'), pid('black'), pid('black'), pid('black'),
    ];
    (state.players[0].data as Record<string, unknown>).floorLine = Array(6).fill('black');

    // Pick 4 red tiles from factory — 0 fit on pattern line row 1 (capacity 1, placed 1, overflow 3)
    // Actually: 4 red tiles to pattern line row 1 (capacity 1) → 1 fits, 3 overflow to floor
    // Floor has 6, space for 1 more, so 1 goes to floor, 2 go to lid
    state.zones['factory-0'].pieces = [pid('red'), pid('red'), pid('red'), pid('red')];
    const ctx = makeCtx(state);

    onMove(ctx, {
      playerId: 'player-0',
      action: 'pick-tiles',
      source: 'factory-0',
      data: { color: 'red', patternLineRow: 0 }, // row 1, capacity 1
    });

    const floor = state.zones[floorId].pieces;
    expect(floor.length).toBeLessThanOrEqual(7);

    const lid = state.zones['lid'].pieces;
    expect(lid.length).toBeGreaterThan(0);
  });

  it('AZUL-05: last factory pick empties all sources → phase becomes wall-tiling', () => {
    const state = makeState(5, 2);
    // Only factory-0 has tiles, all others and center are empty
    state.zones['factory-0'].pieces = [pid('blue'), pid('red'), pid('yellow'), pid('black')];
    const ctx = makeCtx(state);

    // Pick all blue from factory-0 — rest go to center; center then has non-blue tiles
    // So after this move center is NOT empty → phase should NOT change
    // Let's instead pick blue and have no other tiles exist
    state.zones['factory-0'].pieces = [pid('blue')];

    onMove(ctx, {
      playerId: 'player-0',
      action: 'pick-tiles',
      source: 'factory-0',
      data: { color: 'blue', patternLineRow: 0 },
    });

    // Factory-0 empty, center empty → round over
    expect(state.phase).toBe('wall-tiling');
  });

  it('AZUL-01: turn advances to next player after move', () => {
    const state = makeState(5, 2);
    state.zones['factory-0'].pieces = [pid('blue'), pid('yellow')];
    // Add something to center so round doesn't end
    state.zones['center'].pieces = [pid('red')];
    const ctx = makeCtx(state);

    onMove(ctx, {
      playerId: 'player-0',
      action: 'pick-tiles',
      source: 'factory-0',
      data: { color: 'blue', patternLineRow: 0 },
    });

    expect(state.currentPlayerIndex).toBe(1);
  });

  it('AZUL-01: turn wraps around in 2-player game', () => {
    const state = makeState(5, 2);
    state.currentPlayerIndex = 1;
    state.zones['factory-0'].pieces = [pid('blue'), pid('yellow')];
    state.zones['center'].pieces = [pid('red')];
    const ctx = makeCtx(state);

    onMove(ctx, {
      playerId: 'player-1',
      action: 'pick-tiles',
      source: 'factory-0',
      data: { color: 'blue', patternLineRow: 1 },
    });

    expect(state.currentPlayerIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// onRoundEnd tests
// ---------------------------------------------------------------------------

describe('onRoundEnd', () => {
  beforeEach(() => {
    pieceCounter = 0;
  });

  it('AZUL-02: full pattern line tiles move to wall and pattern line is cleared', () => {
    const state = makeState(5, 2);
    // Player 0: row 1 (index 0) has 1 blue tile (capacity = 1 = full)
    (state.players[0].data as Record<string, unknown>).patternLines = [
      { color: 'blue', count: 1 },
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: null, count: 0 },
    ];
    state.zones['player-0-pattern-line-1'].pieces = [pid('blue')];
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Pattern line should be cleared
    const patternLines = (state.players[0].data as Record<string, unknown>).patternLines as Array<{ color: string | null; count: number }>;
    expect(patternLines[0].count).toBe(0);
    expect(patternLines[0].color).toBeNull();

    // Wall should have blue at row 0
    const wall = (state.players[0].data as Record<string, unknown>).wall as boolean[][];
    // Row 0 of WALL_PATTERN: [blue, yellow, red, black, white] → blue is at col 0
    expect(wall[0][0]).toBe(true);
  });

  it('AZUL-03: isolated wall tile scores 1 point', () => {
    const state = makeState(5, 2);
    // Place 1 blue in row 1 (full at count=1)
    (state.players[0].data as Record<string, unknown>).patternLines = [
      { color: 'blue', count: 1 },
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: null, count: 0 },
    ];
    state.zones['player-0-pattern-line-1'].pieces = [pid('blue')];
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    expect(state.players[0].score).toBe(1);
  });

  it('AZUL-03: adjacency scoring counts horizontal and vertical runs', () => {
    const state = makeState(5, 2);
    // Pre-place tiles on wall: row 0 has yellow (col 1) and red (col 2)
    // Now place blue (col 0) in row 0 → it touches yellow → hRun = 3? No:
    // blue at (0,0), yellow at (0,1) → hRun goes right: (0,0)→(0,1)=yellow ✓ → hRun=2; stop (0,2)=red ✓ → hRun=3
    // Actually row 0 WALL_PATTERN: [blue, yellow, red, black, white]
    // Let's use row 1 approach: pre-place blue at (0,0), place yellow at (0,1)
    // WALL_PATTERN row 0: blue=col0, yellow=col1, red=col2, black=col3, white=col4
    // Place yellow (row 1, capacity 2) with blue already at wall[0][0] + wall[1][0]
    // Then placing white (row 1 maps to... wait, row index 0 = pattern line 1)
    // Simpler: place yellow at wall position (0,1), which means row 0 col 1
    // But then we'd need to complete pattern line 1 with yellow — but blue is already at (0,0)
    // Let me use a direct scenario:
    // Wall row 2 has blue at (2,2) [row2: black=0,white=1,blue=2,yellow=3,red=4]
    // Wall row 3 has blue at (3,3) [row3: red=0,black=1,white=2,blue=3,yellow=4]
    // Now place blue in row 1 (pattern line 1, capacity 1):
    // Wall row 0: blue is at (0,0). No neighbors yet → score = 1
    //
    // Actually let's do: pre-place tiles so that when we tile row 3 (capacity 3)
    // with red, it has adjacency:
    // WALL_PATTERN row 2: [black, white, blue, yellow, red] → red at col 4
    // Place 3 red tiles in pattern line 3 (row index 2), tiles go to (2,4)
    // Pre-place on wall: (2,3)=yellow already, (1,4)=black already
    // Then score = hRun=2 (self + (2,3)? No, (2,3) is yellow not red)
    // Hmm, adjacency counts ALL adjacent tiles regardless of color.
    const wall = (state.players[0].data as Record<string, unknown>).wall as boolean[][];
    // Pre-place 2 tiles adjacent to where we'll place
    // We'll place blue in pattern line 2 (row index 1, capacity 2) → wall[1][?]
    // WALL_PATTERN row 1: [white, blue, yellow, red, black] → blue at col 1
    // Pre-place at wall[0][1] (yellow in row0) and wall[1][0] (white in row1) and wall[1][2] (yellow in row1)
    wall[0][1] = true; // above (0,1)
    wall[1][0] = true; // left of (1,1)
    wall[1][2] = true; // right of (1,1)

    (state.players[0].data as Record<string, unknown>).patternLines = [
      { color: null, count: 0 },
      { color: 'blue', count: 2 }, // full (capacity=2)
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: null, count: 0 },
    ];
    state.zones['player-0-pattern-line-2'].pieces = [pid('blue'), pid('blue')];
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Placed at (1,1): horizontal run = left(1,0) + self(1,1) + right(1,2) = 3
    // Vertical run = above(0,1) + self = 2
    // Score = 3 + 2 = 5
    expect(state.players[0].score).toBe(5);
  });

  it('AZUL-03: floor penalties applied correctly', () => {
    const state = makeState(5, 2);
    // Player 0 has 4 tiles on floor line
    (state.players[0].data as Record<string, unknown>).floorLine = ['blue', 'red', 'yellow', 'black'];
    state.players[0].score = 10;
    state.zones['player-0-floor-line'].pieces = [
      pid('blue'), pid('red'), pid('yellow'), pid('black'),
    ];
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Penalties: -1 + -1 + -2 + -2 = -6. Score: 10 - 6 = 4
    expect(state.players[0].score).toBe(4);
  });

  it('AZUL-03: score cannot go below 0', () => {
    const state = makeState(5, 2);
    // Player 0 has score 3 and heavy floor penalties
    state.players[0].score = 3;
    (state.players[0].data as Record<string, unknown>).floorLine = ['b', 'b', 'b', 'b', 'b', 'b'];
    state.zones['player-0-floor-line'].pieces = Array.from({ length: 6 }, () => pid('black'));
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Penalty: -1-1-2-2-2-3 = -11. 3 - 11 = -8 → clamped to 0
    expect(state.players[0].score).toBe(0);
  });

  it('AZUL-05: floor line cleared and tiles moved to lid after penalties', () => {
    const state = makeState(5, 2);
    // Add bag tiles so lid is not consumed for factory refill
    state.zones['bag'].pieces = Array.from({ length: 40 }, (_, i) =>
      makePiece(`bagx-${i}`, ['blue', 'red', 'yellow', 'black', 'white'][i % 5], 'bag')
    );
    state.zones['player-0-floor-line'].pieces = [pid('blue'), pid('red')];
    (state.players[0].data as Record<string, unknown>).floorLine = ['blue', 'red'];
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    expect(state.zones['player-0-floor-line'].pieces.length).toBe(0);
    // Lid should contain the floor tiles (blue and red from player-0)
    const lidDefIds = state.zones['lid'].pieces.map(p => p.defId);
    expect(lidDefIds).toContain('blue');
    expect(lidDefIds).toContain('red');
  });

  it('AZUL-02: incomplete pattern line tiles stay (not moved to wall)', () => {
    const state = makeState(5, 2);
    // Row 3 (index 2, capacity 3) has only 2 tiles — not full
    (state.players[0].data as Record<string, unknown>).patternLines = [
      { color: null, count: 0 },
      { color: null, count: 0 },
      { color: 'red', count: 2 },
      { color: null, count: 0 },
      { color: null, count: 0 },
    ];
    state.zones['player-0-pattern-line-3'].pieces = [pid('red'), pid('red')];
    const initialScore = state.players[0].score;
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Score should not change (no wall tiling happened)
    expect(state.players[0].score).toBe(initialScore);
    // Pattern line still has tiles
    const patternLines = (state.players[0].data as Record<string, unknown>).patternLines as Array<{ color: string | null; count: number }>;
    expect(patternLines[2].count).toBe(2);
  });

  it('AZUL-03: end-game bonuses — complete row +2, complete column +7, all of one color +10', () => {
    const state = makeState(5, 2);
    // Give player-0 a complete row 0 (triggering game end)
    const wall = (state.players[0].data as Record<string, unknown>).wall as boolean[][];
    // Complete row 0: all 5 cells true
    wall[0] = [true, true, true, true, true];
    // Also give a complete column 0
    wall[1][0] = true;
    wall[2][0] = true;
    wall[3][0] = true;
    wall[4][0] = true;
    // All of 'blue': WALL_PATTERN blue positions: (0,0),(1,1),(2,2),(3,3),(4,4)
    wall[1][1] = true;
    wall[2][2] = true;
    wall[3][3] = true;
    wall[4][4] = true;
    // Score before bonuses
    state.players[0].score = 20;
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Game should be finished
    expect(state.finished).toBe(true);
    // Bonuses: 1 complete row = +2, 1 complete column = +7, 1 full color set (blue) = +10 → +19
    expect(state.players[0].score).toBe(39);
  });

  it('AZUL-03: tiebreak — most complete horizontal rows wins', () => {
    const state = makeState(5, 2);
    // Player 0: 2 complete rows, score 45
    // Player 1: 1 complete row, score 45
    const wall0 = (state.players[0].data as Record<string, unknown>).wall as boolean[][];
    wall0[0] = [true, true, true, true, true];
    wall0[1] = [true, true, true, true, true];
    state.players[0].score = 45;

    const wall1 = (state.players[1].data as Record<string, unknown>).wall as boolean[][];
    wall1[0] = [true, true, true, true, true];
    state.players[1].score = 45;

    const ctx = makeCtx(state);
    onRoundEnd(ctx);

    expect(state.finished).toBe(true);
    expect(state.winnerId).toBe('player-0'); // player-0 has more complete rows
  });

  it('AZUL-05: factories refilled from bag when game continues', () => {
    const state = makeState(5, 2);
    // Bag has enough tiles (100 tiles normally, add 20 here for a round)
    const bagPieces = Array.from({ length: 50 }, (_, i) =>
      makePiece(`bag-${i}`, ['blue', 'red', 'yellow', 'black', 'white'][i % 5], 'bag')
    );
    state.zones['bag'].pieces = bagPieces;
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Each factory should have 4 tiles
    for (let i = 0; i < 5; i++) {
      expect(state.zones[`factory-${i}`].pieces.length).toBe(4);
    }
    // Phase should be back to factory-offer
    expect(state.phase).toBe('factory-offer');
  });

  it('AZUL-05: bag empty — lid shuffled into bag for factory refill', () => {
    const state = makeState(5, 2);
    // Bag is empty, lid has tiles
    state.zones['bag'].pieces = [];
    const lidPieces = Array.from({ length: 40 }, (_, i) =>
      makePiece(`lid-${i}`, ['blue', 'red', 'yellow', 'black', 'white'][i % 5], 'lid')
    );
    state.zones['lid'].pieces = lidPieces;
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Factories should be filled (bag got refilled from lid)
    const totalFactoryTiles = Array.from({ length: 5 }, (_, i) =>
      state.zones[`factory-${i}`].pieces.length
    ).reduce((a, b) => a + b, 0);
    expect(totalFactoryTiles).toBe(20);
  });

  it('AZUL-05: first-player token placed in center for next round', () => {
    const state = makeState(5, 2);
    state.zones['bag'].pieces = Array.from({ length: 40 }, (_, i) =>
      makePiece(`b${i}`, ['blue', 'red', 'yellow', 'black', 'white'][i % 5], 'bag')
    );
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // Center should have the first-player token
    const center = state.zones['center'].pieces;
    expect(center.some(p => p.defId === 'first-player-token')).toBe(true);
  });

  it('AZUL-05: player with first-player token starts next round', () => {
    const state = makeState(5, 2);
    state.zones['bag'].pieces = Array.from({ length: 40 }, (_, i) =>
      makePiece(`b${i}`, ['blue', 'red', 'yellow', 'black', 'white'][i % 5], 'bag')
    );
    // Player 1 has first-player token from last round
    (state.players[1].data as Record<string, unknown>).hasFirstPlayerToken = true;
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    expect(state.currentPlayerIndex).toBe(1);
  });

  it('AZUL-03: floor line penalty follows -1/-1/-2/-2/-2/-3/-3 progression', () => {
    const state = makeState(5, 2);
    // Full 7-tile floor line
    state.zones['player-0-floor-line'].pieces = Array.from({ length: 7 }, () => pid('black'));
    (state.players[0].data as Record<string, unknown>).floorLine = Array(7).fill('black');
    state.players[0].score = 30;
    const ctx = makeCtx(state);

    onRoundEnd(ctx);

    // -1-1-2-2-2-3-3 = -14. 30 - 14 = 16
    expect(state.players[0].score).toBe(16);
  });
});
