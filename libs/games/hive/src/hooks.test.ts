/**
 * Unit tests for Hive hooks.
 * Tests: placement rules, movement rules (all 5 pieces), One Hive Rule,
 * Freedom-to-Move (sliding), Beetle stacking, win condition.
 *
 * Uses hex utilities from hex.ts for test helpers.
 */
import { describe, it, expect } from 'vitest';
import { hexKey, hexNeighbors, isConnectedWithout, canSlide } from './hex.js';
import { getValidMoves, onMove, onRoundEnd } from './hooks.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal game state for testing */
function createTestState(
  boardPieces: any[] = [],
  hands: [any[], any[]] = [[], []],
  currentPlayerIndex: number = 0
) {
  return {
    id: 'test',
    gameId: 'hive',
    version: 0,
    phase: 'playing',
    currentPlayerIndex,
    players: [
      { id: 'player-0', name: 'Alice', score: 0, data: { queenPlaced: false, turnNumber: 0 } },
      { id: 'player-1', name: 'Bob', score: 0, data: { queenPlaced: false, turnNumber: 0 } },
    ],
    zones: {
      board: { id: 'board', pieces: boardPieces },
      'player-0-hand': { id: 'player-0-hand', pieces: hands[0] },
      'player-1-hand': { id: 'player-1-hand', pieces: hands[1] },
    },
    round: 1,
    finished: false,
    winnerId: undefined as string | undefined,
  };
}

/** Create a board piece */
function boardPiece(id: string, defId: string, q: number, r: number, owner: number, stackLevel = 0) {
  return { id, defId, zoneId: 'board', state: { q, r, stackLevel, owner } };
}

/** Create a hand piece */
function handPiece(id: string, defId: string, playerIndex: number) {
  return { id, defId, zoneId: `player-${playerIndex}-hand`, state: { owner: playerIndex } };
}

/** Full starting hand for a player (11 pieces) */
function fullHand(playerIndex: number): any[] {
  const i = playerIndex;
  return [
    handPiece(`p${i}-queen-0`, 'queen-bee', i),
    handPiece(`p${i}-beetle-0`, 'beetle', i),
    handPiece(`p${i}-beetle-1`, 'beetle', i),
    handPiece(`p${i}-grasshopper-0`, 'grasshopper', i),
    handPiece(`p${i}-grasshopper-1`, 'grasshopper', i),
    handPiece(`p${i}-grasshopper-2`, 'grasshopper', i),
    handPiece(`p${i}-spider-0`, 'spider', i),
    handPiece(`p${i}-spider-1`, 'spider', i),
    handPiece(`p${i}-ant-0`, 'soldier-ant', i),
    handPiece(`p${i}-ant-1`, 'soldier-ant', i),
    handPiece(`p${i}-ant-2`, 'soldier-ant', i),
  ];
}

/** Build hook context from a state */
function ctx(state: any) {
  return {
    state,
    currentPlayer: `player-${state.currentPlayerIndex}`,
    round: state.round,
    players: state.players,
  };
}

/** Helper to extract all unique target positions from valid placement moves */
function placementTargets(moves: any[]): string[] {
  // We can extract from descriptions: "Place queen-bee at (0,0)"
  const coords = new Set<string>();
  for (const m of moves) {
    if (m.action === 'place' && m.description) {
      const match = m.description.match(/\((-?\d+),(-?\d+)\)/);
      if (match) {
        coords.add(`${match[1]},${match[2]}`);
      }
    }
  }
  return Array.from(coords);
}

/** Helper to extract movement targets from valid moves */
function moveTargets(moves: any[], pieceId: string): string[] {
  const coords = new Set<string>();
  for (const m of moves) {
    if (m.action === 'move' && m.pieceId === pieceId && m.description) {
      const match = m.description.match(/\((-?\d+),(-?\d+)\)/);
      if (match) {
        coords.add(`${match[1]},${match[2]}`);
      }
    }
  }
  return Array.from(coords);
}

// ---------------------------------------------------------------------------
// Hex utility tests
// ---------------------------------------------------------------------------

