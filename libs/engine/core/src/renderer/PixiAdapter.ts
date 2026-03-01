/**
 * PixiAdapter — PixiJS v8 implementation of IRenderer.
 *
 * IMPORT ORDER IS CRITICAL: @mszu/pixi-ssr-shim MUST be the first import.
 * This shim patches browser globals (self, window, document) so PixiJS
 * does not crash during SvelteKit SSR. (See research Pitfall 1)
 *
 * Usage in SvelteKit:
 *   Only instantiate inside onMount() via dynamic import:
 *   const { PixiAdapter } = await import('@bga2/engine-core/renderer/PixiAdapter');
 *
 * Architecture:
 *   - All game objects live inside the viewport (for zoom/pan), not directly on app.stage
 *   - An internal Map<string, Container> maps handle IDs to PixiJS objects
 *   - Touch targets enforce 44px minimum hitArea (ENG-09)
 *   - GlowFilter from pixi-filters used for selection feedback
 *   - Animation uses easeOutBack (snappy overshoot) with requestAnimationFrame
 */

import '@mszu/pixi-ssr-shim'; // MUST be first — patches browser globals for SSR safety

import {
  Application,
  Sprite,
  Container,
  Texture,
  Graphics,
  Rectangle,
  Filter,
} from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { Viewport } from 'pixi-viewport';

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

// ─── Minimum touch target size (ENG-09) ──────────────────────────────────────

const MIN_HIT_AREA_PX = 44;

// ─── Handle types ─────────────────────────────────────────────────────────────

interface PixiSpriteHandle extends ISpriteHandle {
  readonly _brand: 'sprite';
  readonly id: string;
}

interface PixiContainerHandle extends IContainerHandle {
  readonly _brand: 'container';
  readonly id: string;
}

interface PixiViewportHandle extends IViewportHandle {
  readonly _brand: 'viewport';
  readonly id: string;
}

// ─── ID generator ─────────────────────────────────────────────────────────────

let _handleId = 1;
function nextHandleId(): string {
  return `pixi-handle-${_handleId++}`;
}

// ─── Easing: snappy overshoot (easeOutBack) ──────────────────────────────────

/**
 * easeOutBack easing function — quick move with slight overshoot and settle back.
 * c1 = 1.70158 (standard back constant), c3 = c1 + 1
 */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ─── PixiAdapter ──────────────────────────────────────────────────────────────

export class PixiAdapter implements IRenderer {
  private app!: Application;
  private viewport!: Viewport;

  /** Maps handle ID → PixiJS Container (Sprite or Container) */
  private _handles: Map<string, Container> = new Map();

  // ── Lifecycle ──

  async init(container: HTMLElement, options: RendererOptions): Promise<void> {
    this.app = new Application();

    await this.app.init({
      resizeTo: container,
      preference: 'webgl',
      antialias: true,
      background: options.background ?? 0xfafaf8, // light + clean theme default
    });

    // Append canvas to the container element
    container.appendChild(this.app.canvas as HTMLCanvasElement);
  }

  destroy(): void {
    this._handles.clear();
    this.app.destroy(true, { children: true, texture: false });
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    if (this.viewport) {
      this.viewport.resize(width, height);
    }
  }

  // ── Scene graph ──

  createSprite(textureId: string): ISpriteHandle {
    let sprite: Sprite | Graphics;

    // Use cached texture if available, otherwise create placeholder
    const texture = Texture.from(textureId);
    if (texture && texture !== Texture.EMPTY) {
      sprite = new Sprite(texture);
    } else {
      // Procedural placeholder: colored Graphics rectangle
      const g = new Graphics();
      g.rect(0, 0, 48, 48).fill({ color: 0x4a90d9 });
      sprite = g as unknown as Sprite;
    }

    // Enforce 44px minimum touch target (ENG-09)
    const bounds = sprite.getBounds?.() ?? { width: 0, height: 0 };
    const hitW = Math.max(bounds.width || 48, MIN_HIT_AREA_PX);
    const hitH = Math.max(bounds.height || 48, MIN_HIT_AREA_PX);
    (sprite as Container).hitArea = new Rectangle(-hitW / 2, -hitH / 2, hitW, hitH);
    (sprite as Container).eventMode = 'static';

    const id = nextHandleId();
    this._handles.set(id, sprite as unknown as Container);

    return { _brand: 'sprite', id } as PixiSpriteHandle;
  }

  createContainer(): IContainerHandle {
    const container = new Container();
    const id = nextHandleId();
    this._handles.set(id, container);
    return { _brand: 'container', id } as PixiContainerHandle;
  }

  addToStage(handle: ISceneHandle): void {
    const id = (handle as PixiSpriteHandle | PixiContainerHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      // All game objects go into the viewport (not app.stage directly)
      // so they participate in zoom/pan
      if (this.viewport) {
        this.viewport.addChild(obj);
      } else {
        this.app.stage.addChild(obj);
      }
    }
  }

  removeFromStage(handle: ISceneHandle): void {
    const id = (handle as PixiSpriteHandle | PixiContainerHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.parent?.removeChild(obj);
    }
  }

  // ── Interaction ──

  setInteractive(handle: ISpriteHandle, enabled: boolean): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.eventMode = enabled ? 'static' : 'none';
    }
  }

  onPointerDown(handle: ISpriteHandle, cb: () => void): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.on('pointerdown', cb);
    }
  }

  // ── Effects ──

  applyGlow(handle: ISpriteHandle, color: number, strength: number): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      const glow = new GlowFilter({
        color,
        outerStrength: strength,
        innerStrength: 0,
        distance: 15,
      });
      obj.filters = [glow as unknown as Filter];
    }
  }

  removeGlow(handle: ISpriteHandle): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.filters = [];
    }
  }

  animateTo(
    handle: ISpriteHandle,
    x: number,
    y: number,
    opts: AnimateOptions
  ): Promise<void> {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);

    if (!obj) {
      return Promise.resolve();
    }

    // Assign to a const so TypeScript's narrowing holds inside the closure
    const target: Container = obj;

    return new Promise<void>((resolve) => {
      const startX = target.x;
      const startY = target.y;
      const duration = opts.duration;
      const startTime = performance.now();

      function tick(now: number): void {
        const elapsed = now - startTime;
        const rawT = Math.min(elapsed / duration, 1);
        const t = easeOutBack(rawT);

        target.x = startX + (x - startX) * t;
        target.y = startY + (y - startY) * t;

        if (rawT < 1) {
          requestAnimationFrame(tick);
        } else {
          // Snap to exact target position at end
          target.x = x;
          target.y = y;
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });
  }

  // ── Viewport ──

  enableViewport(options: ViewportOptions): IViewportHandle {
    this.viewport = new Viewport({
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      worldWidth: options.worldWidth,
      worldHeight: options.worldHeight,
      events: this.app.renderer.events, // CRITICAL: pixi-viewport v6 requires this (research Pitfall 2)
    });

    // Chain all viewport interactions
    this.viewport
      .drag()     // left-click / single-finger drag to pan
      .pinch()    // two-finger pinch to zoom (mobile)
      .wheel()    // scroll-wheel to zoom (desktop)
      .decelerate(); // momentum-based movement after drag

    this.app.stage.addChild(this.viewport);

    return { _brand: 'viewport', id: 'viewport-0' } as PixiViewportHandle;
  }
}
