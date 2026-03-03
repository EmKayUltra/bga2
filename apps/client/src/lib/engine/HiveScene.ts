/**
 * HiveScene — Visual renderer for the Hive board game.
 *
 * Renders hex-based board, player hands, and handles two-step click-to-move
 * interaction. Uses only IRenderer primitives (no direct PixiJS imports).
 *
 * Layout (1000×1000 world):
 *   - Player 0 hand at top (Y=50)
 *   - Board center at (500, 500)
 *   - Player 1 hand at bottom (Y=950)
 *
 * Interaction:
 *   Step 1: Click a hand piece or board piece → blue glow, green glow on valid targets
 *   Step 2: Click a valid target hex → fire onMove callback
 *   Beetle stacking: clicking a highlighted occupied hex acts as target click
 */

import type {
  IRenderer,
  ISpriteHandle,
  GameState,
} from '@bga2/shared-types';

// ─── Layout constants ────────────────────────────────────────────────────────

const HEX_SIZE = 30;
const BOARD_CENTER_X = 500;
const BOARD_CENTER_Y = 500;
const HAND_Y_P0 = 50;
const HAND_Y_P1 = 950;
const HAND_START_X = 80;
const HAND_SPACING = 65;
const STACK_Y_OFFSET = -4; // Y offset per stack level

// ─── Glow colors ─────────────────────────────────────────────────────────────

const SELECTION_GLOW = 0x4a90ff;   // blue — selected piece
const VALID_MOVE_GLOW = 0x22c55e;  // green — valid destination
const HOVER_GLOW = 0x8ab4f8;      // light blue — hover feedback

// ─── Piece config from game.json ─────────────────────────────────────────────

const PIECE_CONFIG: Record<string, { color: string; label: string }> = {
  'queen-bee':    { color: '#F5C542', label: 'Q' },
  'beetle':       { color: '#8E44AD', label: 'B' },
  'grasshopper':  { color: '#2ECC71', label: 'G' },
  'spider':       { color: '#A0522D', label: 'S' },
  'soldier-ant':  { color: '#4A90D9', label: 'A' },
};

// ─── Hex coordinate math ─────────────────────────────────────────────────────

function hexToPixel(q: number, r: number): { x: number; y: number } {
  // Pointy-top axial → pixel, centered on BOARD_CENTER
  const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + BOARD_CENTER_X;
  const y = HEX_SIZE * (1.5 * r) + BOARD_CENTER_Y;
  return { x, y };
}

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

