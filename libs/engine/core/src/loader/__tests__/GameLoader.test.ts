/**
 * GameLoader tests.
 *
 * Tests the GameLoader.load() function against the Azul game.json fixture.
 * Verifies that RuntimeGameModel has correct zone and piece counts.
 */
import { describe, it, expect } from 'vitest';
import { GameLoader } from '../GameLoader.js';
import type { GameConfig } from '@bga2/shared-types';

// Inline Azul game.json as a fixture (mirrors the actual file)
const azulConfig: GameConfig = {
  id: 'azul',
  version: '1.0.0',
  title: 'Azul',
  players: { min: 2, max: 4 },
  zones: [
    { id: 'factory-0', type: 'stack', capacity: 4, owner: 'shared', position: { x: 100, y: 80 } },
    { id: 'factory-1', type: 'stack', capacity: 4, owner: 'shared', position: { x: 220, y: 80 } },
    { id: 'factory-2', type: 'stack', capacity: 4, owner: 'shared', position: { x: 340, y: 80 } },
    { id: 'factory-3', type: 'stack', capacity: 4, owner: 'shared', position: { x: 160, y: 180 } },
    { id: 'factory-4', type: 'stack', capacity: 4, owner: 'shared', position: { x: 280, y: 180 } },
    { id: 'center', type: 'stack', owner: 'shared', position: { x: 220, y: 300 } },
    { id: 'player-pattern-line-1', type: 'grid', rows: 1, cols: 1, owner: 'player' },
    { id: 'player-pattern-line-2', type: 'grid', rows: 1, cols: 2, owner: 'player' },
    { id: 'player-pattern-line-3', type: 'grid', rows: 1, cols: 3, owner: 'player' },
    { id: 'player-pattern-line-4', type: 'grid', rows: 1, cols: 4, owner: 'player' },
    { id: 'player-pattern-line-5', type: 'grid', rows: 1, cols: 5, owner: 'player' },
    { id: 'player-wall', type: 'grid', rows: 5, cols: 5, owner: 'player' },
    { id: 'player-floor-line', type: 'grid', rows: 1, cols: 7, owner: 'player' },
    { id: 'bag', type: 'deck', owner: 'shared' },
    { id: 'lid', type: 'discard', owner: 'shared' },
  ],
  pieces: [
    { id: 'tile-blue', type: 'tile', fallback: { shape: 'square', color: '#4A90D9', label: 'B' } },
    { id: 'tile-yellow', type: 'tile', fallback: { shape: 'square', color: '#F5C542', label: 'Y' } },
    { id: 'tile-red', type: 'tile', fallback: { shape: 'square', color: '#E74C3C', label: 'R' } },
    { id: 'tile-black', type: 'tile', fallback: { shape: 'square', color: '#2C3E50', label: 'K' } },
    { id: 'tile-teal', type: 'tile', fallback: { shape: 'square', color: '#1ABC9C', label: 'T' } },
    { id: 'first-player-token', type: 'token', fallback: { shape: 'circle', color: '#FFFFFF', label: '1' } },
  ],
  turnOrder: 'sequential',
  hooks: { file: 'hooks.ts', events: ['getValidMoves', 'onMove', 'onRoundEnd'] },
};

describe('GameLoader', () => {
  it('Test 5: GameLoader.load(gameJson) returns RuntimeGameModel with zones and pieces', () => {
    const model = GameLoader.load(azulConfig);
    expect(model).toBeDefined();
    expect(model.zones).toBeInstanceOf(Map);
    expect(model.pieceDefs).toBeInstanceOf(Map);
    expect(Array.isArray(model.pieces)).toBe(true);
  });

  it('Test 6: creates correct number of zones from Azul game.json (15 zones)', () => {
    const model = GameLoader.load(azulConfig);
    // Azul has 15 zone definitions
    expect(model.zones.size).toBe(15);
  });

  it('Test 7: creates correct number of piece definitions from Azul game.json (6 defs)', () => {
    const model = GameLoader.load(azulConfig);
    // 6 piece definitions (5 tile colors + 1 first player token)
    expect(model.pieceDefs.size).toBe(6);
  });

  it('Test 8: RuntimeGameModel provides lookup by zone id and piece id', () => {
    const model = GameLoader.load(azulConfig);
    const factory0 = model.getZone('factory-0');
    expect(factory0).toBeDefined();
    expect(factory0.id).toBe('factory-0');

    // Piece lookup: find a piece that was created
    const firstPiece = model.pieces[0];
    const found = model.getPiece(firstPiece.id);
    expect(found).toBeDefined();
    expect(found.id).toBe(firstPiece.id);
  });

  it('validation: throws on duplicate zone ids', () => {
    const badConfig: GameConfig = {
      ...azulConfig,
      zones: [
        { id: 'duplicate', type: 'stack' },
        { id: 'duplicate', type: 'hand' },
      ],
    };
    expect(() => GameLoader.load(badConfig)).toThrow(/duplicate/i);
  });

  it('validation: throws on duplicate piece def ids', () => {
    const badConfig: GameConfig = {
      ...azulConfig,
      pieces: [
        { id: 'tile-blue', type: 'tile', fallback: { shape: 'square', color: '#000', label: 'A' } },
        { id: 'tile-blue', type: 'tile', fallback: { shape: 'square', color: '#000', label: 'A' } },
      ],
    };
    expect(() => GameLoader.load(badConfig)).toThrow(/duplicate/i);
  });
});
