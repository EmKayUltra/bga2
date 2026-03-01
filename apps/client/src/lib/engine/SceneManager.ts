/**
 * SceneManager — orchestration layer between renderer, FSM, game model, and server API.
 *
 * Responsibilities:
 *   - Initialize PixiJS renderer (SSR-safe dynamic import inside init())
 *   - Load game model via GameLoader
 *   - Create and drive XState FSM
 *   - Create AzulScene and render initial board state
 *   - Handle piece click interactions (select, highlight, move, animate)
 *   - Submit moves to server via gameApi and process results
 *   - Update scene after each move
 *
 * Usage in SvelteKit (inside onMount only):
 *   const sm = new SceneManager(containerEl, gameConfig);
 *   await sm.init();
 *
 * On cleanup:
 *   sm.destroy();
 */

import { GameLoader } from '@bga2/engine-core';
import { createGameFSM } from '@bga2/engine-core';
import { AzulScene } from './AzulScene.js';
import { submitMove, getGameState } from '../api/gameApi.js';

import type { GameConfig, ValidMove, MoveResult, GameState } from '@bga2/shared-types';
import type { RuntimeGameModel } from '@bga2/engine-core';
import type { IRenderer } from '@bga2/shared-types';
import type { Actor } from 'xstate';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneManagerState {
  sessionId: string | null;
  playerId: string;
  currentFsmState: string;
  lastMoveResult: MoveResult | null;
  validMoves: ValidMove[];
}

// ─── SceneManager ─────────────────────────────────────────────────────────────

export class SceneManager {
  private container: HTMLElement;
  private gameConfig: GameConfig;

  private renderer: IRenderer | null = null;
  private model: RuntimeGameModel | null = null;
  private fsm: ReturnType<typeof createGameFSM> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fsmActor: Actor<any> | null = null;
  private scene: AzulScene | null = null;

  // Interaction state
  private selectedPieceId: string | null = null;
  private currentValidMoves: ValidMove[] = [];

  // Public observable state (for dev toolbar)
  public state: SceneManagerState = {
    sessionId: null,
    playerId: 'player-1',  // Phase 1: hardcoded single player
    currentFsmState: 'idle',
    lastMoveResult: null,
    validMoves: [],
  };

  /** Notified when public state changes — used by the Svelte page for reactivity. */
  public onStateChange: (() => void) | null = null;

