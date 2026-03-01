/**
 * Zone primitive tests
 *
 * Covers all 5 zone types: GridZone, StackZone, HandZone, DeckZone, DiscardZone
 * and the ZoneFactory that creates them from ZoneDef.
 */
import { describe, it, expect } from 'vitest';
import {
  GridZone,
  StackZone,
  HandZone,
  DeckZone,
  DiscardZone,
  ZoneFactory,
} from '../index.js';
import type { ZoneDef } from '@bga2/shared-types';

// Minimal fake Piece for zone tests
function makePiece(id: string) {
  return {
    id,
    defId: 'tile-blue',
    zoneId: '',
    fallback: { shape: 'square', color: '#fff', label: 'X' },
    state: {},
    moveTo: (zoneId: string) => { /* no-op for test */ void zoneId; },
  } as const;
}

// ─── GridZone ─────────────────────────────────────────────────────────────────

describe('GridZone', () => {
  it('Test 1: stores pieces by (row, col) and getPieceAt returns correct piece', () => {
    const zone = new GridZone({ id: 'wall', type: 'grid', rows: 5, cols: 5 });
    const piece = makePiece('p1');
    zone.addPiece(piece as never, { row: 2, col: 3 });
    expect(zone.getPieceAt(2, 3)?.id).toBe('p1');
    expect(zone.getPieceAt(0, 0)).toBeNull();
  });

  it('Test 2: rejects placement at occupied cell', () => {
    const zone = new GridZone({ id: 'wall', type: 'grid', rows: 5, cols: 5 });
    const p1 = makePiece('p1');
    const p2 = makePiece('p2');
    zone.addPiece(p1 as never, { row: 1, col: 1 });
    expect(() => zone.addPiece(p2 as never, { row: 1, col: 1 })).toThrow();
  });

  it('Test 9 (grid): reports piece count correctly', () => {
    const zone = new GridZone({ id: 'wall', type: 'grid', rows: 5, cols: 5 });
    zone.addPiece(makePiece('p1') as never, { row: 0, col: 0 });
    zone.addPiece(makePiece('p2') as never, { row: 0, col: 1 });
    expect(zone.getPieceCount()).toBe(2);
  });
});

// ─── StackZone ────────────────────────────────────────────────────────────────

describe('StackZone', () => {
  it('Test 3: pushes and pops pieces in LIFO order', () => {
    const zone = new StackZone({ id: 'factory', type: 'stack' });
    const p1 = makePiece('p1');
    const p2 = makePiece('p2');
    zone.push(p1 as never);
    zone.push(p2 as never);
    expect(zone.pop()?.id).toBe('p2');
    expect(zone.pop()?.id).toBe('p1');
    expect(zone.pop()).toBeNull();
  });

  it('Test 4: respects capacity limit — push on full stack fails', () => {
    const zone = new StackZone({ id: 'factory', type: 'stack', capacity: 2 });
    zone.push(makePiece('p1') as never);
    zone.push(makePiece('p2') as never);
    expect(() => zone.push(makePiece('p3') as never)).toThrow();
  });

  it('Test 9 (stack): reports piece count correctly', () => {
    const zone = new StackZone({ id: 'factory', type: 'stack' });
    zone.push(makePiece('p1') as never);
    zone.push(makePiece('p2') as never);
    zone.push(makePiece('p3') as never);
    expect(zone.getPieceCount()).toBe(3);
  });
});

// ─── HandZone ─────────────────────────────────────────────────────────────────

describe('HandZone', () => {
  it('Test 5: holds pieces without positional ordering (set semantics)', () => {
    const zone = new HandZone({ id: 'hand', type: 'hand' });
    const p1 = makePiece('p1');
    const p2 = makePiece('p2');
    zone.addPiece(p1 as never);
    zone.addPiece(p2 as never);
    const pieces = zone.getPieces();
    expect(pieces.length).toBe(2);
    expect(pieces.map(p => p.id)).toContain('p1');
    expect(pieces.map(p => p.id)).toContain('p2');
    // hasPiece check
    expect(zone.hasPiece('p1')).toBe(true);
    expect(zone.hasPiece('p99')).toBe(false);
    // Remove works
    zone.removePiece('p1');
    expect(zone.hasPiece('p1')).toBe(false);
  });
});

// ─── DeckZone ─────────────────────────────────────────────────────────────────

describe('DeckZone', () => {
  it('Test 6: supports shuffle (changes piece order) and draw (removes top piece)', () => {
    const zone = new DeckZone({ id: 'bag', type: 'deck' });
    // Add 20 pieces with unique ids
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    ids.forEach(id => zone.addPiece(makePiece(id) as never));
    const before = zone.getPieces().map(p => p.id).join(',');
    zone.shuffle();
    const after = zone.getPieces().map(p => p.id).join(',');
    // Very unlikely to remain identical with 20 elements
    expect(after).not.toBe(before);

    const drawn = zone.draw();
    expect(drawn).not.toBeNull();
    expect(zone.getPieceCount()).toBe(19);
  });

  it('Test 9 (deck): reports piece count correctly', () => {
    const zone = new DeckZone({ id: 'bag', type: 'deck' });
    zone.addPiece(makePiece('p1') as never);
    zone.addPiece(makePiece('p2') as never);
    expect(zone.getPieceCount()).toBe(2);
  });
});

// ─── DiscardZone ──────────────────────────────────────────────────────────────

describe('DiscardZone', () => {
  it('Test 7: accepts pieces and allows retrieval of all pieces', () => {
    const zone = new DiscardZone({ id: 'lid', type: 'discard' });
    zone.addPiece(makePiece('p1') as never);
    zone.addPiece(makePiece('p2') as never);
    const all = zone.getAllPieces();
    expect(all.length).toBe(2);
    expect(all.map(p => p.id)).toContain('p1');
  });

  it('Test 9 (discard): reports piece count correctly', () => {
    const zone = new DiscardZone({ id: 'lid', type: 'discard' });
    zone.addPiece(makePiece('p1') as never);
    expect(zone.getPieceCount()).toBe(1);
  });
});

// ─── ZoneFactory ──────────────────────────────────────────────────────────────

describe('ZoneFactory', () => {
  it('Test 8: creates correct zone type from ZoneDef', () => {
    const defs: ZoneDef[] = [
      { id: 'g', type: 'grid', rows: 5, cols: 5 },
      { id: 's', type: 'stack', capacity: 4 },
      { id: 'h', type: 'hand' },
      { id: 'd', type: 'deck' },
      { id: 'x', type: 'discard' },
    ];
    const [grid, stack, hand, deck, discard] = defs.map(ZoneFactory.createZone);
    expect(grid).toBeInstanceOf(GridZone);
    expect(stack).toBeInstanceOf(StackZone);
    expect(hand).toBeInstanceOf(HandZone);
    expect(deck).toBeInstanceOf(DeckZone);
    expect(discard).toBeInstanceOf(DiscardZone);
  });
});
