/**
 * Zone primitives.
 *
 * Zones are the fundamental spatial containers in a board game engine.
 * This file contains the abstract Zone base class and all 5 concrete subclasses:
 * GridZone, StackZone, HandZone, DeckZone, DiscardZone.
 */

import type { ZoneDef, ZoneType } from '@bga2/shared-types';
import type { Piece } from '../pieces/Piece.js';

// ─── Base Zone ────────────────────────────────────────────────────────────────

export abstract class Zone {
  readonly id: string;
  readonly type: ZoneType;
  readonly owner: 'player' | 'shared';
  readonly capacity?: number;

  constructor(def: ZoneDef) {
    this.id = def.id;
    this.type = def.type;
    this.owner = def.owner ?? 'shared';
    this.capacity = def.capacity;
  }

  /** Add a piece to this zone. Position meaning depends on zone type. */
  abstract addPiece(piece: Piece, position?: unknown): void;

  /** Remove a piece by id and return it (or null if not found). */
  abstract removePiece(pieceId: string): Piece | null;

  /** Return all pieces currently in this zone (order depends on zone type). */
  abstract getPieces(): Piece[];

  getPieceCount(): number {
    return this.getPieces().length;
  }

  isFull(): boolean {
    if (this.capacity === undefined) return false;
    return this.getPieceCount() >= this.capacity;
  }
}

// ─── GridZone ─────────────────────────────────────────────────────────────────

/** A zone where pieces occupy named (row, col) cells — e.g., a game board. */
export class GridZone extends Zone {
  readonly rows: number;
  readonly cols: number;
  private readonly grid: Map<string, Piece> = new Map();

  constructor(def: ZoneDef) {
    super(def);
    this.rows = def.rows ?? 1;
    this.cols = def.cols ?? 1;
  }

  addPiece(piece: Piece, position: { row: number; col: number }): void {
    const key = `${position.row},${position.col}`;
    if (this.grid.has(key)) {
      throw new Error(
        `GridZone "${this.id}": cell (${position.row}, ${position.col}) is already occupied`
      );
    }
    this.grid.set(key, piece);
  }

  removePiece(pieceId: string): Piece | null {
    for (const [key, piece] of this.grid.entries()) {
      if (piece.id === pieceId) {
        this.grid.delete(key);
        return piece;
      }
    }
    return null;
  }

  getPieces(): Piece[] {
    return Array.from(this.grid.values());
  }

  /** Return the piece at the given grid coordinates, or null if empty. */
  getPieceAt(row: number, col: number): Piece | null {
    return this.grid.get(`${row},${col}`) ?? null;
  }
}

// ─── StackZone ────────────────────────────────────────────────────────────────

/** A zone where pieces stack in LIFO order — e.g., a factory display. */
export class StackZone extends Zone {
  private readonly stack: Piece[] = [];

  addPiece(piece: Piece): void {
    this.push(piece);
  }

  push(piece: Piece): void {
    if (this.isFull()) {
      throw new Error(`StackZone "${this.id}": stack is at capacity (${this.capacity ?? 'unknown'})`);
    }
    this.stack.push(piece);
  }

  pop(): Piece | null {
    return this.stack.pop() ?? null;
  }

  peek(): Piece | null {
    return this.stack.at(-1) ?? null;
  }

  removePiece(pieceId: string): Piece | null {
    const idx = this.stack.findIndex(p => p.id === pieceId);
    if (idx === -1) return null;
    const [removed] = this.stack.splice(idx, 1);
    return removed;
  }

  getPieces(): Piece[] {
    return [...this.stack];
  }
}

// ─── HandZone ─────────────────────────────────────────────────────────────────

/** A zone with set semantics — no positional ordering — e.g., a player's hand. */
export class HandZone extends Zone {
  private readonly pieces: Map<string, Piece> = new Map();

  addPiece(piece: Piece): void {
    this.pieces.set(piece.id, piece);
  }

  removePiece(pieceId: string): Piece | null {
    const piece = this.pieces.get(pieceId) ?? null;
    this.pieces.delete(pieceId);
    return piece;
  }

  getPieces(): Piece[] {
    return Array.from(this.pieces.values());
  }

  hasPiece(pieceId: string): boolean {
    return this.pieces.has(pieceId);
  }
}

// ─── DeckZone ─────────────────────────────────────────────────────────────────

/** A zone that represents a shuffleable draw pile — e.g., a tile bag. */
export class DeckZone extends Zone {
  private readonly deck: Piece[] = [];

  addPiece(piece: Piece): void {
    this.deck.push(piece);
  }

  addToBottom(piece: Piece): void {
    this.deck.unshift(piece);
  }

  /** Fisher-Yates shuffle in place. */
  shuffle(): void {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  /** Remove and return the top (last) piece, or null if empty. */
  draw(): Piece | null {
    return this.deck.pop() ?? null;
  }

  /** Draw multiple pieces at once. */
  drawN(n: number): Piece[] {
    return this.deck.splice(-n, n).reverse();
  }

  removePiece(pieceId: string): Piece | null {
    const idx = this.deck.findIndex(p => p.id === pieceId);
    if (idx === -1) return null;
    const [removed] = this.deck.splice(idx, 1);
    return removed;
  }

  getPieces(): Piece[] {
    return [...this.deck];
  }
}

// ─── DiscardZone ──────────────────────────────────────────────────────────────

/** A zone that collects spent pieces — e.g., a tile discard lid. */
export class DiscardZone extends Zone {
  private readonly pile: Piece[] = [];

  addPiece(piece: Piece): void {
    this.pile.push(piece);
  }

  removePiece(pieceId: string): Piece | null {
    const idx = this.pile.findIndex(p => p.id === pieceId);
    if (idx === -1) return null;
    const [removed] = this.pile.splice(idx, 1);
    return removed;
  }

  getPieces(): Piece[] {
    return [...this.pile];
  }

  getAllPieces(): Piece[] {
    return [...this.pile];
  }

  /** Empty the discard pile (e.g., for reshuffling back into a deck). */
  clear(): Piece[] {
    return this.pile.splice(0);
  }
}

// ─── FreeformZone ──────────────────────────────────────────────────────────

/**
 * A zone where pieces have no fixed grid — they carry their own coordinates
 * in their data/state field. Used for games with dynamic/growing boards
 * like Hive where pieces define the board shape.
 *
 * Pieces are stored by ID. Position is tracked externally (in piece state or
 * game-specific data structures like HiveGameData.placedPieceCoords).
 * The renderer reads piece positions from game state to calculate pixel positions.
 */
export class FreeformZone extends Zone {
  private readonly pieces: Map<string, Piece> = new Map();

  addPiece(piece: Piece): void {
    this.pieces.set(piece.id, piece);
  }

  removePiece(pieceId: string): Piece | null {
    const piece = this.pieces.get(pieceId) ?? null;
    this.pieces.delete(pieceId);
    return piece;
  }

  getPieces(): Piece[] {
    return Array.from(this.pieces.values());
  }

  hasPiece(pieceId: string): boolean {
    return this.pieces.has(pieceId);
  }
}
