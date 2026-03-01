import { describe, it, expect, beforeEach } from 'vitest';
import { StubRenderer } from '../StubRenderer.js';
import type {
  IRenderer,
  ISpriteHandle,
  IContainerHandle,
  IViewportHandle,
} from '@bga2/shared-types';

describe('StubRenderer', () => {
  let renderer: StubRenderer;

  beforeEach(() => {
    renderer = new StubRenderer();
  });

  // Test 1: init resolves without error
  it('init() resolves without error', async () => {
    const container = {} as HTMLElement;
    await expect(
      renderer.init(container, { worldWidth: 800, worldHeight: 600 })
    ).resolves.toBeUndefined();
  });

  // Test 2: createSprite returns handle with id
  it('createSprite() returns a handle with an id', () => {
    const handle = renderer.createSprite('tile-blue');
    expect(handle).toBeDefined();
    expect(typeof (handle as unknown as { id: string }).id).toBe('string');
    expect((handle as unknown as { id: string }).id.length).toBeGreaterThan(0);
  });

  // Test 3: createContainer returns handle with id
  it('createContainer() returns a handle with an id', () => {
    const handle = renderer.createContainer();
    expect(handle).toBeDefined();
    expect(typeof (handle as unknown as { id: string }).id).toBe('string');
    expect((handle as unknown as { id: string }).id.length).toBeGreaterThan(0);
  });

  // Test 4: addToStage/removeFromStage track scene objects
  it('addToStage() and removeFromStage() track objects on stage', () => {
    const sprite = renderer.createSprite('tile-blue');
    const container = renderer.createContainer();

    renderer.addToStage(sprite);
    renderer.addToStage(container);

    const stage = renderer.getStageObjects();
    expect(stage).toHaveLength(2);
    expect(stage).toContain(sprite);
    expect(stage).toContain(container);

    renderer.removeFromStage(sprite);
    const stageAfterRemove = renderer.getStageObjects();
    expect(stageAfterRemove).toHaveLength(1);
    expect(stageAfterRemove).not.toContain(sprite);
  });

  // Test 5: applyGlow/removeGlow are no-ops that don't throw
  it('applyGlow() and removeGlow() do not throw', () => {
    const sprite = renderer.createSprite('tile-blue');
    expect(() => renderer.applyGlow(sprite, 0x4a90d9, 3)).not.toThrow();
    expect(() => renderer.removeGlow(sprite)).not.toThrow();
  });

  // Test 6: animateTo resolves immediately
  it('animateTo() resolves immediately without delay', async () => {
    const sprite = renderer.createSprite('tile-blue');
    const start = Date.now();
    await renderer.animateTo(sprite, 100, 200, { duration: 500 });
    const elapsed = Date.now() - start;
    // Should resolve almost immediately (well under the 500ms duration)
    expect(elapsed).toBeLessThan(100);
  });

  // Test 7: setInteractive and onPointerDown register without error
  it('setInteractive() and onPointerDown() register without error', () => {
    const sprite = renderer.createSprite('tile-blue');
    expect(() => renderer.setInteractive(sprite, true)).not.toThrow();
    expect(() => renderer.setInteractive(sprite, false)).not.toThrow();

    const cb = () => {};
    expect(() => renderer.onPointerDown(sprite, cb)).not.toThrow();
  });

  // Test 8: StubRenderer implements IRenderer (type-level check)
  it('StubRenderer satisfies IRenderer interface at runtime', () => {
    // Verify all required IRenderer methods exist on the instance
    const methods: (keyof IRenderer)[] = [
      'init',
      'destroy',
      'resize',
      'createSprite',
      'createContainer',
      'addToStage',
      'removeFromStage',
      'setInteractive',
      'onPointerDown',
      'applyGlow',
      'removeGlow',
      'animateTo',
      'enableViewport',
    ];

    for (const method of methods) {
      expect(typeof renderer[method as keyof StubRenderer]).toBe('function');
    }
  });

  // Additional: triggerPointerDown helper works for tests
  it('triggerPointerDown() invokes registered callback', () => {
    const sprite = renderer.createSprite('tile-blue');
    const handleId = (sprite as unknown as { id: string }).id;
    let called = false;
    renderer.onPointerDown(sprite, () => {
      called = true;
    });
    renderer.triggerPointerDown(handleId);
    expect(called).toBe(true);
  });

  // Additional: getGlowState helper returns glow info
  it('getGlowState() returns glow state after applyGlow/removeGlow', () => {
    const sprite = renderer.createSprite('tile-blue');
    const handleId = (sprite as unknown as { id: string }).id;

    expect(renderer.getGlowState(handleId)).toBeNull();

    renderer.applyGlow(sprite, 0x4a90d9, 3);
    const glow = renderer.getGlowState(handleId);
    expect(glow).not.toBeNull();
    expect(glow?.color).toBe(0x4a90d9);
    expect(glow?.strength).toBe(3);

    renderer.removeGlow(sprite);
    expect(renderer.getGlowState(handleId)).toBeNull();
  });

  // Additional: enableViewport returns IViewportHandle
  it('enableViewport() returns a viewport handle', () => {
    const handle = renderer.enableViewport({
      screenWidth: 800,
      screenHeight: 600,
      worldWidth: 2000,
      worldHeight: 1500,
    });
    expect(handle).toBeDefined();
    expect(typeof (handle as unknown as { id: string }).id).toBe('string');
  });

  // Additional: destroy clears state
  it('destroy() clears internal state', () => {
    const sprite = renderer.createSprite('tile-blue');
    renderer.addToStage(sprite);
    expect(renderer.getStageObjects()).toHaveLength(1);

    renderer.destroy();
    expect(renderer.getStageObjects()).toHaveLength(0);
  });
});