function hexNeighborKeys(q: number, r: number): string[] {
  return HEX_DIRECTIONS.map(d => hexKey(q + d.q, r + d.r));
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface HiveValidMove {
  action: string;
  source?: string;
  target?: string;
  pieceId?: string;
  description?: string;
  data?: { q: number; r: number };
}

interface HivePieceState {
  id: string;
  defId: string;
  zoneId: string;
  state?: {
    q: number;
    r: number;
    stackLevel: number;
    owner: number;
  };
}

interface SpriteEntry {
  handle: ISpriteHandle;
  x: number;
  y: number;
}

interface MovePayload {
  action: string;
  source?: string;
  target?: string;
  pieceId?: string;
  data?: { q: number; r: number };
}

// ─── HiveScene ───────────────────────────────────────────────────────────────

export class HiveScene {
  private renderer: IRenderer;
  private sprites: Map<string, SpriteEntry> = new Map();
  private moveCallback: ((move: MovePayload) => void) | null = null;
  private hoverCallback: ((info: string) => void) | null = null;

  // Selection state
  private selectedPieceId: string | null = null;
  private selectedMoves: HiveValidMove[] = [];
  private highlightedKeys: Set<string> = new Set();
  private hoverKeys: Set<string> = new Set();

  // Cached state for click handlers
  private lastState: GameState | null = null;
  private lastValidMoves: HiveValidMove[] = [];

  constructor(renderer: IRenderer) {
    this.renderer = renderer;
  }

  /** Register callback for when a move is completed via click interaction. */
  onMove(cb: (move: MovePayload) => void): void {
    this.moveCallback = cb;
  }

  /** Register callback for hover tooltip info. */
  onHover(cb: (info: string) => void): void {
    this.hoverCallback = cb;
  }

  /** Full clear + redraw from game state. */
  renderState(state: GameState, validMoves: HiveValidMove[]): void {
    this.lastState = state;
    this.lastValidMoves = validMoves;
    this.clearSelection();
    this.clearAll();

    const boardZone = state.zones['board'];
    const boardPieces: HivePieceState[] = boardZone ? (boardZone.pieces as unknown as HivePieceState[]) : [];

    // Render board pieces
    this.renderBoardPieces(boardPieces, state.currentPlayerIndex, validMoves);

    // Render perimeter ghosts (all unique target hexes from valid moves that are empty)
    this.renderPerimeterGhosts(boardPieces, validMoves);

    // Render player hands
    for (let p = 0; p < state.players.length; p++) {
      const handZoneId = `player-${p}-hand`;
      const handZone = state.zones[handZoneId];
      const handPieces: HivePieceState[] = handZone ? (handZone.pieces as unknown as HivePieceState[]) : [];
      this.renderHand(handPieces, p, state.currentPlayerIndex, validMoves);
    }
  }

  /** Cleanup all sprites. */
  destroy(): void {
    this.clearAll();
    this.moveCallback = null;
  }

  // ── Board piece rendering ──────────────────────────────────────────────────

  private renderBoardPieces(
    boardPieces: HivePieceState[],
    currentPlayerIndex: number,
    validMoves: HiveValidMove[]
  ): void {
    // Sort by stackLevel so lower pieces render first
    const sorted = [...boardPieces].sort(
      (a, b) => (a.state?.stackLevel ?? 0) - (b.state?.stackLevel ?? 0)
    );

    for (const piece of sorted) {
      if (!piece.state) continue;
      const { q, r, stackLevel, owner } = piece.state;
      const config = PIECE_CONFIG[piece.defId];
      if (!config) continue;

      const pos = hexToPixel(q, r);
      const yOffset = stackLevel * STACK_Y_OFFSET;

      const textureId = `hex-piece:${piece.defId}:${config.color}:${config.label}:${owner}`;
      const handle = this.renderer.createSprite(textureId);
      this.renderer.addToStage(handle);
      this.renderer.setPosition(handle, pos.x, pos.y + yOffset);

      if (stackLevel > 0) {
        this.renderer.bringToFront(handle);
      }

      const key = `board:${piece.id}`;
      this.sprites.set(key, { handle, x: pos.x, y: pos.y + yOffset });

      // Make clickable if it's the current player's piece and it has moves
      const pieceMoves = validMoves.filter(
        (vm) => vm.action === 'move' && vm.pieceId === piece.id
      );
      const isCurrentPlayer = owner === currentPlayerIndex;
      const fullName = Object.entries(PIECE_CONFIG).find(([k]) => k === piece.defId)?.[0] ?? piece.defId;

      // Hover tooltip on all board pieces (even opponent's)
      this.renderer.setInteractive(handle, true);
      this.renderer.onPointerOver(handle, () => {
        const moveInfo = pieceMoves.length > 0 ? ` — ${pieceMoves.length} move(s)` : '';
        const stackInfo = stackLevel > 0 ? ` [stack ${stackLevel}]` : '';
        // Show surround count for queens
        let surroundInfo = '';
        if (piece.defId === 'queen-bee' && this.lastState) {
          const bz = this.lastState.zones['board'];
          const bp: HivePieceState[] = bz ? (bz.pieces as unknown as HivePieceState[]) : [];
          const occupied = new Set(bp.filter(p => p.state).map(p => hexKey(p.state!.q, p.state!.r)));
          const nkeys = hexNeighborKeys(q, r);
          const count = nkeys.filter(k => occupied.has(k)).length;
          surroundInfo = ` [${count}/6 surrounded]`;
        }
        this.applyHover(key, `P${owner} ${fullName} (${q},${r})${stackInfo}${surroundInfo}${moveInfo}`);
      });
      this.renderer.onPointerOut(handle, () => this.removeHover(key));

      if (isCurrentPlayer && pieceMoves.length > 0) {
        this.renderer.onPointerDown(handle, () => {
          this.handleBoardPieceClick(piece, pieceMoves);
        });
      }
    }
  }

  // ── Hand rendering ─────────────────────────────────────────────────────────

  private renderHand(
    handPieces: HivePieceState[],
    playerIndex: number,
    currentPlayerIndex: number,
    validMoves: HiveValidMove[]
  ): void {
    // Group by defId
    const groups: Map<string, HivePieceState[]> = new Map();
    for (const piece of handPieces) {
      const arr = groups.get(piece.defId) || [];
      arr.push(piece);
      groups.set(piece.defId, arr);
    }

    // Build defId → placement moves map (valid moves only reference one representative
    // pieceId per type, but ALL pieces of that type should be clickable)
    const defIdMoves: Map<string, HiveValidMove[]> = new Map();
    if (playerIndex === currentPlayerIndex) {
      for (const vm of validMoves) {
        if (vm.action !== 'place') continue;
        const vmPiece = handPieces.find((hp) => hp.id === vm.pieceId);
        if (vmPiece) {
          const existing = defIdMoves.get(vmPiece.defId) || [];
          existing.push(vm);
          defIdMoves.set(vmPiece.defId, existing);
        }
      }
    }

    const handY = playerIndex === 0 ? HAND_Y_P0 : HAND_Y_P1;
    let xOffset = HAND_START_X;

    for (const [defId, pieces] of groups) {
      const config = PIECE_CONFIG[defId];
      if (!config) continue;

      // Get placement moves for this piece TYPE (shared across all pieces of this type)
      const typeMoves = defIdMoves.get(defId) || [];

      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        const x = xOffset + i * (HEX_SIZE * 1.2);
        const textureId = `hex-piece:${defId}:${config.color}:${config.label}:${playerIndex}`;
        const handle = this.renderer.createSprite(textureId);
        this.renderer.addToStage(handle);
        this.renderer.setPosition(handle, x, handY);

        const key = `hand:${piece.id}`;
        this.sprites.set(key, { handle, x, y: handY });

        // Hover tooltip on all hand pieces
        const fullName = defId;
        this.renderer.setInteractive(handle, true);
        this.renderer.onPointerOver(handle, () => {
          const placeInfo = typeMoves.length > 0
            ? ` — ${typeMoves.length} target(s)`
            : ' — no placements';
          this.applyHover(key, `P${playerIndex} hand: ${fullName}${placeInfo}`);
        });
        this.renderer.onPointerOut(handle, () => this.removeHover(key));

        // Make clickable if this type has placement moves.
        // Use the original representative pieceId from valid moves — all hand
        // pieces of the same type are identical, and the server validates the
        // exact pieceId against the generated valid moves list.
        if (typeMoves.length > 0) {
          this.renderer.onPointerDown(handle, () => {
            this.handleHandPieceClick(piece, typeMoves);
          });
        }
      }

      // Advance X for next group
      xOffset += pieces.length * (HEX_SIZE * 1.2) + HAND_SPACING;
    }
  }

  // ── Perimeter ghosts ───────────────────────────────────────────────────────

  private renderPerimeterGhosts(
    boardPieces: HivePieceState[],
    validMoves: HiveValidMove[]
  ): void {
    // Collect all unique target hexes from placement moves that are empty on the board
    const occupiedSet = new Set<string>();
    for (const piece of boardPieces) {
      if (piece.state) {
        occupiedSet.add(hexKey(piece.state.q, piece.state.r));
      }
    }

    const ghostHexes = new Set<string>();
    for (const vm of validMoves) {
      if (vm.data) {
        const key = hexKey(vm.data.q, vm.data.r);
        if (!occupiedSet.has(key)) {
          ghostHexes.add(key);
        }
      }
    }

    for (const key of ghostHexes) {
      const [qStr, rStr] = key.split(',');
      const q = parseInt(qStr, 10);
      const r = parseInt(rStr, 10);
      const pos = hexToPixel(q, r);

      const handle = this.renderer.createSprite('hex-ghost:#555555');
      this.renderer.addToStage(handle);
      this.renderer.setPosition(handle, pos.x, pos.y);

      const spriteKey = `ghost:${key}`;
      this.sprites.set(spriteKey, { handle, x: pos.x, y: pos.y });

      // Count how many moves target this hex (for debug info)
      const movesHere = validMoves.filter(
        (vm) => vm.data && hexKey(vm.data.q, vm.data.r) === key
      );
      const placeCount = movesHere.filter((vm) => vm.action === 'place').length;
      const moveCount = movesHere.filter((vm) => vm.action === 'move').length;

      // Hover tooltip on ghost hexes — context-aware when a piece is selected
      this.renderer.setInteractive(handle, true);
      this.renderer.onPointerOver(handle, () => {
        if (this.selectedPieceId) {
          const isValidTarget = this.highlightedKeys.has(spriteKey);
          const action = this.selectedMoves.find(
            (vm) => vm.data && hexKey(vm.data.q, vm.data.r) === key
          );
          if (isValidTarget && action) {
            this.applyHover(spriteKey, `click to ${action.action} → (${q},${r})`);
          } else {
            this.applyHover(spriteKey, `(${q},${r}) — not valid for selected piece`);
          }
        } else {
          const parts: string[] = [];
          if (placeCount > 0) parts.push(`${placeCount} place`);
          if (moveCount > 0) parts.push(`${moveCount} move`);
          this.applyHover(spriteKey, `target (${q},${r}) — ${parts.join(', ')}`);
        }
      });
      this.renderer.onPointerOut(handle, () => this.removeHover(spriteKey));

      // Ghost hexes are clickable targets
      this.renderer.onPointerDown(handle, () => {
        this.handleTargetClick(q, r);
      });
    }
  }

  // ── Click handlers ─────────────────────────────────────────────────────────

  private handleHandPieceClick(piece: HivePieceState, placeMoves: HiveValidMove[]): void {
    // If same piece clicked again, deselect
    if (this.selectedPieceId === piece.id) {
      this.clearSelection();
      return;
    }

    this.clearSelection();
    this.selectedPieceId = piece.id;
    this.selectedMoves = placeMoves;

    // Blue glow on selected hand piece
    const handEntry = this.sprites.get(`hand:${piece.id}`);
    if (handEntry) {
      this.renderer.applyGlow(handEntry.handle, SELECTION_GLOW, 3);
      this.highlightedKeys.add(`hand:${piece.id}`);
    }

    // Green glow on valid placement hexes
    for (const vm of placeMoves) {
      if (vm.data) {
        const ghostKey = `ghost:${hexKey(vm.data.q, vm.data.r)}`;
        const ghostEntry = this.sprites.get(ghostKey);
        if (ghostEntry) {
          this.renderer.applyGlow(ghostEntry.handle, VALID_MOVE_GLOW, 2);
          this.highlightedKeys.add(ghostKey);
        }
      }
    }
  }

  private handleBoardPieceClick(piece: HivePieceState, pieceMoves: HiveValidMove[]): void {
    // If a different piece is selected and this board piece's hex is a valid target,
    // treat as target click (beetle climbing)
    if (this.selectedPieceId && this.selectedPieceId !== piece.id && piece.state) {
      const targetKey = hexKey(piece.state.q, piece.state.r);
      const matchingMove = this.selectedMoves.find(
        (vm) => vm.data && hexKey(vm.data.q, vm.data.r) === targetKey
      );
      if (matchingMove) {
        this.fireMove(matchingMove);
        return;
      }
    }

    // If same piece clicked again, deselect
    if (this.selectedPieceId === piece.id) {
      this.clearSelection();
      return;
    }

    this.clearSelection();
    this.selectedPieceId = piece.id;
    this.selectedMoves = pieceMoves;

    // Blue glow on selected board piece
    const boardEntry = this.sprites.get(`board:${piece.id}`);
    if (boardEntry) {
      this.renderer.applyGlow(boardEntry.handle, SELECTION_GLOW, 3);
      this.highlightedKeys.add(`board:${piece.id}`);
    }

    // Green glow on valid movement target hexes
    for (const vm of pieceMoves) {
      if (vm.data) {
        const ghostKey = `ghost:${hexKey(vm.data.q, vm.data.r)}`;
        const ghostEntry = this.sprites.get(ghostKey);
        if (ghostEntry) {
          this.renderer.applyGlow(ghostEntry.handle, VALID_MOVE_GLOW, 2);
          this.highlightedKeys.add(ghostKey);
        }

        // Also highlight occupied hexes that are valid beetle targets
        if (this.lastState) {
          const boardZone = this.lastState.zones['board'];
          const boardPieces: HivePieceState[] = boardZone
            ? (boardZone.pieces as unknown as HivePieceState[])
            : [];
          for (const bp of boardPieces) {
            if (bp.state && hexKey(bp.state.q, bp.state.r) === hexKey(vm.data.q, vm.data.r)) {
              const bpKey = `board:${bp.id}`;
              const bpEntry = this.sprites.get(bpKey);
              if (bpEntry && !this.highlightedKeys.has(bpKey)) {
                this.renderer.applyGlow(bpEntry.handle, VALID_MOVE_GLOW, 2);
                this.highlightedKeys.add(bpKey);
                // Make the target board piece clickable for beetle climbing
                this.renderer.setInteractive(bpEntry.handle, true);
                const targetQ = vm.data.q;
                const targetR = vm.data.r;
                this.renderer.onPointerDown(bpEntry.handle, () => {
                  this.handleTargetClick(targetQ, targetR);
                });
              }
            }
          }
        }
      }
    }
  }

  private handleTargetClick(q: number, r: number): void {
    if (!this.selectedPieceId) return;

    const targetKey = hexKey(q, r);
    const matchingMove = this.selectedMoves.find(
      (vm) => vm.data && hexKey(vm.data.q, vm.data.r) === targetKey
    );

    if (matchingMove) {
      this.fireMove(matchingMove);
    }
  }

  private fireMove(vm: HiveValidMove): void {
    const move: MovePayload = {
      action: vm.action,
      source: vm.source,
      target: vm.target,
      pieceId: vm.pieceId,
      data: vm.data,
    };
    this.clearSelection();
    this.moveCallback?.(move);
  }

  // ── Hover helpers ──────────────────────────────────────────────────────────

  private applyHover(spriteKey: string, info: string): void {
    // Apply glow only if not already highlighted by selection
    if (!this.highlightedKeys.has(spriteKey)) {
      const entry = this.sprites.get(spriteKey);
      if (entry) {
        this.renderer.applyGlow(entry.handle, HOVER_GLOW, 1.5);
        this.hoverKeys.add(spriteKey);
      }
    }
    // Always fire tooltip callback
    this.hoverCallback?.(info);
  }

  private removeHover(spriteKey: string): void {
    if (this.hoverKeys.has(spriteKey)) {
      this.hoverKeys.delete(spriteKey);
      if (!this.highlightedKeys.has(spriteKey)) {
        const entry = this.sprites.get(spriteKey);
        if (entry) this.renderer.removeGlow(entry.handle);
      }
    }
    this.hoverCallback?.('');
  }

  // ── Selection management ───────────────────────────────────────────────────

  private clearSelection(): void {
    for (const key of this.highlightedKeys) {
      const entry = this.sprites.get(key);
      if (entry) {
        this.renderer.removeGlow(entry.handle);
      }
    }
    this.highlightedKeys.clear();
    this.hoverKeys.clear();
    this.selectedPieceId = null;
    this.selectedMoves = [];
  }

  private clearAll(): void {
    for (const [, entry] of this.sprites) {
      this.renderer.removeFromStage(entry.handle);
    }
    this.sprites.clear();
    this.highlightedKeys.clear();
    this.hoverKeys.clear();
    this.selectedPieceId = null;
    this.selectedMoves = [];
  }
}
