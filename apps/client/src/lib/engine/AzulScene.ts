/**
 * AzulScene — Azul-specific scene layout and rendering.
 *
 * Renders the full Azul board using only IRenderer methods — never PixiJS directly.
 * This is what proves the renderer abstraction works: swapping PixiAdapter for
 * StubRenderer leaves AzulScene running without errors.
 *
 * Board layout (desktop, 2 players):
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
 * For 3-4 players: boards arranged in a 2x2 grid below the factory area.
 *
 * Interaction model (two-step):
 *   Step 1: Player taps a tile in a factory/center → selectSource(zoneId, color)
 *             → tiles of that color glow blue, valid destinations glow green
 *   Step 2: Player taps a highlighted destination (pattern line or floor line)
 *             → onDestinationClick callback fires → SceneManager submits move
 *
 * Visual style: light + clean (white/light background, bright tile colors).
 * All art is styled procedural placeholders (colored rounded squares with labels).
 */

import type {
  IRenderer,
  ISpriteHandle,
  ValidMove,
  GameState,
} from '@bga2/shared-types';
import type { RuntimeGameModel } from '@bga2/engine-core';

// ─── Layout constants ─────────────────────────────────────────────────────────

const TILE_SIZE = 44;              // px — each tile is 44x44 (slightly smaller for 4P fit)
const TILE_GAP = 4;               // px — gap between tiles in a zone
const CELL = TILE_SIZE + TILE_GAP; // 48px — cell stride
const FACTORY_RADIUS = 64;        // px — factory display circle radius
const FACTORY_SPACING = 140;      // px — center-to-center distance between factories
const BOARD_PADDING = 14;         // px — padding inside player board containers

// Colors
const SELECTION_GLOW = 0x4a90ff;   // blue — selected source tile
const VALID_MOVE_GLOW = 0x22c55e;  // green — valid destination
const ACTIVE_PLAYER_BORDER = 0x4a90ff; // blue border on active player's board
const HOVER_SOURCE_GLOW = 0x8ab4f8;    // light blue — hover over source tile
const HOVER_DEST_GLOW = 0x86efac;      // light green — hover over destination slot

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

// ─── Color helpers ────────────────────────────────────────────────────────────

/** Map piece defId to CSS hex color. */
const COLOR_MAP: Record<string, string> = {
  blue: '#4A90D9',
  yellow: '#F5C542',
  red: '#E74C3C',
  black: '#2C3E50',
  teal: '#1ABC9C',
  white: '#D4E4F7',
  'tile-blue': '#4A90D9',
  'tile-yellow': '#F5C542',
  'tile-red': '#E74C3C',
  'tile-black': '#2C3E50',
  'tile-teal': '#1ABC9C',
  'tile-white': '#D4E4F7',
};

/** Map piece defId to short label. */
const LABEL_MAP: Record<string, string> = {
  blue: 'B', yellow: 'Y', red: 'R', black: 'K', teal: 'T', white: 'W',
  'tile-blue': 'B', 'tile-yellow': 'Y', 'tile-red': 'R', 'tile-black': 'K', 'tile-teal': 'T', 'tile-white': 'W',
};

// ─── Sprite handle map ────────────────────────────────────────────────────────

/** Tracks sprite handle + position + metadata for each rendered element. */
interface SpriteInfo {
  handle: ISpriteHandle;
  x: number;
  y: number;
  zoneId?: string;   // which zone this element belongs to
  color?: string;    // tile color (for source matching)
  pieceId?: string;  // server-side piece instance ID
}

// ─── AzulScene ────────────────────────────────────────────────────────────────

export class AzulScene {
  private renderer: IRenderer;
  private model: RuntimeGameModel;

  /** All rendered sprites keyed by a local ID. */
  private sprites: Map<string, SpriteInfo> = new Map();

  /** Sprites highlighted as valid destinations (for clearing). */
  private destinationHighlights: Set<string> = new Set();
  /** Sprites highlighted as selected source tiles (for clearing). */
  private sourceHighlights: Set<string> = new Set();
  /** Sprites currently showing hover glow (tracked separately from selection). */
  private hoverHighlights: Set<string> = new Set();

