/**
 * StubRenderer — no-op IRenderer implementation for headless testing.
 *
 * All methods are no-ops or minimal tracking implementations.
 * Provides helper methods for test assertions:
 *   - getStageObjects()      — inspect what's currently on stage
 *   - triggerPointerDown()   — programmatically fire a pointer-down callback
 *   - getGlowState()         — inspect glow state for a handle
 *
 * Never imports pixi.js — safe for use in Node.js test environments.
 */

import type {
  IRenderer,
  ISpriteHandle,
  IContainerHandle,
  IViewportHandle,
  ISceneHandle,
  RendererOptions,
  AnimateOptions,
  ViewportOptions,
} from '@bga2/shared-types';

// ─── Internal handle types ────────────────────────────────────────────────────

interface StubHandle {
  id: string;
}

interface StubSpriteHandle extends StubHandle, ISpriteHandle {
  readonly _brand: 'sprite';
}

interface StubContainerHandle extends StubHandle, IContainerHandle {
  readonly _brand: 'container';
}

interface StubViewportHandle extends StubHandle, IViewportHandle {
  readonly _brand: 'viewport';
}

interface GlowState {
  color: number;
  strength: number;
}

// ─── Simple ID generator ──────────────────────────────────────────────────────

let _nextId = 1;
function nextId(): string {
  return `stub-${_nextId++}`;
}

// ─── StubRenderer ────────────────────────────────────────────────────────────

export class StubRenderer implements IRenderer {
  private _stage: ISceneHandle[] = [];
  private _pointerCallbacks: Map<string, () => void> = new Map();
  private _glowStates: Map<string, GlowState> = new Map();
  private _options: RendererOptions | null = null;

  // ── Lifecycle ──

  async init(_container: HTMLElement, options: RendererOptions): Promise<void> {
    this._options = options;
  }

  destroy(): void {
    this._stage = [];
    this._pointerCallbacks.clear();
    this._glowStates.clear();
    this._options = null;
  }

  resize(_width: number, _height: number): void {
    // no-op in stub
  }

  // ── Scene graph ──

  createSprite(_textureId: string): ISpriteHandle {
    const handle: StubSpriteHandle = {
      id: nextId(),
      _brand: 'sprite',
    };
    return handle;
  }

  createContainer(): IContainerHandle {
    const handle: StubContainerHandle = {
      id: nextId(),
      _brand: 'container',
    };
    return handle;
  }

  addToStage(handle: ISceneHandle): void {
    if (!this._stage.includes(handle)) {
      this._stage.push(handle);
    }
  }

  removeFromStage(handle: ISceneHandle): void {
    const idx = this._stage.indexOf(handle);
    if (idx !== -1) {
      this._stage.splice(idx, 1);
    }
  }

  // ── Interaction ──

  setInteractive(_handle: ISpriteHandle, _enabled: boolean): void {
    // no-op in stub
  }

  onPointerDown(handle: ISpriteHandle, cb: () => void): void {
    const id = (handle as StubSpriteHandle).id;
    this._pointerCallbacks.set(id, cb);
  }

  // ── Effects ──

  applyGlow(handle: ISpriteHandle, color: number, strength: number): void {
    const id = (handle as StubSpriteHandle).id;
    this._glowStates.set(id, { color, strength });
  }

  removeGlow(handle: ISpriteHandle): void {
    const id = (handle as StubSpriteHandle).id;
    this._glowStates.delete(id);
  }

  async animateTo(
    _handle: ISpriteHandle,
    _x: number,
    _y: number,
    _opts: AnimateOptions
  ): Promise<void> {
    // Resolves immediately — no actual animation in stub
  }

  // ── Viewport ──

  enableViewport(_options: ViewportOptions): IViewportHandle {
    const handle: StubViewportHandle = {
      id: nextId(),
      _brand: 'viewport',
    };
    return handle;
  }

  // ─── Test helpers ────────────────────────────────────────────────────────────

  /**
   * Returns all scene objects currently on the stage.
   * Useful for asserting that addToStage/removeFromStage worked correctly.
   */
  getStageObjects(): ISceneHandle[] {
    return [...this._stage];
  }

  /**
   * Programmatically fires the pointer-down callback registered for a handle.
   * Useful for simulating user clicks in tests.
   * @param handleId - The id of the StubSpriteHandle (access via (handle as any).id)
   */
  triggerPointerDown(handleId: string): void {
    const cb = this._pointerCallbacks.get(handleId);
    if (cb) {
      cb();
    }
  }

  /**
   * Returns the current glow state for a handle, or null if no glow is applied.
   * @param handleId - The id of the StubSpriteHandle (access via (handle as any).id)
   */
  getGlowState(handleId: string): GlowState | null {
    return this._glowStates.get(handleId) ?? null;
  }

  /**
   * Returns the options passed to init(), or null if init hasn't been called.
   */
  getInitOptions(): RendererOptions | null {
    return this._options;
  }
}
