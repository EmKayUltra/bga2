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
  Container,
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
const TILE_SIZE = 48;
const FACTORY_CIRCLE_R = 68;

// ─── Color palette (warm + clean) ─────────────────────────────────────────────

const COLORS = {
  factoryBg:     0xc9ad87,   // warm tan circle
  factoryStroke:  0xa08060,   // darker tan stroke
  zoneBg:        0xf0ebe3,   // light warm board background
  zoneStroke:    0xd0c4b4,   // warm border
  slotFill:      0xe4ddd3,   // empty slot fill (slightly darker than board bg for visibility)
  slotStroke:    0xb8ada0,   // empty slot border (stronger contrast)
  centerBg:      0xe8e0d4,   // center area (slightly darker than zone)
  centerStroke:  0xc8bca8,
};

/** Convert CSS hex color string (#4A90D9) to numeric hex (0x4A90D9). */
function cssColorToHex(color: string): number {
  return parseInt(color.replace('#', ''), 16);
}

/** Lighten a hex color toward white by a factor (0-1). */
function lightenColor(color: number, factor: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return (lr << 16) | (lg << 8) | lb;
}

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
    const g = new Graphics();

    // Parse textureId to determine what to draw procedurally
    if (textureId.startsWith('piece:')) {
      // Format: "piece:{defId}:{color}:{label}"
      const parts = textureId.split(':');
      const colorStr = parts[2] ?? '#4a90d9';
      const color = cssColorToHex(colorStr);
      // Tile with rounded corners, subtle shadow, and color
      g.roundRect(1, 2, TILE_SIZE - 2, TILE_SIZE - 2, 5).fill({ color: lightenColor(color, 0.35) });
      g.roundRect(0, 0, TILE_SIZE, TILE_SIZE, 6).fill({ color });
      g.stroke({ color: lightenColor(color, -0.15), width: 1.5 });
    } else if (textureId.startsWith('factory-bg:')) {
      // Factory background circle — warm tan
      g.circle(0, 0, FACTORY_CIRCLE_R).fill({ color: COLORS.factoryBg });
      g.stroke({ color: COLORS.factoryStroke, width: 2.5 });
    } else if (textureId.startsWith('zone-bg:')) {
      // Zone/board background rectangle
      const parts = textureId.split(':');
      const w = parseFloat(parts[3] ?? '200');
      const h = parseFloat(parts[4] ?? '120');
      g.roundRect(0, 0, w, h, 10).fill({ color: COLORS.zoneBg });
      g.stroke({ color: COLORS.zoneStroke, width: 1.5 });
    } else if (textureId.startsWith('center-bg:')) {
      // Center area background
      const parts = textureId.split(':');
      const w = parseFloat(parts[3] ?? '200');
      const h = parseFloat(parts[4] ?? '60');
      g.roundRect(0, 0, w, h, 8).fill({ color: COLORS.centerBg });
      g.stroke({ color: COLORS.centerStroke, width: 1.5 });
    } else if (textureId.startsWith('wall-slot:')) {
      // Wall slot with ghost color from Azul pattern
      // Format: "wall-slot:{x}:{y}:{w}:{h}:{colorHex}"
      const parts = textureId.split(':');
      const w = parseFloat(parts[3] ?? '48');
      const h = parseFloat(parts[4] ?? '48');
      const wallColorStr = parts[5] ?? '#c0c0c0';
      const wallColor = cssColorToHex(wallColorStr);
      // Ghost color: lighten toward white by 55%
      const ghostFill = lightenColor(wallColor, 0.55);
      const ghostStroke = lightenColor(wallColor, 0.3);
      g.roundRect(0, 0, w, h, 4).fill({ color: ghostFill });
      g.stroke({ color: ghostStroke, width: 1.5 });
    } else if (textureId.startsWith('slot:')) {
      // Empty slot with clear border (visible against board background)
      const parts = textureId.split(':');
      const w = parseFloat(parts[3] ?? '48');
      const h = parseFloat(parts[4] ?? '48');
      g.roundRect(0, 0, w, h, 4).fill({ color: COLORS.slotFill });
      g.stroke({ color: COLORS.slotStroke, width: 2 });
    } else {
      g.rect(0, 0, 48, 48).fill({ color: 0xcccccc });
    }

    const obj = g as unknown as Container;

    // Enforce 44px minimum touch target (ENG-09)
    obj.hitArea = new Rectangle(0, 0, Math.max(TILE_SIZE, MIN_HIT_AREA_PX), Math.max(TILE_SIZE, MIN_HIT_AREA_PX));
    obj.eventMode = 'static';

    const id = nextHandleId();
    this._handles.set(id, obj);

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

  // ── Positioning ──

  setPosition(handle: ISceneHandle, x: number, y: number): void {
    const id = (handle as PixiSpriteHandle | PixiContainerHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.x = x;
      obj.y = y;
    }
  }

  // ── Interaction ──

  setInteractive(handle: ISpriteHandle, enabled: boolean): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.eventMode = enabled ? 'static' : 'none';
      obj.cursor = enabled ? 'pointer' : 'default';
    }
  }

  onPointerDown(handle: ISpriteHandle, cb: () => void): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.on('pointerdown', cb);
    }
  }

  onPointerOver(handle: ISpriteHandle, cb: () => void): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.on('pointerover', cb);
    }
  }

  onPointerOut(handle: ISpriteHandle, cb: () => void): void {
    const id = (handle as PixiSpriteHandle).id;
    const obj = this._handles.get(id);
    if (obj) {
      obj.on('pointerout', cb);
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

  // ── Z-ordering ──

  bringToFront(handle: ISceneHandle): void {
    const id = (handle as PixiSpriteHandle | PixiContainerHandle).id;
    const obj = this._handles.get(id);
    if (obj && obj.parent) {
      const parent = obj.parent;
      parent.removeChild(obj);
      parent.addChild(obj);
    }
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
      .decelerate() // momentum-based movement after drag
      .clampZoom({ minScale: 0.3, maxScale: 2 });

    // Fit world content into screen and center it
    this.viewport.fit();
    this.viewport.moveCenter(options.worldWidth / 2, options.worldHeight / 2);

    this.app.stage.addChild(this.viewport);

    return { _brand: 'viewport', id: 'viewport-0' } as PixiViewportHandle;
  }
}