describe('Hex utilities', () => {
  it('hexKey creates correct string key', () => {
    expect(hexKey(0, 0)).toBe('0,0');
    expect(hexKey(1, -1)).toBe('1,-1');
    expect(hexKey(-3, 2)).toBe('-3,2');
  });

  it('hexNeighbors returns 6 neighbors for (0,0)', () => {
    const neighbors = hexNeighbors(0, 0);
    expect(neighbors).toHaveLength(6);
    const keys = neighbors.map(n => hexKey(n.q, n.r));
    expect(keys).toContain('1,0');
    expect(keys).toContain('1,-1');
    expect(keys).toContain('0,-1');
    expect(keys).toContain('-1,0');
    expect(keys).toContain('-1,1');
    expect(keys).toContain('0,1');
  });

  it('isConnectedWithout returns true for empty or single-element set', () => {
    const empty = new Set<string>([]);
    const single = new Set<string>(['0,0']);
    // The hex.ts version takes a Set<string>, not an object
    expect(isConnectedWithout(empty, '0,0')).toBe(true);
    expect(isConnectedWithout(single, '0,0')).toBe(true);
  });

  it('isConnectedWithout returns true for connected chain', () => {
    // Chain: 0,0 - 1,0 - 2,0
    const occupied = new Set<string>(['0,0', '1,0', '2,0']);
    // Removing middle piece should disconnect
    expect(isConnectedWithout(occupied, '1,0')).toBe(false);
    // Removing end piece leaves connected chain
    expect(isConnectedWithout(occupied, '2,0')).toBe(true);
  });

  it('canSlide returns false when both common neighbors are occupied (gate blocked)', () => {
    // Sliding from (0,0) to (1,0): common neighbors are (1,-1) and (0,1)
    // If both are occupied, cannot slide
    const blocked = new Set<string>(['1,-1', '0,1']); // both common neighbors
    expect(canSlide(blocked, 0, 0, 1, 0)).toBe(false);
  });

  it('canSlide returns true when only one common neighbor is occupied', () => {
    const halfBlocked = new Set<string>(['1,-1']); // only one side
    expect(canSlide(halfBlocked, 0, 0, 1, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A. Placement rule tests
// ---------------------------------------------------------------------------

describe('Hive - Placement rules', () => {
  it('First move: only valid move is to place at (0,0)', () => {
    const state = createTestState([], [fullHand(0), fullHand(1)], 0);
    const moves = getValidMoves(ctx(state));
    const placeMoves = moves.filter(m => m.action === 'place');
    expect(placeMoves.length).toBeGreaterThan(0);

    const targets = placementTargets(placeMoves);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe('0,0');
  });

  it('Second move (player 1): must place adjacent to first piece at (0,0)', () => {
    const board = [boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0)];
    const state = createTestState(board, [
      // player 0 hand empty (already placed queen)
      [],
      fullHand(1),
    ], 1);
    // Mark player 0 as having placed queen
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 1;

    const moves = getValidMoves(ctx(state));
    const placeMoves = moves.filter(m => m.action === 'place');
    const targets = placementTargets(placeMoves);

    // All 6 neighbors of (0,0) should be valid
    expect(targets).toHaveLength(6);
    const neighborKeys = hexNeighbors(0, 0).map(n => hexKey(n.q, n.r));
    for (const nk of neighborKeys) {
      expect(targets).toContain(nk);
    }
  });

  it('Placement cannot touch enemy pieces (color adjacency rule)', () => {
    // Player 0 has piece at (0,0), Player 1 has piece at (1,0)
    // Player 0 placing turn 2: can only place adjacent to (0,0) but not adjacent to (1,0)
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
    ];
    const hands: [any[], any[]] = [
      [handPiece('p0-beetle-0', 'beetle', 0)], // player 0 has a beetle
      [handPiece('p1-beetle-0', 'beetle', 1)], // player 1 has a beetle
    ];
    const state = createTestState(board, hands, 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 1;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 1;

    const moves = getValidMoves(ctx(state));
    const placeMoves = moves.filter(m => m.action === 'place');
    const targets = placementTargets(placeMoves);

    // Valid placements for player 0: adjacent to (0,0) but NOT adjacent to (1,0)
    // Neighbor of (0,0) AND not neighbor of (1,0):
    //   Neighbors of (0,0): (1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1)
    //   (1,0) is occupied so skip it
    //   Neighbors of (1,0): (2,0),(2,-1),(1,-1),(0,0),(0,1),(1,1)
    //   So cells adjacent to (0,0) that are NOT adjacent to (1,0):
    //     (0,-1) — not in neighbors of (1,0) — VALID
    //     (-1,0) — not in neighbors of (1,0) — VALID
    //     (-1,1) — not in neighbors of (1,0) — VALID
    //   Excluded: (1,-1) adjacent to both, (0,1) adjacent to (1,0), (1,0) occupied
    for (const t of targets) {
      expect(['0,-1', '-1,0', '-1,1']).toContain(t);
    }
    expect(targets.length).toBe(3);
  });

  it('Queen must be placed by turn 4: only queen placements on turn 4', () => {
    // Player 0 has not placed queen yet, turnNumber = 3 (about to be 4th turn, 0-indexed)
    const board = [
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
      boardPiece('p0-beetle-0', 'beetle', -1, 0, 0),
      boardPiece('p0-beetle-1', 'beetle', -2, 0, 0),
      boardPiece('p1-beetle-0', 'beetle', 2, 0, 1),
    ];
    const hands: [any[], any[]] = [
      [
        handPiece('p0-queen-0', 'queen-bee', 0),
        handPiece('p0-grasshopper-0', 'grasshopper', 0),
        handPiece('p0-spider-0', 'spider', 0),
      ],
      [],
    ];
    const state = createTestState(board, hands, 0);
    state.players[0].data.queenPlaced = false;
    state.players[0].data.turnNumber = 3; // 0-indexed turn 3 = 4th turn
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 3;

    const moves = getValidMoves(ctx(state));
    const placeMoves = moves.filter(m => m.action === 'place');

    // Only queen should be placeable
    const nonQueenPlacements = placeMoves.filter(m => {
      const piece = hands[0].find((p: any) => p.id === m.pieceId);
      return piece && piece.defId !== 'queen-bee';
    });
    expect(nonQueenPlacements).toHaveLength(0);

    // All placement moves should be queen
    for (const m of placeMoves) {
      const piece = hands[0].find((p: any) => p.id === m.pieceId);
      expect(piece?.defId).toBe('queen-bee');
    }
  });
});

// ---------------------------------------------------------------------------
// B. Movement rule tests
// ---------------------------------------------------------------------------

describe('Hive - Movement rules', () => {
  it('Cannot move any piece until own queen is placed', () => {
    // Player 0 has pieces on board but queen not placed
    const board = [
      boardPiece('p0-beetle-0', 'beetle', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
      boardPiece('p1-beetle-0', 'beetle', 2, 0, 1),
    ];
    const hands: [any[], any[]] = [
      [handPiece('p0-queen-0', 'queen-bee', 0), handPiece('p0-ant-0', 'soldier-ant', 0)],
      [],
    ];
    const state = createTestState(board, hands, 0);
    state.players[0].data.queenPlaced = false;
    state.players[0].data.turnNumber = 1;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 2;

    const moves = getValidMoves(ctx(state));
    const moveMoves = moves.filter(m => m.action === 'move');
    expect(moveMoves).toHaveLength(0);
  });

  it('Queen Bee moves exactly 1 space with sliding constraint', () => {
    // Queen at (0,0), beetle at (1,0) — single neighbor on right
    // Queen can slide to adjacent empty hexes
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 1;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 1;

    const moves = getValidMoves(ctx(state));
    const queenMoves = moves.filter(m => m.action === 'move' && m.pieceId === 'p0-queen-0');
    const targets = moveTargets(moves, 'p0-queen-0');

    // Valid moves: adjacent to (0,0) that are empty AND adjacent to (1,0) (staying connected)
    //   (1,-1) and (0,1) are adjacent to both (0,0) and (1,0)
    //   Cannot go to (-1,0), (-1,1), (0,-1) because those would disconnect from (1,0)
    expect(targets).toContain('1,-1');
    expect(targets).toContain('0,1');
    // Should NOT include isolated hexes
    expect(targets).not.toContain('-1,0');
    expect(targets.length).toBe(2);
  });

  it('Grasshopper jumps over at least 1 piece in straight line', () => {
    // Grasshopper at (1,0), blocker at (2,0), empty at (3,0)
    // Also queen at (0,0) to keep hive connected but NOT make grasshopper a hinge
    // Chain: p0-queen (0,0) -- p0-grasshopper (1,0) -- p1-queen (2,0)
    // Removing grasshopper at (1,0) disconnects (0,0) from (2,0) — BUT grasshopper moves are jumps, not slides
    // Actually we need grasshopper to NOT be the hinge
    // Use a T-shaped hive: p0-queen at (0,0), p0-grasshopper at (1,0), p1-queen at (2,0), p1-ant at (2,-1)
    // Removing grasshopper: (0,0) disconnects from (2,0)+(2,-1) — still a hinge
    // Solution: give grasshopper a non-hinge position
    // Place: p0-queen (0,0), p1-queen (1,0), p1-ant (2,0), p0-grasshopper (0,1)
    // Removing grasshopper at (0,1): remaining (0,0),(1,0),(2,0) stay connected — NOT a hinge
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
      boardPiece('p1-ant-0', 'soldier-ant', 2, 0, 1),
      boardPiece('p0-grasshopper-0', 'grasshopper', 0, 1, 0), // adjacent to p0-queen, non-hinge
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 2;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 2;

    const moves = getValidMoves(ctx(state));
    const hopTargets = moveTargets(moves, 'p0-grasshopper-0');

    // Grasshopper at (0,1), direction q+1 = (1,1): empty, no jump
    // Direction q-1 = (-1,1): empty, no jump
    // Direction r-1 = (0,0): occupied by p0-queen! Continue: (0,-1) empty — valid jump
    expect(hopTargets).toContain('0,-1');
    // Grasshopper must have at least one valid jump
    expect(hopTargets.length).toBeGreaterThan(0);
  });

  it('Grasshopper cannot move to adjacent empty hex (must jump over at least 1 piece)', () => {
    // Use same non-hinge setup as previous test
    // Grasshopper at (0,1), adjacent to p0-queen at (0,0)
    // The only jump direction is towards (0,0) [occupied] then (0,-1)
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
      boardPiece('p1-ant-0', 'soldier-ant', 2, 0, 1),
      boardPiece('p0-grasshopper-0', 'grasshopper', 0, 1, 0),
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 2;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 2;

    const moves = getValidMoves(ctx(state));
    const hopTargets = moveTargets(moves, 'p0-grasshopper-0');

    // Empty adjacent hexes should NOT be valid targets (grasshopper must jump over occupied hex)
    // (1,1), (-1,1), (-1,2), (0,2), (1,0) is occupied — no jump there
    // Direct adjacent empties:
    expect(hopTargets).not.toContain('1,1');
    expect(hopTargets).not.toContain('-1,1');
    expect(hopTargets).not.toContain('-1,2');
    expect(hopTargets).not.toContain('0,2');
    // Valid jump: over (0,0) to (0,-1)
    expect(hopTargets).toContain('0,-1');
  });

  it('Beetle can climb onto adjacent occupied hex', () => {
    // Beetle at (0,1), queen at (0,0), enemy queen at (1,0), enemy ant at (2,0)
    // Beetle at (0,1) is NOT a hinge (removing it leaves (0,0),(1,0),(2,0) connected)
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
      boardPiece('p1-ant-0', 'soldier-ant', 2, 0, 1),
      boardPiece('p0-beetle-0', 'beetle', 0, 1, 0), // non-hinge position
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 2;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 2;

    const moves = getValidMoves(ctx(state));
    const beetleTargets = moveTargets(moves, 'p0-beetle-0');

    // Beetle at (0,1) can climb onto (0,0) which is occupied by p0-queen
    expect(beetleTargets).toContain('0,0');
    // Also can climb onto (1,0) which is adjacent and occupied by p1-queen
    // (1,0) IS adjacent to (0,1)? Let's check: neighbors of (0,1) include...
    // HEX_DIRECTIONS: {q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}
    // From (0,1): (1,1),(1,0),(0,0),(-1,1),(-1,2),(0,2)
    // YES, (1,0) is adjacent to (0,1)
    expect(beetleTargets).toContain('1,0');
  });

  it('Soldier Ant can reach any connected empty hex', () => {
    // Simple 3-piece chain: p0-queen at (-1,0), p1-queen at (0,0), p0-ant at (1,0)
    // Ant at (1,0) should be able to reach many hexes along the perimeter
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', -1, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 0, 0, 1),
      boardPiece('p0-ant-0', 'soldier-ant', 1, 0, 0),
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 2;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 1;

    const moves = getValidMoves(ctx(state));
    const antTargets = moveTargets(moves, 'p0-ant-0');

    // The ant has many reachable positions along the hive perimeter
    expect(antTargets.length).toBeGreaterThan(3);
    // Should include neighbors of p0-queen and p1-queen that are empty
    expect(antTargets).toContain('-1,-1'); // or similar adjacent empty hex
  });

  it('Spider moves exactly 3 spaces along hive perimeter', () => {
    // Build a small hive: chain of 4 pieces
    // p1-queen at (-2,0), p0-queen at (-1,0), p1-ant at (0,0), p0-spider at (1,0)
    const board = [
      boardPiece('p1-queen-0', 'queen-bee', -2, 0, 1),
      boardPiece('p0-queen-0', 'queen-bee', -1, 0, 0),
      boardPiece('p1-ant-0', 'soldier-ant', 0, 0, 1),
      boardPiece('p0-spider-0', 'spider', 1, 0, 0),
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 2;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 2;

    const moves = getValidMoves(ctx(state));
    const spiderTargets = moveTargets(moves, 'p0-spider-0');

    // Spider starts at (1,0), must move exactly 3 steps along hive perimeter
    // None of the starting hex should appear as destination
    expect(spiderTargets).not.toContain('1,0');
    // Spider should have valid destinations (exactly 3 steps away along the hive)
    // This tests that spider moves exist
    expect(spiderTargets.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// C. One Hive Rule tests
// ---------------------------------------------------------------------------

describe('Hive - One Hive Rule', () => {
  it('Piece that would disconnect hive cannot be moved', () => {
    // Linear chain: A-B-C where B is current player's piece
    // Removing B disconnects A from C
    const board = [
      boardPiece('p0-ant-0', 'soldier-ant', -1, 0, 0), // A (to be removed to test)
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),  // B — hinge piece
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),  // C
      boardPiece('p1-ant-0', 'soldier-ant', 2, 0, 1),  // extend chain
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 2;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 2;

    const moves = getValidMoves(ctx(state));
    // p0-queen at (0,0) is the hinge — removing it disconnects p0-ant from p1-queen+p1-ant
    const queenMoves = moves.filter(m => m.action === 'move' && m.pieceId === 'p0-queen-0');
    expect(queenMoves).toHaveLength(0);
  });

  it('Non-hinge piece at the end of hive can move', () => {
    // Chain: A-B-C where A is an endpoint (not a hinge)
    const board = [
      boardPiece('p0-ant-0', 'soldier-ant', 0, 0, 0),  // A — endpoint
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),  // B
      boardPiece('p0-queen-0', 'queen-bee', 2, 0, 0),  // C — endpoint of other player
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 1;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 1;

    const moves = getValidMoves(ctx(state));
    // p0-ant at (0,0) is an endpoint — removing it does not disconnect the hive
    const antMoves = moves.filter(m => m.action === 'move' && m.pieceId === 'p0-ant-0');
    expect(antMoves.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// D. Freedom-to-Move (sliding constraint) tests
// ---------------------------------------------------------------------------

describe('Hive - Freedom-to-Move', () => {
  it('Queen cannot slide through a gate (two pieces blocking the gap)', () => {
    // Queen at (0,0), with pieces at (1,-1) and (0,1) — both sides of the path to (1,0)
    // Also piece at (1,0) is empty, but gate is blocked by pieces at the two common neighbors
    // Additionally need pieces connected to the hive
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-beetle-0', 'beetle', 1, -1, 1),   // gate piece 1
      boardPiece('p1-beetle-1', 'beetle', 0, 1, 1),    // gate piece 2
      boardPiece('p1-queen-0', 'queen-bee', 2, 0, 1),  // extra piece to keep hive
      boardPiece('p1-ant-0', 'soldier-ant', 1, 1, 1),  // extra piece to keep hive
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[0].data.turnNumber = 1;
    state.players[1].data.queenPlaced = true;
    state.players[1].data.turnNumber = 4;

    const moves = getValidMoves(ctx(state));
    const queenTargets = moveTargets(moves, 'p0-queen-0');

    // (1,0) should NOT be reachable because (1,-1) and (0,1) form a gate
    expect(queenTargets).not.toContain('1,0');
  });
});

// ---------------------------------------------------------------------------
// E. Win condition tests
// ---------------------------------------------------------------------------

describe('Hive - Win condition', () => {
  it('Game ends when a queen is completely surrounded (all 6 neighbors occupied)', () => {
    // Build state where player 0 queen is about to be surrounded
    // Queen at (0,0), surrounded on 5 sides, player 1 places last piece
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-a', 'beetle', 1, 0, 1),   // neighbor 1
      boardPiece('p1-b', 'beetle', 1, -1, 1),  // neighbor 2
      boardPiece('p1-c', 'beetle', 0, -1, 1),  // neighbor 3
      boardPiece('p1-d', 'beetle', -1, 0, 1),  // neighbor 4
      boardPiece('p1-e', 'beetle', -1, 1, 1),  // neighbor 5
      boardPiece('p1-queen-0', 'queen-bee', 0, 1, 1), // not yet at 6th position
    ];
    // Player 1 has one piece that can complete the surround
    const hands: [any[], any[]] = [
      [],
      [handPiece('p1-ant-0', 'soldier-ant', 1)],
    ];
    const state = createTestState(board, hands, 1);
    state.players[0].data.queenPlaced = true;
    state.players[1].data.queenPlaced = true;

    // Apply a move that surrounds the queen at (0,0)
    // Move p1-queen-0 from (0,1) to somewhere else won't surround,
    // but we need to trigger it via onMove
    // Instead, let's set up a state where onMove triggers the win
    // Move p1-queen-0 to actually form the 6th surrounding
    // Let's construct this directly: queen at (0,0), 5 pieces at positions,
    // move the 6th piece into place

    // Use a simpler setup: construct state where after onMove, queen is surrounded
    const board2 = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-a', 'beetle', 1, 0, 1),
      boardPiece('p1-b', 'beetle', 1, -1, 1),
      boardPiece('p1-c', 'beetle', 0, -1, 1),
      boardPiece('p1-d', 'beetle', -1, 0, 1),
      boardPiece('p1-e', 'beetle', -1, 1, 1),
      // 6th neighbor (0,1) is currently empty
      boardPiece('p1-queen-0', 'queen-bee', 2, 0, 1), // queen somewhere else
      boardPiece('p1-ant-0', 'soldier-ant', 3, 0, 1), // piece that will move to (0,1)
    ];
    const state2 = createTestState(board2, [[], []], 1);
    state2.players[0].data.queenPlaced = true;
    state2.players[1].data.queenPlaced = true;
    state2.players[1].data.turnNumber = 5;

    const move = {
      playerId: 'player-1',
      action: 'move',
      source: 'board',
      target: 'board',
      pieceId: 'p1-ant-0',
      data: { q: 0, r: 1 }, // move ant to (0,1) — the 6th surrounding position
    };

    onMove(ctx(state2) as any, move as any);

    expect(state2.finished).toBe(true);
    expect(state2.winnerId).toBe('player-1');
  });

  it('Winner score is set to 1 when game ends', () => {
    // Surround player 0 queen
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-a', 'beetle', 1, 0, 1),
      boardPiece('p1-b', 'beetle', 1, -1, 1),
      boardPiece('p1-c', 'beetle', 0, -1, 1),
      boardPiece('p1-d', 'beetle', -1, 0, 1),
      boardPiece('p1-e', 'beetle', -1, 1, 1),
      boardPiece('p1-queen-0', 'queen-bee', 2, 0, 1),
      boardPiece('p1-ant-0', 'soldier-ant', 3, 0, 1),
    ];
    const state = createTestState(board, [[], []], 1);
    state.players[0].data.queenPlaced = true;
    state.players[1].data.queenPlaced = true;

    onMove(ctx(state) as any, {
      playerId: 'player-1',
      action: 'move',
      source: 'board',
      target: 'board',
      pieceId: 'p1-ant-0',
      data: { q: 0, r: 1 },
    } as any);

    expect(state.players[1].score).toBe(1);
    expect(state.players[0].score).toBe(0);
  });

  it('Turn advances after each move (non-game-ending)', () => {
    const board = [
      boardPiece('p0-queen-0', 'queen-bee', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 2, 0, 1),
      boardPiece('p0-ant-0', 'soldier-ant', 1, 0, 0),
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[1].data.queenPlaced = true;

    expect(state.currentPlayerIndex).toBe(0);
    onMove(ctx(state) as any, {
      playerId: 'player-0',
      action: 'move',
      source: 'board',
      target: 'board',
      pieceId: 'p0-ant-0',
      data: { q: 3, r: 0 }, // move ant adjacent to p1-queen
    } as any);

    expect(state.currentPlayerIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// F. Beetle stacking tests
// ---------------------------------------------------------------------------

describe('Hive - Beetle stacking', () => {
  it('Beetle climbs onto adjacent piece, stack level increments', () => {
    const board = [
      boardPiece('p0-beetle-0', 'beetle', 0, 0, 0),
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
      boardPiece('p0-queen-0', 'queen-bee', -1, 0, 0), // keep hive connected
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[1].data.queenPlaced = true;

    onMove(ctx(state) as any, {
      playerId: 'player-0',
      action: 'move',
      source: 'board',
      target: 'board',
      pieceId: 'p0-beetle-0',
      data: { q: 1, r: 0 }, // climb onto p1-queen
    } as any);

    const beetle = state.zones.board.pieces.find((p: any) => p.id === 'p0-beetle-0');
    expect(beetle?.state.q).toBe(1);
    expect(beetle?.state.r).toBe(0);
    expect(beetle?.state.stackLevel).toBe(1); // climbed on top
  });

  it('Beetle on stack can move off (stack level returns to 0)', () => {
    // Beetle already on top of queen at (1,0)
    const board = [
      boardPiece('p1-queen-0', 'queen-bee', 1, 0, 1),
      boardPiece('p0-beetle-0', 'beetle', 1, 0, 0, 1), // beetle on top of queen
      boardPiece('p0-queen-0', 'queen-bee', -1, 0, 0),
      boardPiece('p1-ant-0', 'soldier-ant', 2, 0, 1),
    ];
    const state = createTestState(board, [[], []], 0);
    state.players[0].data.queenPlaced = true;
    state.players[1].data.queenPlaced = true;

    onMove(ctx(state) as any, {
      playerId: 'player-0',
      action: 'move',
      source: 'board',
      target: 'board',
      pieceId: 'p0-beetle-0',
      data: { q: 0, r: 0 }, // move beetle to empty hex (adjacent)
    } as any);

    const beetle = state.zones.board.pieces.find((p: any) => p.id === 'p0-beetle-0');
    expect(beetle?.state.q).toBe(0);
    expect(beetle?.state.r).toBe(0);
    expect(beetle?.state.stackLevel).toBe(0); // back at ground level
  });
});

// ---------------------------------------------------------------------------
// G. onMove placement tests
// ---------------------------------------------------------------------------

describe('Hive - onMove placement', () => {
  it('Placing first piece removes it from hand and adds to board at (0,0)', () => {
    const hands: [any[], any[]] = [fullHand(0), fullHand(1)];
    const state = createTestState([], hands, 0);

    const initialHandSize = state.zones['player-0-hand'].pieces.length;
    onMove(ctx(state) as any, {
      playerId: 'player-0',
      action: 'place',
      source: 'player-0-hand',
      target: 'board',
      pieceId: 'p0-queen-0',
      data: { q: 0, r: 0 },
    } as any);

    expect(state.zones['player-0-hand'].pieces.length).toBe(initialHandSize - 1);
    expect(state.zones.board.pieces.length).toBe(1);
    const placed = state.zones.board.pieces[0];
    expect(placed.id).toBe('p0-queen-0');
    expect(placed.state.q).toBe(0);
    expect(placed.state.r).toBe(0);
  });

  it('Placing queen sets queenPlaced to true on player data', () => {
    const hands: [any[], any[]] = [[handPiece('p0-queen-0', 'queen-bee', 0)], []];
    const state = createTestState([], hands, 0);

    expect((state.players[0].data as any).queenPlaced).toBe(false);
    onMove(ctx(state) as any, {
      playerId: 'player-0',
      action: 'place',
      source: 'player-0-hand',
      target: 'board',
      pieceId: 'p0-queen-0',
      data: { q: 0, r: 0 },
    } as any);

    expect((state.players[0].data as any).queenPlaced).toBe(true);
  });

  it('Turn number increments after placing a piece', () => {
    const hands: [any[], any[]] = [[handPiece('p0-queen-0', 'queen-bee', 0)], []];
    const state = createTestState([], hands, 0);

    expect((state.players[0].data as any).turnNumber).toBe(0);
    onMove(ctx(state) as any, {
      playerId: 'player-0',
      action: 'place',
      source: 'player-0-hand',
      target: 'board',
      pieceId: 'p0-queen-0',
      data: { q: 0, r: 0 },
    } as any);

    expect((state.players[0].data as any).turnNumber).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// H. onRoundEnd tests
// ---------------------------------------------------------------------------

describe('Hive - onRoundEnd', () => {
  it('onRoundEnd is a no-op (Hive has no discrete rounds)', () => {
    const state = createTestState([], [[], []], 0);
    const before = JSON.stringify(state);
    onRoundEnd(ctx(state) as any);
    const after = JSON.stringify(state);
    expect(before).toBe(after);
  });
});
