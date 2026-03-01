/**
 * AzulScene — Azul-specific scene layout and rendering.
 *
 * Renders the full Azul board using only IRenderer methods — never PixiJS directly.
 * This is what proves the renderer abstraction works: swapping PixiAdapter for
 * StubRenderer leaves AzulScene running without errors.
 *
 * Board layout (desktop):
 *   ┌───────────────────────────────────┐
 *   │  Factory displays (top area)      │
 *   │  Center area                      │
 *   ├───────────────────────────────────┤
 *   │  Player board 1  │  Player board 2│
 *   │   pattern lines  │  pattern lines │
 *   │   wall (5x5)     │  wall (5x5)   │
 *   │   floor line     │  floor line   │
 *   └───────────────────────────────────┘
 *
 * Visual style: light + clean (white/light background, bright tile colors).
 * All art is styled procedural placeholders (colored rounded squares with labels).
 */

import type {
  IRenderer,
  ISpriteHandle,
  ValidMove,
} from '@bga2/shared-types';
import type { RuntimeGameModel } from '@bga2/engine-core';
import type { Piece } from '@bga2/engine-core';

// ─── Layout constants ─────────────────────────────────────────────────────────

const TILE_SIZE = 48;              // px — each tile is 48x48
const TILE_GAP = 4;               // px — gap between tiles in a zone
const CELL = TILE_SIZE + TILE_GAP; // 52px — cell stride
const FACTORY_RADIUS = 68;        // px — factory display circle radius
const FACTORY_SPACING = 150;      // px — center-to-center distance between factories
const BOARD_PADDING = 16;         // px — padding inside player board containers

// Colors
const SELECTION_GLOW = 0x4a90ff;            // blue selection glow
const VALID_MOVE_GLOW = 0x22c55e;           // green valid-move highlight

// ─── Azul wall color pattern ─────────────────────────────────────────────────
// The Azul wall has a fixed color arrangement — each row shifts one position.
// Colors: Blue, Yellow, Red, Black, Teal (matching piece defs from game.json)
const AZUL_TILE_COLORS = ['#4A90D9', '#F5C542', '#E74C3C', '#2C3E50', '#1ABC9C'];

/** Wall pattern: wallPattern[row][col] = index into AZUL_TILE_COLORS */
const WALL_PATTERN = [
  [0, 1, 2, 3, 4],  // Row 0: B Y R K T
  [4, 0, 1, 2, 3],  // Row 1: T B Y R K
  [3, 4, 0, 1, 2],  // Row 2: K T B Y R
  [2, 3, 4, 0, 1],  // Row 3: R K T B Y
  [1, 2, 3, 4, 0],  // Row 4: Y R K T B
];

// ─── Piece handle map ─────────────────────────────────────────────────────────

/** Tracks sprite handle + position for each rendered piece. */
interface PieceRenderInfo {
  handle: ISpriteHandle;
  x: number;
  y: number;
}

// ─── AzulScene ────────────────────────────────────────────────────────────────

export class AzulScene {
  private renderer: IRenderer;
  private model: RuntimeGameModel;

  /** Maps pieceId -> render info */
  private pieceHandles: Map<string, PieceRenderInfo> = new Map();
  /** Maps pieceId -> click callback */
  private pieceClickHandlers: Map<string, () => void> = new Map();
  /** Currently selected piece ID */
  private selectedPieceId: string | null = null;
  /** Valid move destination zone IDs (for highlight) */
  private highlightedZones: Set<string> = new Set();

  constructor(renderer: IRenderer, model: RuntimeGameModel) {
    this.renderer = renderer;
    this.model = model;
  }

  // ── Board rendering ──────────────────────────────────────────────────────────

  /**
   * Render the full Azul board.
   * Creates containers for factory area, center, and player boards.
   * Positions all zones and renders placeholder tiles.
   */
  renderBoard(): void {
    // Render factory displays at the top
    this.renderFactoryArea();

    // Render center area below factories
    this.renderCenterArea();

    // Render player boards (for Phase 1: 2 players stacked)
    this.renderPlayerBoards();
  }