  /** Active player board border sprites (keyed by playerIndex). */
  private boardBorderHandles: Map<number, ISpriteHandle> = new Map();

  /** Callback fired when player clicks a tile in a source zone. */
  private sourceClickCallback: ((zoneId: string, color: string) => void) | null = null;
  /** Callback fired when player clicks a destination zone. */
  private destinationClickCallback: ((zoneId: string) => void) | null = null;

  /** Track which destination zone sprite IDs are clickable. */
  private destinationZoneIds: Set<string> = new Set();

  /** Sprite ID counter for unique keys. */
  private spriteCounter = 0;

  constructor(renderer: IRenderer, model: RuntimeGameModel) {
    this.renderer = renderer;
    this.model = model;
  }

  // ── Callback registration ─────────────────────────────────────────────────────

  /**
   * Register callback for source tile clicks (factory/center tiles).
   */
  onSourceClick(cb: (zoneId: string, color: string) => void): void {
    this.sourceClickCallback = cb;
  }

  /**
   * Register callback for destination zone clicks (pattern lines / floor line).
   */
  onDestinationClick(cb: (zoneId: string) => void): void {
    this.destinationClickCallback = cb;
  }

  // ── Board rendering ──────────────────────────────────────────────────────────

  /**
   * Render the full Azul board.
   * Accepts optional real GameState for dynamic player count + tile data.
   * Falls back to model-based rendering if no state provided (offline mode).
   */
  renderBoard(gameState?: GameState): void {
    const playerCount = gameState?.players.length ?? 2;
    const zoneCount = gameState ? Object.keys(gameState.zones).length : this.model.zones.size;
    console.log(`[AzulScene] renderBoard — players:${playerCount}, zones:${zoneCount}`);

    // Render factory/center area at the top
    this.renderFactoryArea(gameState);
    this.renderCenterArea(gameState);

    // Render player boards
    this.renderPlayerBoards(playerCount, gameState);
  }

  /**
   * Re-render the entire board from new server state.
   * Clears all existing sprites and redraws.
   */
  updateFromState(state: GameState): void {
    this.clearAll();
    this.renderBoard(state);
  }

  /**
   * Render factory displays.
   * Uses real GameState zones if available, otherwise falls back to model zones.
   */
  private renderFactoryArea(gameState?: GameState): void {
    let factoryZoneIds: string[];

    if (gameState) {
      factoryZoneIds = Object.keys(gameState.zones).filter((id) => /^factory-\d+$/.test(id));
    } else {
      factoryZoneIds = Array.from(this.model.zones.keys()).filter((id) => /^factory-\d+$/.test(id));
    }

    const centerX = 320;
    const startY = 80;
    const count = factoryZoneIds.length;

    factoryZoneIds.forEach((zoneId, i) => {
      // Arrange factories in rows of 3 (top), then remainder (bottom)
      const perRow = Math.min(3, Math.ceil(count / 2));
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = row === 0 ? Math.min(perRow, count) : count - perRow;
      const rowWidth = (rowCount - 1) * FACTORY_SPACING;
      const cx = centerX - rowWidth / 2 + col * FACTORY_SPACING;
      const cy = startY + row * (FACTORY_RADIUS * 2 + 16);

      // Draw factory background
      this.drawFactoryBackground(cx, cy, zoneId);

      // Render tiles from server state or model
      let pieces: Array<{ defId: string; id: string }> = [];
      if (gameState && gameState.zones[zoneId]) {
        pieces = gameState.zones[zoneId].pieces.map((p) => ({ defId: p.defId, id: p.id }));
      } else {
        const modelZone = this.model.zones.get(zoneId);
        if (modelZone) {
          pieces = modelZone.getPieces().map((p) => ({ defId: p.defId, id: p.id }));
        }
      }

      const gridW = 2 * TILE_SIZE + TILE_GAP;
      if (pieces.length > 0) {
        pieces.forEach((piece, pi) => {
          const tileCol = pi % 2;
          const tileRow = Math.floor(pi / 2);
          const tx = cx - gridW / 2 + tileCol * (TILE_SIZE + TILE_GAP);
          const ty = cy - gridW / 2 + tileRow * (TILE_SIZE + TILE_GAP);
          this.renderSourceTile(tx, ty, piece.defId, piece.id, zoneId);
        });
      } else {
        this.drawEmptyFactorySlots(cx, cy);
      }
    });
  }