  constructor(container: HTMLElement, gameConfig: GameConfig) {
    this.container = container;
    this.gameConfig = gameConfig;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Initialize the scene manager:
   * 1. Dynamically import PixiAdapter (SSR-safe — called only inside onMount)
   * 2. Init renderer and enable viewport
   * 3. Load game model from config
   * 4. Create and start FSM
   * 5. Create AzulScene and render initial board
   */
  async init(sessionId?: string): Promise<void> {
    // 1. Dynamic import of PixiAdapter (SSR-safe)
    const { PixiAdapter } = await import('@bga2/engine-core');
    this.renderer = new PixiAdapter();

    const w = this.container.clientWidth || 1280;
    const h = this.container.clientHeight || 800;

    // World size matches actual content bounds (factories + 2 stacked player boards)
    const worldW = 650;
    const worldH = 1300;

    // 2. Init renderer
    await this.renderer.init(this.container, {
      worldWidth: worldW,
      worldHeight: worldH,
      background: 0xfafaf8,
    });

    // Enable viewport (drag/pinch/wheel)
    this.renderer.enableViewport({
      screenWidth: w,
      screenHeight: h,
      worldWidth: worldW,
      worldHeight: worldH,
    });

    // 3. Load game model
    this.model = GameLoader.load(this.gameConfig);

    // 4. Create FSM
    this.fsm = createGameFSM({
      phases: [
        {
          id: 'factoryOffer',
          stages: [{ id: 'picking' }],
        },
        {
          id: 'wallTiling',
          stages: [{ id: 'tiling' }],
        },
      ],
      parallelTurns: false,
    });

    // Phase 1 stub game state for FSM initialization
    const stubGameState: GameState = {
      id: 'stub',
      gameId: this.gameConfig.id,
      version: 0,
      phase: 'factoryOffer',
      currentPlayerIndex: 0,
      players: [
        { id: 'player-1', name: 'Player 1', score: 0, data: {} },
        { id: 'player-2', name: 'Player 2', score: 0, data: {} },
      ],
      zones: {},
      round: 1,
      finished: false,
    };

    // Dynamic import of xstate createActor (avoids SSR issues)
    const { createActor } = await import('xstate');
    this.fsmActor = createActor(this.fsm, {
      input: { gameState: stubGameState, round: 1, currentPlayerIndex: 0 },
    });
    this.fsmActor.subscribe((snapshot) => {
      const stateVal = snapshot.value;
      this.state.currentFsmState = typeof stateVal === 'string'
        ? stateVal
        : JSON.stringify(stateVal);
      this.onStateChange?.();
    });
    this.fsmActor.start();

    // 5. Create scene and render board
    this.scene = new AzulScene(this.renderer, this.model);
    this.scene.renderBoard();

    // Wire piece click handlers for all pieces
    this.wirePieceClickHandlers();

    // Store session ID if provided
    if (sessionId) {
      this.state.sessionId = sessionId;
      // Fetch initial valid moves
      await this.refreshValidMoves();
    }

    this.onStateChange?.();
  }

  /**
   * Wire click handlers for all pieces in the model.
   */
  private wirePieceClickHandlers(): void {
    if (!this.scene || !this.model) return;

    for (const piece of this.model.pieces) {
      const pieceId = piece.id;
      this.scene.onPieceClick(pieceId, () => {
        this.handlePieceClick(pieceId);
      });
    }
  }

  /**
   * Destroy the renderer, stop FSM, and clean up all resources.
   */
  destroy(): void {
    this.fsmActor?.stop();
    this.renderer?.destroy();
    this.renderer = null;
    this.model = null;
    this.fsm = null;
    this.fsmActor = null;
    this.scene = null;
  }

  // ── Interaction handlers ──────────────────────────────────────────────────────

  /**
   * Handle a piece click:
   * - If no piece selected: select this piece, fetch valid moves, highlight destinations
   * - If same piece clicked again: deselect (clear glow + highlights)
   * - If a valid destination piece clicked: submit move to server
   */
  handlePieceClick(pieceId: string): void {
    if (!this.scene) return;

    const currentSelected = this.scene.getSelectedPieceId();

    if (currentSelected === null) {
      // No piece selected — select this one
      this.scene.selectPiece(pieceId);
      this.selectedPieceId = pieceId;

      // Highlight valid moves from current server state
      this.scene.highlightValidMoves(this.currentValidMoves);
      this.onStateChange?.();
      return;
    }

    if (currentSelected === pieceId) {
      // Clicking same piece — deselect
      this.scene.deselectPiece();
      this.scene.clearHighlights();
      this.selectedPieceId = null;
      this.onStateChange?.();
      return;
    }

    // A different piece was clicked while one is selected
    // Check if this piece is a valid move destination
    const clickedPiece = this.model?.pieces.find((p) => p.id === pieceId);
    const isValidTarget = clickedPiece
      ? this.currentValidMoves.some((vm) => vm.target === clickedPiece.zoneId)
      : false;

    if (isValidTarget && this.selectedPieceId && this.state.sessionId) {
      // Submit move to server
      void this.submitPlayerMove(this.selectedPieceId, pieceId);
    } else {
      // Not a valid destination — switch selection to clicked piece
      this.scene.deselectPiece();
      this.scene.clearHighlights();
      this.scene.selectPiece(pieceId);
      this.selectedPieceId = pieceId;
      this.scene.highlightValidMoves(this.currentValidMoves);
      this.onStateChange?.();
    }
  }

  /**
   * Submit a player move to the server.
   * Animates the piece on success; shows error feedback on failure.
   */
  private async submitPlayerMove(sourcePieceId: string, targetPieceId: string): Promise<void> {
    if (!this.scene || !this.model || !this.state.sessionId) return;

    const sourcePiece = this.model.pieces.find((p) => p.id === sourcePieceId);
    const targetPiece = this.model.pieces.find((p) => p.id === targetPieceId);
    if (!sourcePiece || !targetPiece) return;

    const move = {
      playerId: this.state.playerId,
      action: 'pick-from-factory',
      source: sourcePiece.zoneId,
      target: targetPiece.zoneId,
      pieceId: sourcePieceId,
    };

    // Optimistically deselect while waiting for server
    this.scene.deselectPiece();
    this.scene.clearHighlights();
    this.selectedPieceId = null;

    const result = await submitMove(this.state.sessionId, move);
    await this.handleMoveResult(result, sourcePieceId, targetPiece);
  }

  /**
   * Handle a move result from the server:
   * - Valid: animate piece, update model, advance FSM, refresh scene
   * - Invalid: show error feedback, deselect
   */
  async handleMoveResult(
    result: MoveResult,
    sourcePieceId: string,
    targetPiece: { id: string; zoneId: string } | null
  ): Promise<void> {
    this.state.lastMoveResult = result;

    if (result.valid && targetPiece) {
      // Find destination position (approximate — use target zone position)
      const targetZone = this.model?.zones.get(targetPiece.zoneId);
      if (targetZone && this.scene) {
        // Animate piece to destination
        await this.scene.animatePiece(sourcePieceId, 0, 0);
        await this.scene.playPlacementFeedback(sourcePieceId);
      }

      // Update FSM state
      if (this.fsmActor) {
        this.fsmActor.send({ type: 'SUBMIT_MOVE' });
      }

      // Update valid moves for next turn
      if (result.validMoves) {
        this.currentValidMoves = result.validMoves;
        this.state.validMoves = result.validMoves;
      }

      // Refresh scene to match new model state
      this.scene?.updateScene();
      this.wirePieceClickHandlers();
    } else {
      // Invalid move — log error, deselect
      console.warn('[SceneManager] Move rejected:', result.errors);
    }

    this.onStateChange?.();
  }

  /**
   * Fetch current valid moves from the server and cache them.
   */
  async refreshValidMoves(): Promise<void> {
    if (!this.state.sessionId) return;

    try {
      const stateResponse = await getGameState(this.state.sessionId);
      this.currentValidMoves = stateResponse.validMoves;
      this.state.validMoves = stateResponse.validMoves;
    } catch (err) {
      // Server not available — use empty valid moves (Phase 1 permissive mode)
      console.warn('[SceneManager] Could not fetch valid moves:', err);
      this.currentValidMoves = [];
    }
  }

  /**
   * Reset the game (for Phase 1 dev toolbar).
   */
  resetGame(): void {
    if (!this.scene || !this.model) return;

    this.scene.deselectPiece();
    this.scene.clearHighlights();
    this.selectedPieceId = null;
    this.currentValidMoves = [];
    this.state.lastMoveResult = null;
    this.state.validMoves = [];

    this.fsmActor?.stop();
    this.scene.updateScene();
    this.wirePieceClickHandlers();

    this.onStateChange?.();
  }
}
