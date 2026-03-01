/**
 * @bga2/shared-types — Cross-cutting type contracts
 *
 * Barrel export for all shared TypeScript interfaces and type aliases.
 * Every consumer (client, server, engine, games) imports from this package.
 *
 * Organization:
 *   renderer    — IRenderer interface, handle types, options
 *   game-config — GameConfig, ZoneDef, PieceDef, TurnOrder, HookRef
 *   zones       — ZoneType, ZoneDef, ZoneRenderConfig, ZoneState
 *   pieces      — PieceType, PieceDef, PieceFallback, PieceState
 *   hooks       — HookContext, HookFunctions, PlayerInfo
 *   moves       — Move, ValidMove, MoveResult
 *   state       — GameState, PlayerState, ZoneState
 */

// Renderer
export type {
  IRenderer,
  ISpriteHandle,
  IContainerHandle,
  IViewportHandle,
  ISceneHandle,
  RendererOptions,
  AnimateOptions,
  ViewportOptions,
} from './renderer.js';

// Game config
export type {
  GameConfig,
  TurnOrder,
  HookRef,
} from './game-config.js';

// Zones
export type {
  ZoneType,
  ZoneDef,
  ZoneRenderConfig,
  ZoneState,
} from './zones.js';

// Pieces
export type {
  PieceType,
  PieceDef,
  PieceFallback,
  PieceState,
} from './pieces.js';

// Hooks
export type {
  HookContext,
  HookFunctions,
  PlayerInfo,
} from './hooks.js';

// Moves
export type {
  Move,
  ValidMove,
  MoveResult,
} from './moves.js';

// State
export type {
  GameState,
  PlayerState,
} from './state.js';