  /**
   * Render the center area.
   */
  private renderCenterArea(gameState?: GameState): void {
    const cx = 320;
    const cy = 350;
    const width = 280;
    const height = 60;

    this.drawCenterBackground(cx - width / 2, cy - height / 2, width, height);

    let pieces: Array<{ defId: string; id: string }> = [];
    if (gameState && gameState.zones['center']) {
      pieces = gameState.zones['center'].pieces.map((p) => ({ defId: p.defId, id: p.id }));
    } else {
      const centerZone = this.model.zones.get('center');
      if (centerZone) {
        pieces = centerZone.getPieces().map((p) => ({ defId: p.defId, id: p.id }));
      }
    }

    pieces.forEach((piece, i) => {
      if (piece.defId === 'first-player-token') {
        // Render first-player token distinctly
        const tx = cx - width / 2 + 10;
        const ty = cy - height / 2 + 8;
        this.renderPrimitiveTile(tx, ty, '#FFFFFF', '1', `center:fpt:${i}`);
        return;
      }
      const col = i % 5;
      const row = Math.floor(i / 5);
      const tx = cx - width / 2 + 10 + col * (TILE_SIZE + TILE_GAP);
      const ty = cy - height / 2 + 8 + row * (TILE_SIZE + TILE_GAP);
      this.renderSourceTile(tx, ty, piece.defId, piece.id, 'center');
    });
  }

