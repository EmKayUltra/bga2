/**
 * Type contract tests for shared-types library.
 *
 * These tests verify the shape of TypeScript interfaces at compile time.
 * We use type-only assertions — if a property doesn't exist on a type,
 * tsc will error. Runtime tests confirm the test file loads correctly.
 *
 * Note: noUnusedLocals is true for the library tsconfig.
 * Test-only imports are used via type assignments to satisfy the checker.
 */
import { describe, it, expect } from 'vitest';
import type { IRenderer } from './renderer.js';
import type { GameConfig } from './game-config.js';
import type { ZoneDef, ZoneType } from './zones.js';
import type { PieceDef } from './pieces.js';
import type { HookContext } from './hooks.js';
import type { Move, ValidMove } from './moves.js';
import type { GameState } from './state.js';

// Helper: assert that a type property exists by extracting it — if it doesn't exist, tsc errors.
// We use void-assignment tricks to satisfy noUnusedLocals without needing actual runtime values.

// ─── Test 1: IRenderer has all required method groups ───────────────────────

describe('IRenderer interface', () => {
  it('has lifecycle methods: init, destroy, resize', () => {
    // Type-level: these property access expressions error at compile time if methods are missing
    type _Init = IRenderer['init'];
    type _Destroy = IRenderer['destroy'];
    type _Resize = IRenderer['resize'];
    // Runtime: just confirm the test ran
    expect(true).toBe(true);
  });

  it('has scene graph methods: createSprite, createContainer, addToStage, removeFromStage', () => {
    type _CreateSprite = IRenderer['createSprite'];
    type _CreateContainer = IRenderer['createContainer'];
    type _AddToStage = IRenderer['addToStage'];
    type _RemoveFromStage = IRenderer['removeFromStage'];
    expect(true).toBe(true);
  });

  it('has interaction methods: setInteractive, onPointerDown', () => {
    type _SetInteractive = IRenderer['setInteractive'];
    type _OnPointerDown = IRenderer['onPointerDown'];
    expect(true).toBe(true);
  });

  it('has effects methods: applyGlow, removeGlow, animateTo', () => {
    type _ApplyGlow = IRenderer['applyGlow'];
    type _RemoveGlow = IRenderer['removeGlow'];
    type _AnimateTo = IRenderer['animateTo'];
    expect(true).toBe(true);
  });

  it('has viewport method: enableViewport', () => {
    type _EnableViewport = IRenderer['enableViewport'];
    expect(true).toBe(true);
  });
});

// ─── Test 2: GameConfig has all required fields ──────────────────────────────

describe('GameConfig type', () => {
  it('has id, version, title, players, zones, pieces, turnOrder, hooks fields', () => {
    type _Id = GameConfig['id'];
    type _Version = GameConfig['version'];
    type _Title = GameConfig['title'];
    type _Players = GameConfig['players'];
    type _Zones = GameConfig['zones'];
    type _Pieces = GameConfig['pieces'];
    type _TurnOrder = GameConfig['turnOrder'];
    type _Hooks = GameConfig['hooks'];
    // Verify players has min/max
    type _PlayersMin = GameConfig['players']['min'];
    type _PlayersMax = GameConfig['players']['max'];
    expect(true).toBe(true);
  });
});

// ─── Test 3: ZoneDef has id and type with enum values ───────────────────────

describe('ZoneDef type', () => {
  it('has id and type fields', () => {
    type _Id = ZoneDef['id'];
    type _Type = ZoneDef['type'];
    expect(true).toBe(true);
  });

  it('ZoneType includes grid, stack, hand, deck, discard', () => {
    // These const assignments fail at compile time if ZoneType doesn't include the value
    const grid = 'grid' satisfies ZoneType;
    const stack = 'stack' satisfies ZoneType;
    const hand = 'hand' satisfies ZoneType;
    const deck = 'deck' satisfies ZoneType;
    const discard = 'discard' satisfies ZoneType;
    expect([grid, stack, hand, deck, discard]).toHaveLength(5);
  });
});

// ─── Test 4: PieceDef has id, type, asset (optional), fallback ───────────────

describe('PieceDef type', () => {
  it('has id, type, and fallback fields (asset is optional)', () => {
    type _Id = PieceDef['id'];
    type _Type = PieceDef['type'];
    type _Fallback = PieceDef['fallback'];
    type _FallbackShape = PieceDef['fallback']['shape'];
    type _FallbackColor = PieceDef['fallback']['color'];
    type _FallbackLabel = PieceDef['fallback']['label'];
    expect(true).toBe(true);
  });
});

// ─── Test 5: HookContext has state, currentPlayer, round ─────────────────────

describe('HookContext type', () => {
  it('has state, currentPlayer, and round fields', () => {
    type _State = HookContext['state'];
    type _CurrentPlayer = HookContext['currentPlayer'];
    type _Round = HookContext['round'];
    // state must be a GameState
    type _StateIsGameState = HookContext['state'] extends GameState ? true : never;
    const _check: _StateIsGameState = true;
    expect(_check).toBe(true);
  });
});

// ─── Test 6: Move has playerId, action, and optional source/target/pieceId ───

describe('Move type', () => {
  it('has playerId and action fields', () => {
    type _PlayerId = Move['playerId'];
    type _Action = Move['action'];
    expect(true).toBe(true);
  });

  it('has optional source, target, pieceId fields', () => {
    type _Source = Move['source'];
    type _Target = Move['target'];
    type _PieceId = Move['pieceId'];
    // These should be string | undefined
    type _SourceOpt = _Source extends string | undefined ? true : never;
    const _check: _SourceOpt = true;
    expect(_check).toBe(true);
  });
});

// ─── Test 7: ValidMove has action, source, target, pieceId — no playerId ─────

describe('ValidMove type', () => {
  it('has action field', () => {
    type _Action = ValidMove['action'];
    expect(true).toBe(true);
  });

  it('has optional source, target, pieceId fields', () => {
    type _Source = ValidMove['source'];
    type _Target = ValidMove['target'];
    type _PieceId = ValidMove['pieceId'];
    expect(true).toBe(true);
  });

  it('does NOT have a playerId field', () => {
    // If ValidMove had a playerId field, 'playerId' would be keyof ValidMove
    // This test verifies 'playerId' is NOT in the key set
    type _HasPlayerId = 'playerId' extends keyof ValidMove ? true : false;
    const hasPlayerId: _HasPlayerId = false;
    expect(hasPlayerId).toBe(false);
  });
});
