/**
 * Type contract tests for shared-types library.
 * These tests verify the shape of TypeScript interfaces at compile time,
 * using runtime assertions on the type structure.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  IRenderer,
  ISpriteHandle,
  IContainerHandle,
  IViewportHandle,
  ISceneHandle,
  RendererOptions,
  AnimateOptions,
  ViewportOptions,
} from './renderer.js';
import type {
  GameConfig,
  ZoneDef,
  PieceDef,
  TurnOrder,
  HookRef,
} from './game-config.js';
import type { ZoneType } from './zones.js';
import type { HookContext, HookFunctions } from './hooks.js';
import type { Move, ValidMove, MoveResult } from './moves.js';
import type { GameState } from './state.js';

// ─── Test 1: IRenderer has all required lifecycle, scene graph, interaction, effects, and viewport methods ───

describe('IRenderer interface', () => {
  it('has init, destroy, resize lifecycle methods', () => {
    type InitFn = IRenderer['init'];
    type DestroyFn = IRenderer['destroy'];
    type ResizeFn = IRenderer['resize'];
    expectTypeOf<InitFn>().toBeFunction();
    expectTypeOf<DestroyFn>().toBeFunction();
    expectTypeOf<ResizeFn>().toBeFunction();
  });

  it('has createSprite, createContainer, addToStage, removeFromStage scene graph methods', () => {
    type CreateSpriteFn = IRenderer['createSprite'];
    type CreateContainerFn = IRenderer['createContainer'];
    type AddToStageFn = IRenderer['addToStage'];
    type RemoveFromStageFn = IRenderer['removeFromStage'];
    expectTypeOf<CreateSpriteFn>().toBeFunction();
    expectTypeOf<CreateContainerFn>().toBeFunction();
    expectTypeOf<AddToStageFn>().toBeFunction();
    expectTypeOf<RemoveFromStageFn>().toBeFunction();
  });

  it('has setInteractive, onPointerDown interaction methods', () => {
    type SetInteractiveFn = IRenderer['setInteractive'];
    type OnPointerDownFn = IRenderer['onPointerDown'];
    expectTypeOf<SetInteractiveFn>().toBeFunction();
    expectTypeOf<OnPointerDownFn>().toBeFunction();
  });

  it('has applyGlow, removeGlow, animateTo effects methods', () => {
    type ApplyGlowFn = IRenderer['applyGlow'];
    type RemoveGlowFn = IRenderer['removeGlow'];
    type AnimateToFn = IRenderer['animateTo'];
    expectTypeOf<ApplyGlowFn>().toBeFunction();
    expectTypeOf<RemoveGlowFn>().toBeFunction();
    expectTypeOf<AnimateToFn>().toBeFunction();
  });

  it('has enableViewport viewport method', () => {
    type EnableViewportFn = IRenderer['enableViewport'];
    expectTypeOf<EnableViewportFn>().toBeFunction();
  });
});

// ─── Test 2: GameConfig has all required fields ───

describe('GameConfig type', () => {
  it('has id, version, title, players, zones, pieces, turnOrder, hooks fields', () => {
    expectTypeOf<GameConfig['id']>().toBeString();
    expectTypeOf<GameConfig['version']>().toBeString();
    expectTypeOf<GameConfig['title']>().toBeString();
    expectTypeOf<GameConfig['players']>().toMatchTypeOf<{ min: number; max: number }>();
    expectTypeOf<GameConfig['zones']>().toMatchTypeOf<ZoneDef[]>();
    expectTypeOf<GameConfig['pieces']>().toMatchTypeOf<PieceDef[]>();
    expectTypeOf<GameConfig['turnOrder']>().toMatchTypeOf<TurnOrder>();
    expectTypeOf<GameConfig['hooks']>().toMatchTypeOf<HookRef>();
  });
});

// ─── Test 3: ZoneDef has id, type with enum values ───

describe('ZoneDef type', () => {
  it('has id and type fields', () => {
    expectTypeOf<ZoneDef['id']>().toBeString();
    expectTypeOf<ZoneDef['type']>().toMatchTypeOf<ZoneType>();
  });

  it('ZoneType includes grid, stack, hand, deck, discard', () => {
    // These are valid ZoneType values
    const grid: ZoneType = 'grid';
    const stack: ZoneType = 'stack';
    const hand: ZoneType = 'hand';
    const deck: ZoneType = 'deck';
    const discard: ZoneType = 'discard';
    // Just checking they compile
    expectTypeOf(grid).toMatchTypeOf<ZoneType>();
    expectTypeOf(stack).toMatchTypeOf<ZoneType>();
    expectTypeOf(hand).toMatchTypeOf<ZoneType>();
    expectTypeOf(deck).toMatchTypeOf<ZoneType>();
    expectTypeOf(discard).toMatchTypeOf<ZoneType>();
  });
});

// ─── Test 4: PieceDef has id, type, asset, fallback ───

describe('PieceDef type', () => {
  it('has id, type, asset (optional), and fallback fields', () => {
    expectTypeOf<PieceDef['id']>().toBeString();
    expectTypeOf<PieceDef['type']>().toBeString();
    // fallback has shape, color, label
    expectTypeOf<PieceDef['fallback']['shape']>().toBeString();
    expectTypeOf<PieceDef['fallback']['color']>().toBeString();
    expectTypeOf<PieceDef['fallback']['label']>().toBeString();
  });
});

// ─── Test 5: HookContext has state, currentPlayer, round ───

describe('HookContext type', () => {
  it('has state, currentPlayer, and round fields', () => {
    expectTypeOf<HookContext['state']>().toMatchTypeOf<GameState>();
    expectTypeOf<HookContext['currentPlayer']>().toBeString();
    expectTypeOf<HookContext['round']>().toBeNumber();
  });
});

// ─── Test 6: Move has playerId, action, source, target, pieceId ───

describe('Move type', () => {
  it('has playerId and action fields', () => {
    expectTypeOf<Move['playerId']>().toBeString();
    expectTypeOf<Move['action']>().toBeString();
  });

  it('has optional source, target, pieceId fields', () => {
    type Source = Move['source'];
    type Target = Move['target'];
    type PieceId = Move['pieceId'];
    expectTypeOf<Source>().toMatchTypeOf<string | undefined>();
    expectTypeOf<Target>().toMatchTypeOf<string | undefined>();
    expectTypeOf<PieceId>().toMatchTypeOf<string | undefined>();
  });
});

// ─── Test 7: ValidMove has action, source, target, pieceId (no playerId) ───

describe('ValidMove type', () => {
  it('has action field', () => {
    expectTypeOf<ValidMove['action']>().toBeString();
  });

  it('has optional source, target, pieceId but NO playerId', () => {
    type Source = ValidMove['source'];
    type Target = ValidMove['target'];
    type PieceId = ValidMove['pieceId'];
    expectTypeOf<Source>().toMatchTypeOf<string | undefined>();
    expectTypeOf<Target>().toMatchTypeOf<string | undefined>();
    expectTypeOf<PieceId>().toMatchTypeOf<string | undefined>();
    // ValidMove should NOT have playerId
    // @ts-expect-error playerId should not exist on ValidMove
    const _test: ValidMove['playerId'] = '';
  });
});