  /**
   * Render player boards in an appropriate layout:
   * - 2 players: side-by-side (or stacked if narrow)
   * - 3 players: 2 on top, 1 on bottom (centered)
   * - 4 players: 2x2 grid
   */
  private renderPlayerBoards(playerCount: number, gameState?: GameState): void {
    const playerNames = gameState?.players.map((p) => p.name) ?? ['Player 1', 'Player 2'];
    const activeIndex = gameState?.currentPlayerIndex ?? 0;

    // Board dimensions
    const boardWidth = 10 * CELL + 16 + 2 * BOARD_PADDING;
    const boardHeight = 5 * CELL + 8 + CELL + 20 + 2 * BOARD_PADDING;
    const boardStartY = 420;
    const worldW = 640;
    const boardGap = 12;

    // Determine layout based on player count
    const cols = playerCount <= 2 ? 1 : 2;
    const colW = cols === 1
      ? boardWidth
      : Math.min(boardWidth, (worldW - boardGap * (cols - 1)) / cols);

    for (let i = 0; i < playerCount; i++) {
      const col = playerCount <= 2 ? 0 : (i % 2);
      const row = playerCount <= 2 ? i : Math.floor(i / 2);

      let bx: number;
      if (playerCount <= 2) {
        // Single column, centered
        bx = (worldW - boardWidth) / 2;
      } else {
        // Two columns
        const totalW = cols * colW + (cols - 1) * boardGap;
        bx = (worldW - totalW) / 2 + col * (colW + boardGap);
      }
      const by = boardStartY + row * (boardHeight + boardGap);
      const isActive = i === activeIndex;

      this.renderPlayerBoard(bx, by, colW, boardHeight, playerNames[i] ?? `Player ${i + 1}`, i, isActive, gameState);
    }
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
    playerIndex: number,
    isActive: boolean,
    gameState?: GameState
  ): void {
    // Board background (with active player border)
    const bgKey = `board-bg:${playerIndex}`;
    const bgHandle = this.renderer.createSprite(
      `zone-bg:${bx}:${by}:${width}:${height}:${isActive ? 'active' : 'inactive'}:${playerName}`
    );
    this.renderer.addToStage(bgHandle);
    this.renderer.setPosition(bgHandle, bx, by);
    this.sprites.set(bgKey, { handle: bgHandle, x: bx, y: by });

    if (isActive) {
      // Store border handle for later updates
      this.boardBorderHandles.set(playerIndex, bgHandle);
      this.renderer.applyGlow(bgHandle, ACTIVE_PLAYER_BORDER, 1);
    }

    const contentX = bx + BOARD_PADDING;
    const contentY = by + BOARD_PADDING + 20; // 20px for label area

    // Pattern lines (left side) — rows 1-5, right-aligned
    for (let row = 0; row < 5; row++) {
      const numCols = row + 1;
      const rightEdgeX = contentX + 5 * CELL - TILE_GAP;
      const lineY = contentY + row * CELL;

      // Zone ID in server state: "player-{i}-pattern-line-{row+1}"
      const serverZoneId = `player-${playerIndex}-pattern-line-${row + 1}`;
      const localZoneId = `player-pattern-line-${row + 1}`;

      let pieces: Array<{ defId: string; id: string }> = [];
      if (gameState && gameState.zones[serverZoneId]) {
        pieces = gameState.zones[serverZoneId].pieces.map((p) => ({ defId: p.defId, id: p.id }));
      } else {
        const zone = this.model.zones.get(localZoneId);
        if (zone) {
          pieces = zone.getPieces().map((p) => ({ defId: p.defId, id: p.id }));
        }
      }

      for (let col = 0; col < numCols; col++) {
        const tx = rightEdgeX - (numCols - col) * CELL + TILE_GAP;
        const ty = lineY;

        if (col < pieces.length) {
          const piece = pieces[col];
          const color = COLOR_MAP[piece.defId] ?? '#888';
          const label = LABEL_MAP[piece.defId] ?? '?';
          const key = `pattern:${playerIndex}:${row}:${col}`;
          this.renderPrimitiveTile(tx, ty, color, label, key);
        } else {
          // Empty slot — make it clickable as a destination (only for pattern line slots)
          const key = `pattern-slot:${playerIndex}:${row}:${col}`;
          const slotHandle = this.drawEmptySlot(tx, ty, TILE_SIZE, TILE_SIZE);
          this.sprites.set(key, { handle: slotHandle, x: tx, y: ty, zoneId: serverZoneId });

          // Register as destination click target
          this.renderer.setInteractive(slotHandle, true);
          this.renderer.onPointerDown(slotHandle, () => {
            console.log(`[AzulScene] destinationClick — zoneId:'${serverZoneId}'`);
            this.destinationClickCallback?.(serverZoneId);
          });
          this.destinationZoneIds.add(serverZoneId);

          // Hover effects — subtle glow on hover, unless already highlighted as valid destination
          this.renderer.onPointerOver(slotHandle, () => {
            if (!this.destinationHighlights.has(key)) {
              this.renderer.applyGlow(slotHandle, HOVER_DEST_GLOW, 1);
              this.hoverHighlights.add(key);
            }
          });
          this.renderer.onPointerOut(slotHandle, () => {
            if (this.hoverHighlights.has(key)) {
              this.hoverHighlights.delete(key);
              if (!this.destinationHighlights.has(key)) {
                this.renderer.removeGlow(slotHandle);
              }
            }
          });
        }
      }
    }

    // Wall (right side of pattern lines) — 5x5 grid with Azul color pattern
    const wallX = contentX + 5 * CELL + 12;
    const serverWallZoneId = `player-${playerIndex}-wall`;

    // Get placed wall tiles from server state
    const wallPieces = gameState?.zones[serverWallZoneId]?.pieces ?? [];

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const tx = wallX + col * CELL;
        const ty = contentY + row * CELL;
        const colorIdx = WALL_PATTERN[row][col];
        const wallColor = AZUL_TILE_COLORS[colorIdx];

        // Check if this cell has a tile placed
        const placedTile = wallPieces.find((p) => {
          const pos = p.position as { row?: number; col?: number } | undefined;
          return pos && pos.row === row && pos.col === col;
        });

        if (placedTile) {
          const color = COLOR_MAP[placedTile.defId] ?? wallColor;
          const label = LABEL_MAP[placedTile.defId] ?? '?';
          this.renderPrimitiveTile(tx, ty, color, label, `wall:${playerIndex}:${row}:${col}`);
        } else {
          this.drawWallSlot(tx, ty, TILE_SIZE, TILE_SIZE, wallColor);
        }
      }
    }

    // Floor line (bottom) — 7 slots
    const floorY = contentY + 5 * CELL + 8;
    const serverFloorZoneId = `player-${playerIndex}-floor-line`;
    const localFloorZoneId = 'player-floor-line';

    let floorPieces: Array<{ defId: string; id: string }> = [];
    if (gameState && gameState.zones[serverFloorZoneId]) {
      floorPieces = gameState.zones[serverFloorZoneId].pieces.map((p) => ({ defId: p.defId, id: p.id }));
    } else {
      const floorZone = this.model.zones.get(localFloorZoneId);
      if (floorZone) {
        floorPieces = floorZone.getPieces().map((p) => ({ defId: p.defId, id: p.id }));
      }
    }

    for (let col = 0; col < 7; col++) {
      const tx = contentX + col * CELL;

      if (col < floorPieces.length) {
        const piece = floorPieces[col];
        const color = COLOR_MAP[piece.defId] ?? '#888';
        const label = LABEL_MAP[piece.defId] ?? '?';
        this.renderPrimitiveTile(tx, floorY, color, label, `floor:${playerIndex}:${col}`);
      } else {
        // Empty floor slot — clickable as destination (floor line = patternLineRow 0)
        const key = `floor-slot:${playerIndex}:${col}`;
        const slotHandle = this.drawEmptySlot(tx, floorY, TILE_SIZE, TILE_SIZE);
        this.sprites.set(key, { handle: slotHandle, x: tx, y: floorY, zoneId: serverFloorZoneId });

        this.renderer.setInteractive(slotHandle, true);
        this.renderer.onPointerDown(slotHandle, () => {
          console.log(`[AzulScene] destinationClick — zoneId:'${serverFloorZoneId}'`);
          this.destinationClickCallback?.(serverFloorZoneId);
        });
        this.destinationZoneIds.add(serverFloorZoneId);

        // Hover effects for floor line slots
        this.renderer.onPointerOver(slotHandle, () => {
          if (!this.destinationHighlights.has(key)) {
            this.renderer.applyGlow(slotHandle, HOVER_DEST_GLOW, 1);
            this.hoverHighlights.add(key);
          }
        });
        this.renderer.onPointerOut(slotHandle, () => {
          if (this.hoverHighlights.has(key)) {
            this.hoverHighlights.delete(key);
            if (!this.destinationHighlights.has(key)) {
              this.renderer.removeGlow(slotHandle);
            }
          }
        });
      }
    }
  }

  // ── Interaction methods ───────────────────────────────────────────────────────

  /**
   * Select a source zone: highlight tiles of the specified color with blue glow,
   * then highlight valid destination pattern lines with green glow.
   */
  selectSource(zoneId: string, color: string, validMoves: ValidMove[]): void {
    const validTargets = new Set(validMoves.map(vm => vm.target).filter(Boolean));
    console.log(`[AzulScene] selectSource — zoneId:'${zoneId}', color:'${color}', validMoves:${validMoves.length}, destinations:${validTargets.size}`);
    this.clearSelectionHighlights();

    // Highlight matching tiles in the source zone with blue glow
    for (const [key, info] of this.sprites) {
      if (info.zoneId === zoneId && info.color === color) {
        this.renderer.applyGlow(info.handle, SELECTION_GLOW, 3);
        this.sourceHighlights.add(key);
      }
    }

    // Highlight valid destination zones with green glow
    this.highlightValidDestinations(validMoves);
  }

  /**
   * Deselect the current source — clear all selection and destination highlights.
   */
  deselectSource(): void {
    this.clearSelectionHighlights();
  }

  /**
   * Highlight valid destination zones (pattern lines + floor line) with green glow.
   */
  highlightValidDestinations(validMoves: ValidMove[]): void {
    // Clear previous destination highlights
    for (const key of this.destinationHighlights) {
      const info = this.sprites.get(key);
      if (info) this.renderer.removeGlow(info.handle);
    }
    this.destinationHighlights.clear();

    // Collect target zone IDs from valid moves
    const validTargetZones = new Set<string>();
    for (const vm of validMoves) {
      if (vm.target) validTargetZones.add(vm.target);
    }

    // Apply green glow to destination slots in valid zones
    for (const [key, info] of this.sprites) {
      if (info.zoneId && validTargetZones.has(info.zoneId)) {
        this.renderer.applyGlow(info.handle, VALID_MOVE_GLOW, 2);
        this.destinationHighlights.add(key);
      }
    }
  }

  /**
   * Set the active player — add colored border to their board, remove from others.
   */
  setActivePlayer(playerIndex: number): void {
    // Remove all board glows
    for (const [idx, handle] of this.boardBorderHandles) {
      if (idx !== playerIndex) {
        this.renderer.removeGlow(handle);
      }
    }

    // Apply to new active player
    const activeHandle = this.boardBorderHandles.get(playerIndex);
    if (activeHandle) {
      this.renderer.applyGlow(activeHandle, ACTIVE_PLAYER_BORDER, 1);
    }
  }

  /**
   * Animate tiles moving from source zone to destination zone.
   * Finds sprites in the source zone with the given color and animates them.
   */
  async animateMove(sourceZone: string, color: string, targetZoneId: string): Promise<void> {
    // Find target position (first slot in destination zone)
    let targetX = 320;
    let targetY = 400;
    for (const [, info] of this.sprites) {
      if (info.zoneId === targetZoneId) {
        targetX = info.x;
        targetY = info.y;
        break;
      }
    }

    // Bring source tiles to front and animate them above board backgrounds
    const animations: Promise<void>[] = [];
    for (const [, info] of this.sprites) {
      if (info.zoneId === sourceZone && info.color === color) {
        this.renderer.bringToFront(info.handle);
        animations.push(
          this.renderer.animateTo(info.handle, targetX, targetY, {
            duration: 350,
            easing: 'easeOutBack',
          })
        );
      }
    }

    if (animations.length > 0) {
      await Promise.all(animations);
    }
  }

  // ── Piece rendering ──────────────────────────────────────────────────────────

  /**
   * Render a source tile (in factory or center) that can be clicked.
   */
  private renderSourceTile(
    x: number, y: number,
    defId: string, pieceId: string,
    zoneId: string
  ): void {
    const color = COLOR_MAP[defId] ?? '#888888';
    const label = LABEL_MAP[defId] ?? '?';
    const key = `src:${zoneId}:${pieceId}`;

    const textureId = `piece:${defId}:${color}:${label}`;
    const handle = this.renderer.createSprite(textureId);
    this.renderer.setInteractive(handle, true);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);

    this.sprites.set(key, { handle, x, y, zoneId, color: defId, pieceId });

    // Wire source click
    this.renderer.onPointerDown(handle, () => {
      this.sourceClickCallback?.(zoneId, defId);
    });

    // Hover effects — subtle glow on hover, unless already selected
    this.renderer.onPointerOver(handle, () => {
      if (!this.sourceHighlights.has(key)) {
        this.renderer.applyGlow(handle, HOVER_SOURCE_GLOW, 1.5);
        this.hoverHighlights.add(key);
      }
    });
    this.renderer.onPointerOut(handle, () => {
      if (this.hoverHighlights.has(key)) {
        this.hoverHighlights.delete(key);
        if (!this.sourceHighlights.has(key)) {
          this.renderer.removeGlow(handle);
        }
      }
    });
  }

  /**
   * Render a plain tile (non-interactive wall or pattern line tile).
   */
  private renderPrimitiveTile(
    x: number, y: number,
    color: string, label: string,
    key: string
  ): void {
    const textureId = `piece:${label}:${color}:${label}`;
    const handle = this.renderer.createSprite(textureId);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
    this.sprites.set(key, { handle, x, y });
  }

  // ── Visual primitives ────────────────────────────────────────────────────────

  private drawFactoryBackground(cx: number, cy: number, zoneId: string): void {
    const handle = this.renderer.createSprite(`factory-bg:${zoneId}:${cx}:${cy}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, cx, cy);
    this.sprites.set(`factory-bg:${zoneId}`, { handle, x: cx, y: cy });
  }

  private drawEmptyFactorySlots(cx: number, cy: number): void {
    const gridW = 2 * TILE_SIZE + TILE_GAP;
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = cx - gridW / 2 + col * (TILE_SIZE + TILE_GAP);
      const ty = cy - gridW / 2 + row * (TILE_SIZE + TILE_GAP);
      this.drawEmptySlot(tx, ty, TILE_SIZE, TILE_SIZE);
    }
  }

  private drawEmptySlot(x: number, y: number, width: number, height: number): ISpriteHandle {
    const key = `slot:${this.spriteCounter++}:${x}:${y}`;
    const handle = this.renderer.createSprite(`slot:${x}:${y}:${width}:${height}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
    // Don't add to sprites map here — caller may add with richer metadata
    void key;
    return handle;
  }

  private drawWallSlot(x: number, y: number, width: number, height: number, colorHex: string): void {
    const handle = this.renderer.createSprite(`wall-slot:${x}:${y}:${width}:${height}:${colorHex}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
  }

  private drawCenterBackground(x: number, y: number, width: number, height: number): void {
    const handle = this.renderer.createSprite(`center-bg:${x}:${y}:${width}:${height}`);
    this.renderer.addToStage(handle);
    this.renderer.setPosition(handle, x, y);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  /**
   * Clear all selection and destination highlights without removing sprites.
   */
  private clearSelectionHighlights(): void {
    for (const key of this.sourceHighlights) {
      const info = this.sprites.get(key);
      if (info) this.renderer.removeGlow(info.handle);
    }
    this.sourceHighlights.clear();

    for (const key of this.destinationHighlights) {
      const info = this.sprites.get(key);
      if (info) this.renderer.removeGlow(info.handle);
    }
    this.destinationHighlights.clear();
  }

  /**
   * Clear all sprites from the stage (for updateFromState full re-render).
   */
  private clearAll(): void {
    for (const [, info] of this.sprites) {
      this.renderer.removeFromStage(info.handle);
    }
    this.sprites.clear();
    this.sourceHighlights.clear();
    this.destinationHighlights.clear();
    this.hoverHighlights.clear();
    this.destinationZoneIds.clear();
    this.boardBorderHandles.clear();
    this.spriteCounter = 0;
  }

  // ── Legacy compatibility (kept for tests that may call these) ─────────────────

  /**
   * @deprecated Use selectSource() instead. Kept for backward compatibility.
   */
  selectPiece(pieceId: string): void {
    // No-op in Phase 2 — selectSource is the new API
    void pieceId;
  }

  /**
   * @deprecated Use deselectSource() instead.
   */
  deselectPiece(): void {
    this.deselectSource();
  }

  /**
   * @deprecated
   */
  getSelectedPieceId(): string | null {
    return null;
  }

  /**
   * @deprecated Use highlightValidDestinations() instead.
   */
  highlightValidMoves(validMoves: ValidMove[]): void {
    this.highlightValidDestinations(validMoves);
  }

  /**
   * @deprecated Use deselectSource() instead.
   */
  clearHighlights(): void {
    this.clearSelectionHighlights();
  }

  /**
   * @deprecated Use updateFromState() instead.
   */
  updateScene(): void {
    this.clearAll();
    this.renderBoard();
  }

  /**
   * @deprecated Use renderSourceTile-based approach.
   * Kept for compatibility with any code that calls onPieceClick on AzulScene.
   */
  onPieceClick(_pieceId: string, _cb: () => void): void {
    // No-op — click wiring is now done inside AzulScene via onSourceClick/onDestinationClick
  }

  /**
   * @deprecated Use animateMove() instead.
   */
  async animatePiece(pieceId: string, targetX: number, targetY: number): Promise<void> {
    // Find any sprite and animate it
    for (const [key, info] of this.sprites) {
      if (key.includes(pieceId)) {
        await this.renderer.animateTo(info.handle, targetX, targetY, {
          duration: 350,
          easing: 'easeOutBack',
        });
        return;
      }
    }
  }

  /**
   * @deprecated
   */
  async playPlacementFeedback(_pieceId: string): Promise<void> {
    // No-op in Phase 2
  }
}