  /**
   * Render factory displays (5 circular zones at the top).
   * Each factory shows up to 4 colored tiles in a 2x2 arrangement.
   */
  private renderFactoryArea(): void {
    // Find factory zones from the model
    const factoryZones = Array.from(this.model.zones.values()).filter(
      (z) => z.id.startsWith('factory-')
    );

    // Center factory area horizontally in the world (world width = 640)
    const centerX = 320;
    const startY = 80;

    factoryZones.forEach((zone, i) => {
      // Arrange factories in two rows: 3 on top, 2 on bottom centered
      const row = Math.floor(i / 3);
      const col = i % 3;
      // Top row: 3 factories centered; bottom row: 2 factories centered
      const rowWidth = (row === 0 ? 2 : 1) * FACTORY_SPACING;
      const rowStartX = centerX - rowWidth / 2;
      const cx = rowStartX + col * FACTORY_SPACING;
      const cy = startY + row * (FACTORY_RADIUS * 2 + 20);

      // Draw factory background circle (styled placeholder)
      this.drawFactoryBackground(cx, cy);

      // Render pieces in this factory zone (2x2 layout)
      const pieces = zone.getPieces();
      const gridW = 2 * TILE_SIZE + TILE_GAP;
      pieces.forEach((piece, pi) => {
        const tileCol = pi % 2;
        const tileRow = Math.floor(pi / 2);
        const tx = cx - gridW / 2 + tileCol * (TILE_SIZE + TILE_GAP);
        const ty = cy - gridW / 2 + tileRow * (TILE_SIZE + TILE_GAP);
        this.renderPiece(piece, tx, ty);
      });

      // If empty, render placeholder slots
      if (pieces.length === 0) {
        this.drawEmptyFactorySlots(cx, cy);
      }
    });
  }

  /**
   * Render the center area (where leftover tiles accumulate).
   */
  private renderCenterArea(): void {
    const centerZone = this.model.zones.get('center');
    if (!centerZone) return;

    const cx = 320;
    const cy = 340;
    const width = 260;
    const height = 50;

    // Draw center area background (uses center-bg for distinct styling)
    this.drawCenterBackground(cx - width / 2, cy - height / 2, width, height);

    // Render tiles in center (flowing left-to-right)
    const pieces = centerZone.getPieces();
    pieces.forEach((piece, i) => {
      const tx = cx - width / 2 + 10 + (i % 4) * (TILE_SIZE + TILE_GAP);
      const ty = cy - height / 2 + 10 + Math.floor(i / 4) * (TILE_SIZE + TILE_GAP);
      this.renderPiece(piece, tx, ty);
    });
  }

  /**
   * Render player boards in a two-column layout.
   * Each board shows: pattern lines (5 rows), wall (5x5 grid), floor line (1x7).
   */
  private renderPlayerBoards(): void {
    // pattern (5 cells) + gap + wall (5 cells) = 10*CELL + 16 = 536, + 2*padding
    const boardWidth = 10 * CELL + 16 + 2 * BOARD_PADDING;  // 552
    // 5 pattern rows + floor gap + floor row + label + padding
    const boardHeight = 5 * CELL + 8 + CELL + 20 + 2 * BOARD_PADDING; // 360
    const boardStartY = 390;

    // Phase 1: render two player boards stacked vertically (fits better)
    // Center horizontally in world (world width = 640)
    const playerNames = ['Player 1', 'Player 2'];
    playerNames.forEach((name, i) => {
      const bx = (640 - boardWidth) / 2;
      const by = boardStartY + i * (boardHeight + 16);
      this.renderPlayerBoard(bx, by, boardWidth, boardHeight, name, i);
    });
  }

