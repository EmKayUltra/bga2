/**
 * Piece primitive tests.
 *
 * Covers Piece class behavior and PieceFactory instance creation.
 */
import { describe, it, expect } from 'vitest';
import { Piece } from '../Piece.js';
import { PieceFactory } from '../PieceFactory.js';
import type { PieceDef } from '@bga2/shared-types';

const blueDef: PieceDef = {
  id: 'tile-blue',
  type: 'tile',
  fallback: { shape: 'square', color: '#4A90D9', label: 'B' },
  properties: { color: 'blue' },
};

const tokenDef: PieceDef = {
  id: 'first-player-token',
  type: 'token',
  fallback: { shape: 'circle', color: '#FFFFFF', label: '1' },
};

// ─── Piece class ──────────────────────────────────────────────────────────────

describe('Piece', () => {
  it('Test 1: stores defId, zoneId, ownerId, and arbitrary state properties', () => {
    const piece = new Piece('tile-blue-0', blueDef, 'bag', 'player-1');
    expect(piece.id).toBe('tile-blue-0');
    expect(piece.defId).toBe('tile-blue');
    expect(piece.zoneId).toBe('bag');
    expect(piece.ownerId).toBe('player-1');
    // properties from PieceDef get copied into state
    expect(piece.state['color']).toBe('blue');
  });

  it('Test 2: has fallback rendering info (shape, color, label) from PieceDef', () => {
    const piece = new Piece('tile-blue-0', blueDef, 'bag');
    expect(piece.fallback.shape).toBe('square');
    expect(piece.fallback.color).toBe('#4A90D9');
    expect(piece.fallback.label).toBe('B');
  });

  it('Test 3: can be moved between zones (zoneId updates)', () => {
    const piece = new Piece('tile-blue-0', blueDef, 'bag');
    expect(piece.zoneId).toBe('bag');
    piece.moveTo('factory-0');
    expect(piece.zoneId).toBe('factory-0');
    piece.moveTo('player-wall');
    expect(piece.zoneId).toBe('player-wall');
  });
});

// ─── PieceFactory ─────────────────────────────────────────────────────────────

describe('PieceFactory', () => {
  it('Test 4: creates Piece instances from PieceDef with unique runtime ids', () => {
    const pieces = PieceFactory.createPieces([blueDef, tokenDef], {
      'tile-blue': 3,
      'first-player-token': 1,
    });
    expect(pieces.length).toBe(4);
    const ids = pieces.map(p => p.id);
    // All ids must be unique
    expect(new Set(ids).size).toBe(4);
    // IDs follow defId-N pattern
    expect(ids.filter(id => id.startsWith('tile-blue'))).toHaveLength(3);
    expect(ids.filter(id => id.startsWith('first-player-token'))).toHaveLength(1);
  });
});
