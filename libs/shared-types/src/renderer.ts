/**
 * IRenderer interface and related handle types.
 *
 * Defines the contract between the engine and any renderer implementation.
 * The concrete PixiJS adapter (in libs/engine/core) will implement IRenderer.
 * No PixiJS types leak through — all interaction uses these handle types.
 */

// ─── Handle types ────────────────────────────────────────────────────────────

/** Opaque handle to a sprite object managed by the renderer. */
export interface ISpriteHandle {
  readonly _brand: 'sprite';
}

/** Opaque handle to a container (group of scene objects). */
export interface IContainerHandle {
  readonly _brand: 'container';
}

/** Opaque handle to the viewport (pan/zoom manager). */
export interface IViewportHandle {
  readonly _brand: 'viewport';
}

/** Union of all scene object handle types. */
export type ISceneHandle = ISpriteHandle | IContainerHandle;

// ─── Options ─────────────────────────────────────────────────────────────────

/** Options passed to IRenderer.init(). */
export interface RendererOptions {
  worldWidth: number;
  worldHeight: number;
  /** Background color as hex number (e.g. 0xffffff for white). */
  background?: number;
}

/** Options for IRenderer.animateTo(). */
export interface AnimateOptions {
  /** Animation duration in milliseconds. */
  duration: number;
  /** Easing function name (e.g. 'easeOutBack' for snappy overshoot). */
  easing?: string;
}

/** Options for IRenderer.enableViewport(). */
export interface ViewportOptions {
  screenWidth: number;
  screenHeight: number;
  worldWidth: number;
  worldHeight: number;
}

// ─── IRenderer interface ──────────────────────────────────────────────────────

/**
 * Core renderer interface.
 * Implementations: PixiJS adapter (Phase 1), WebGL fallback (Phase 7+).
 *
 * Method groups:
 *   Lifecycle:    init, destroy, resize
 *   Scene graph:  createSprite, createContainer, addToStage, removeFromStage
 *   Interaction:  setInteractive, onPointerDown
 *   Effects:      applyGlow, removeGlow, animateTo
 *   Viewport:     enableViewport
 */
export interface IRenderer {
  // ── Lifecycle ──

  /** Initialize the renderer and attach a WebGL canvas to the given container element. */
  init(container: HTMLElement, options: RendererOptions): Promise<void>;

  /** Destroy the renderer and release all GPU resources. */
  destroy(): void;

  /** Resize the renderer canvas to the given dimensions. */
  resize(width: number, height: number): void;

  // ── Scene graph ──

  /** Create a sprite from a preloaded texture. */
  createSprite(textureId: string): ISpriteHandle;

  /** Create an empty container for grouping scene objects. */
  createContainer(): IContainerHandle;

  /** Add a scene object to the root stage. */
  addToStage(handle: ISceneHandle): void;

  /** Remove a scene object from the root stage. */
  removeFromStage(handle: ISceneHandle): void;

  // ── Positioning ──

  /** Set the position of a scene object in world coordinates. */
  setPosition(handle: ISceneHandle, x: number, y: number): void;

  // ── Interaction ──

  /** Enable or disable pointer events on a sprite. */
  setInteractive(handle: ISpriteHandle, enabled: boolean): void;

  /** Register a callback for pointer-down events on a sprite. */
  onPointerDown(handle: ISpriteHandle, cb: () => void): void;

  // ── Effects ──

  /** Apply a colored glow filter to a sprite (used for selection / valid-move highlights). */
  applyGlow(handle: ISpriteHandle, color: number, strength: number): void;

  /** Remove an existing glow filter from a sprite. */
  removeGlow(handle: ISpriteHandle): void;

  /**
   * Animate a sprite to a new (x, y) position.
   * Resolves when the animation completes.
   */
  animateTo(handle: ISpriteHandle, x: number, y: number, opts: AnimateOptions): Promise<void>;

  // ── Viewport ──

  /** Enable pan/zoom viewport management and return a handle to it. */
  enableViewport(options: ViewportOptions): IViewportHandle;
}