  /**
   * Render a single player's board section.
   */
  private renderPlayerBoard(
    bx: number,
    by: number,
    width: number,
    height: number,
    playerName: string,
    playerIndex: number
  ): void {
    // Board background
    this.drawZoneBackground(bx, by, width, height, '', playerName);

    const contentX = bx + BOARD_PADDING;
    const contentY = by + BOARD_PADDING + 20; // 20px for label area

    // Pattern lines (left side) — rows 1-5, right-aligned
    for (let row = 0; row < 5; row++) {
      const numCols = row + 1;
      const rightEdgeX = contentX + 5 * CELL - TILE_GAP; // align right edge
      const lineY = contentY + row * CELL;

      const zoneId = `player-pattern-line-${row + 1}`;
      const zone = this.model.zones.get(zoneId);
      const pieces = zone?.getPieces() ?? [];

      for (let col = 0; col < numCols; col++) {
        const tx = rightEdgeX - (numCols - col) * CELL + TILE_GAP;
        const ty = lineY;

        if (col < pieces.length) {
          this.renderPiece(pieces[col], tx, ty);
        } else {
          this.drawEmptySlot(tx, ty, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Wall (right side of pattern lines) — 5x5 grid with Azul color pattern
    const wallX = contentX + 5 * CELL + 12;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const tx = wallX + col * CELL;
        const ty = contentY + row * CELL;
        // Use the Azul wall color pattern for ghost-colored slots
        const colorIdx = WALL_PATTERN[row][col];
        const wallColor = AZUL_TILE_COLORS[colorIdx];
        this.drawWallSlot(tx, ty, TILE_SIZE, TILE_SIZE, wallColor);
      }
    }

    // Floor line (bottom) — 7 slots
    const floorY = contentY + 5 * CELL + 8;
    const floorZone = this.model.zones.get('player-floor-line');
    const floorPieces = floorZone?.getPieces() ?? [];
    for (let col = 0; col < 7; col++) {
      const tx = contentX + col * CELL;
      if (col < floorPieces.length) {
        this.renderPiece(floorPieces[col], tx, floorY);
      } else {
        this.drawEmptySlot(tx, floorY, TILE_SIZE, TILE_SIZE);
      }
    }

    // Suppress playerIndex lint warning — used for future per-player data
    void playerIndex;
  }

  // ── Piece rendering ──────────────────────────────────────────────────────────

  /**
   * Render a single piece at the given world position.
   * Creates a sprite using renderer.createSprite. If no asset, the PixiAdapter
   * uses a procedural colored rectangle fallback with the piece color.
   *
   * The textureId encodes piece color info so the adapter can use it for the
   * procedural fallback color. Format: "piece:{defId}:{color}:{label}"
   */
  renderPiece(piece: Piece, x: number, y: number): ISpriteHandle {
    const fb = piece.fallback;
    const textureId = `piece:${piece.defId}:${fb.color}:${fb.label}`;
    const handle = this.renderer.createSprite(textureId);

    this.renderer.setInteractive(handle, true);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);

    // Store position info
    this.pieceHandles.set(piece.id, { handle, x, y });

    return handle;
  }

  /**
   * Register a click handler for a piece by ID.
   * Called by SceneManager to wire up interaction.
   */
  onPieceClick(pieceId: string, cb: () => void): void {
    const info = this.pieceHandles.get(pieceId);
    if (info) {
      this.renderer.onPointerDown(info.handle, cb);
      this.pieceClickHandlers.set(pieceId, cb);
    }
  }

  // ── Selection & highlighting ──────────────────────────────────────────────────

  /**
   * Select a piece and apply blue selection glow.
   */
  selectPiece(pieceId: string): void {
    const info = this.pieceHandles.get(pieceId);
    if (info) {
      this.renderer.applyGlow(info.handle, SELECTION_GLOW, 3);
      this.selectedPieceId = pieceId;
    }
  }

  /**
   * Deselect the current piece, removing its glow.
   */
  deselectPiece(): void {
    if (this.selectedPieceId) {
      const info = this.pieceHandles.get(this.selectedPieceId);
      if (info) {
        this.renderer.removeGlow(info.handle);
      }
      this.selectedPieceId = null;
    }
  }

  /** Return the currently selected piece ID, or null. */
  getSelectedPieceId(): string | null {
    return this.selectedPieceId;
  }

  /**
   * Highlight valid move destinations with green glow.
   * Finds all pieces in the valid target zones and applies glow to them.
   */
  highlightValidMoves(validMoves: ValidMove[]): void {
    this.clearHighlights();

    // Collect all target zone IDs from the valid moves
    const targetZoneIds = new Set(
      validMoves.filter((m) => m.target).map((m) => m.target!)
    );

    this.highlightedZones = targetZoneIds;

    // Apply green glow to pieces in valid destination zones
    for (const [pieceId, info] of this.pieceHandles) {
      const piece = this.model.pieces.find((p) => p.id === pieceId);
      if (piece && targetZoneIds.has(piece.zoneId)) {
        this.renderer.applyGlow(info.handle, VALID_MOVE_GLOW, 2);
      }
    }
  }

  /**
   * Remove all valid-move highlights (does not affect selection glow).
   */
  clearHighlights(): void {
    for (const [pieceId, info] of this.pieceHandles) {
      const piece = this.model.pieces.find((p) => p.id === pieceId);
      if (piece && this.highlightedZones.has(piece.zoneId)) {
        this.renderer.removeGlow(info.handle);
      }
    }
    this.highlightedZones.clear();
  }

  // ── Animation ────────────────────────────────────────────────────────────────

  /**
   * Animate a piece to a new world position with snappy overshoot easing.
   */
  async animatePiece(pieceId: string, targetX: number, targetY: number): Promise<void> {
    const info = this.pieceHandles.get(pieceId);
    if (!info) return;

    await this.renderer.animateTo(info.handle, targetX, targetY, {
      duration: 350,
      easing: 'easeOutBack',
    });

    // Update stored position
    info.x = targetX;
    info.y = targetY;
  }

  /**
   * Brief scale pulse when a tile locks into the wall.
   * Implemented as a fast animate-to-same-position (creates the snappy feel).
   */
  async playPlacementFeedback(pieceId: string): Promise<void> {
    const info = this.pieceHandles.get(pieceId);
    if (!info) return;

    // Animate to same position with a short duration — easeOutBack creates the pulse
    await this.renderer.animateTo(info.handle, info.x, info.y, {
      duration: 180,
      easing: 'easeOutBack',
    });
  }

  // ── Scene update ─────────────────────────────────────────────────────────────

  /**
   * Re-render all pieces based on current model zone assignments.
   * Called after a move is applied to refresh the visual state.
   */
  updateScene(): void {
    // For Phase 1, re-render means removing old sprites and re-drawing
    // In Phase 2 we'd do smart incremental updates
    for (const [, info] of this.pieceHandles) {
      this.renderer.removeFromStage(info.handle);
    }
    this.pieceHandles.clear();
    this.pieceClickHandlers.clear();
    this.selectedPieceId = null;
    this.highlightedZones.clear();

    this.renderBoard();
  }

  // ── Visual primitives ────────────────────────────────────────────────────────

  /**
   * Draw the background circle for a factory display.
   * Uses a container sprite with a placeholder texture key.
   */
  private drawFactoryBackground(cx: number, cy: number): void {
    const handle = this.renderer.createSprite(`factory-bg:${cx}:${cy}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, cx, cy);
  }

  /**
   * Draw empty placeholder slots inside an empty factory (4 greyed squares).
   */
  private drawEmptyFactorySlots(cx: number, cy: number): void {
    // Center a 2x2 grid within the factory circle
    const gridW = 2 * TILE_SIZE + TILE_GAP; // 100
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = cx - gridW / 2 + col * (TILE_SIZE + TILE_GAP);
      const ty = cy - gridW / 2 + row * (TILE_SIZE + TILE_GAP);
      this.drawEmptySlot(tx, ty, TILE_SIZE, TILE_SIZE);
    }
  }

  /**
   * Draw a zone background rectangle with a label.
   */
  private drawZoneBackground(
    x: number, y: number, width: number, height: number,
    _color: string, _label: string
  ): void {
    const handle = this.renderer.createSprite(`zone-bg:${x}:${y}:${width}:${height}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
  }

  /**
   * Draw a single empty slot (grid cell / pattern line position).
   */
  private drawEmptySlot(
    x: number, y: number, width: number, height: number
  ): void {
    const handle = this.renderer.createSprite(`slot:${x}:${y}:${width}:${height}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
  }

  /**
   * Draw a wall slot with the Azul ghost color pattern.
   */
  private drawWallSlot(
    x: number, y: number, width: number, height: number, colorHex: string
  ): void {
    const handle = this.renderer.createSprite(`wall-slot:${x}:${y}:${width}:${height}:${colorHex}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
  }

  /**
   * Draw a center area background with distinct styling.
   */
  private drawCenterBackground(
    x: number, y: number, width: number, height: number
  ): void {
    const handle = this.renderer.createSprite(`center-bg:${x}:${y}:${width}:${height}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
  }
}
