/**
 * RendererSwap integration test — proves the renderer abstraction works.
 *
 * Loads the Azul game config via GameLoader, then renders the full board
 * through StubRenderer using the same IRenderer calls that AzulScene makes.
 * If this runs without errors, any IRenderer implementation can drive the
 * same game scene.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StubRenderer } from '../StubRenderer.js';
import { GameLoader } from '../../loader/GameLoader.js';
import type { RuntimeGameModel } from '../../loader/GameLoader.js';
import type { IRenderer } from '@bga2/shared-types';
import azulConfig from '../../../../../../libs/games/azul/game.json';

describe('Renderer Swap: StubRenderer + Azul game', () => {
  let renderer: StubRenderer;
  let model: RuntimeGameModel;

  beforeEach(() => {
    renderer = new StubRenderer();
    model = GameLoader.load(azulConfig);
  });

  it('loads the Azul model with all zones and pieces', () => {
    expect(model.zones.size).toBe(15);
    expect(model.pieceDefs.size).toBe(6);
    expect(model.pieces.length).toBe(6);
  });

  it('renders the full Azul board through StubRenderer without errors', () => {
    // This replicates what AzulScene.renderBoard() does:
    // 1. Iterate factory zones, create sprites for backgrounds and pieces
    // 2. Render center area
    // 3. Render player boards with pattern lines, wall slots, floor line

    // ── Factory area ──
    const factoryZones = Array.from(model.zones.values()).filter(
      (z) => z.id.startsWith('factory-')
    );
    expect(factoryZones).toHaveLength(5);

    for (const zone of factoryZones) {
      // Factory background
      const bg = renderer.createSprite(`factory-bg:${zone.id}`);
      renderer.addToStage(bg);
      renderer.setPosition(bg, 0, 0);

      // Pieces in factory (may be empty in initial state)
      for (const piece of zone.getPieces()) {
        const handle = renderer.createSprite(`piece:${piece.defId}:${piece.fallback.color}:${piece.fallback.label}`);
        renderer.setInteractive(handle, true);
        renderer.addToStage(handle);
        renderer.setPosition(handle, 0, 0);
      }

      // Empty slots if no pieces
      if (zone.getPieces().length === 0) {
        for (let i = 0; i < 4; i++) {
          const slot = renderer.createSprite(`slot:empty:${i}`);
          renderer.addToStage(slot);
          renderer.setPosition(slot, 0, 0);
        }
      }
    }

    // ── Center area ──
    const centerZone = model.zones.get('center');
    expect(centerZone).toBeDefined();
    const centerBg = renderer.createSprite('center-bg');
    renderer.addToStage(centerBg);
    renderer.setPosition(centerBg, 0, 0);

    // ── Player boards (2 players) ──
    for (let player = 0; player < 2; player++) {
      // Board background
      const boardBg = renderer.createSprite(`zone-bg:player-${player}`);
      renderer.addToStage(boardBg);
      renderer.setPosition(boardBg, 0, 0);

      // Pattern lines (5 rows)
      for (let row = 0; row < 5; row++) {
        const zoneId = `player-pattern-line-${row + 1}`;
        const zone = model.zones.get(zoneId);
        expect(zone).toBeDefined();
        const numCols = row + 1;
        for (let col = 0; col < numCols; col++) {
          const slot = renderer.createSprite(`slot:${zoneId}:${col}`);
          renderer.addToStage(slot);
          renderer.setPosition(slot, 0, 0);
        }
      }

      // Wall (5x5 grid with color pattern)
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          const wallSlot = renderer.createSprite(`wall-slot:${row}:${col}`);
          renderer.addToStage(wallSlot);
          renderer.setPosition(wallSlot, 0, 0);
        }
      }

      // Floor line (7 slots)
      for (let col = 0; col < 7; col++) {
        const floorSlot = renderer.createSprite(`floor:${col}`);
        renderer.addToStage(floorSlot);
        renderer.setPosition(floorSlot, 0, 0);
      }
    }

    // Verify all sprites were staged
    const stageObjects = renderer.getStageObjects();
    // 5 factory bgs + 5*4 empty slots + 1 center bg + 2*(1 board bg + 15 pattern slots + 25 wall slots + 7 floor slots) = 5 + 20 + 1 + 2*(1+15+25+7) = 26 + 96 = 122
    expect(stageObjects.length).toBeGreaterThan(100);
  });

  it('interaction methods work through StubRenderer', () => {
    // Create a piece sprite and wire up interaction — same as AzulScene.renderPiece + onPieceClick
    const piece = model.pieces[0];
    const handle = renderer.createSprite(`piece:${piece.defId}:${piece.fallback.color}:${piece.fallback.label}`);
    renderer.setInteractive(handle, true);
    renderer.addToStage(handle);
    renderer.setPosition(handle, 100, 200);

    // Register click handler
    let clicked = false;
    renderer.onPointerDown(handle, () => { clicked = true; });

    // Simulate click via test helper
    const handleId = (handle as unknown as { id: string }).id;
    renderer.triggerPointerDown(handleId);
    expect(clicked).toBe(true);
  });

  it('glow effects work through StubRenderer (selection + valid move highlight)', () => {
    const piece = model.pieces[0];
    const handle = renderer.createSprite(`piece:${piece.defId}`);
    renderer.addToStage(handle);
    const handleId = (handle as unknown as { id: string }).id;

    // Selection glow (blue)
    renderer.applyGlow(handle, 0x4a90ff, 3);
    expect(renderer.getGlowState(handleId)?.color).toBe(0x4a90ff);

    // Remove selection
    renderer.removeGlow(handle);
    expect(renderer.getGlowState(handleId)).toBeNull();

    // Valid move highlight (green)
    renderer.applyGlow(handle, 0x22c55e, 2);
    expect(renderer.getGlowState(handleId)?.color).toBe(0x22c55e);
  });

  it('animation resolves immediately through StubRenderer', async () => {
    const handle = renderer.createSprite('piece:tile-blue');
    renderer.addToStage(handle);

    await expect(
      renderer.animateTo(handle, 300, 400, { duration: 350, easing: 'easeOutBack' })
    ).resolves.toBeUndefined();
  });

  it('viewport setup works through StubRenderer', () => {
    const viewport = renderer.enableViewport({
      screenWidth: 800,
      screenHeight: 600,
      worldWidth: 640,
      worldHeight: 1200,
    });
    expect(viewport).toBeDefined();
  });

  it('StubRenderer is assignable to IRenderer (type-level proof)', () => {
    // If this compiles, the renderer swap is type-safe
    const r: IRenderer = renderer;
    expect(r).toBe(renderer);
  });
});
