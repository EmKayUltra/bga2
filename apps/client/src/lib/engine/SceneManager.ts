/**
 * SceneManager — orchestration layer between renderer, FSM, game model, and server API.
 *
 * Responsibilities:
 *   - Initialize PixiJS renderer (SSR-safe dynamic import inside init())
 *   - Load game model via GameLoader
 *   - Create and drive XState FSM
 *   - Create AzulScene and render initial board state
 *   - Handle two-step tap-to-select interaction: source zone → destination pattern line
 *   - Submit moves to server via gameApi and process results
 *   - Update scene after each move (multi-player turn tracking from real server state)
 *
 * Usage in SvelteKit (inside onMount only):
 *   const sm = new SceneManager(containerEl, gameConfig);
 *   await sm.init(sessionId);
 *
 * On cleanup:
 *   sm.destroy();
 */

import { GameLoader } from '@bga2/engine-core';
import { createGameFSM } from '@bga2/engine-core';
import { AzulScene } from './AzulScene.js';
import { submitMove, getGameState, createGame } from '../api/gameApi.js';

import type { GameConfig, ValidMove, MoveResult, GameState } from '@bga2/shared-types';
import type { RuntimeGameModel } from '@bga2/engine-core';
import type { IRenderer } from '@bga2/shared-types';
import type { Actor } from 'xstate';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneManagerState {
  sessionId: string | null;
  currentPlayerIndex: number;      // derived from server state — replaces hardcoded playerId
  playerNames: string[];           // from server state
  playerScores: number[];          // from server state
  currentFsmState: string;
  lastMoveResult: MoveResult | null;
  validMoves: ValidMove[];
  gameState: GameState | null;     // full state from server for UI binding
  turnHandoffMode: 'open-board' | 'pass-and-play';
  selectedSource: string | null;   // currently selected factory/center zone ID
  selectedColor: string | null;    // currently selected tile color
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

  // Interaction state (two-step: source → target)
  private currentValidMoves: ValidMove[] = [];

  // Public observable state (for UI toolbar)
  public state: SceneManagerState = {
    sessionId: null,
    currentPlayerIndex: 0,
    playerNames: [],
    playerScores: [],
    currentFsmState: 'idle',
    lastMoveResult: null,
    validMoves: [],
    gameState: null,
    turnHandoffMode: 'open-board',
    selectedSource: null,
    selectedColor: null,
  };

  /** Notified when public state changes — used by the Svelte page for reactivity. */
  public onStateChange: (() => void) | null = null;

  /** Fired when the turn changes — page shows "PlayerName's Turn" banner. */
  public onTurnChange: ((playerIndex: number, playerName: string) => void) | null = null;

  /** Fired when the game ends — page shows score summary overlay. */
  public onGameFinished: ((state: GameState) => void) | null = null;

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
   * 5. Fetch real game state from server (if sessionId provided)
   * 6. Create AzulScene and render initial board
   */
  async init(sessionId?: string): Promise<void> {
    // 1. Dynamic import of PixiAdapter (SSR-safe)
    const { PixiAdapter } = await import('@bga2/engine-core');
    this.renderer = new PixiAdapter();

    const w = this.container.clientWidth || 1280;
    const h = this.container.clientHeight || 800;

    // World size — scales with player count (set after fetching state)
    const worldW = 640;
    const worldH = 1400;

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

    // 5. Fetch real game state (or create a demo session if needed)
    let initialGameState: GameState | null = null;

    if (sessionId) {
      this.state.sessionId = sessionId;
      try {
        const stateResponse = await getGameState(sessionId);
        initialGameState = stateResponse.state;
        this.currentValidMoves = stateResponse.validMoves;
        this.state.validMoves = stateResponse.validMoves;
        this.updateStateFromGameState(initialGameState);
      } catch (err) {
        console.warn('[SceneManager] Could not fetch game state:', err);
      }
    } else {
      // No session — try to create one for the demo
      try {
        const response = await createGame('azul', ['Player 1', 'Player 2']);
        this.state.sessionId = response.sessionId;
        const stateResponse = await getGameState(response.sessionId);
        initialGameState = stateResponse.state;
        this.currentValidMoves = stateResponse.validMoves;
        this.state.validMoves = stateResponse.validMoves;
        this.updateStateFromGameState(initialGameState);
      } catch (err) {
        console.info('[SceneManager] Server not available — running without server state:', err);
        // Provide minimal state so rendering works
        this.state.playerNames = ['Player 1', 'Player 2'];
        this.state.playerScores = [0, 0];
      }
    }

    // Dynamic import of xstate createActor (avoids SSR issues)
    const { createActor } = await import('xstate');
    const fsmInput = {
      gameState: initialGameState ?? {
        id: 'stub',
        gameId: this.gameConfig.id,
        version: 0,
        phase: 'factory-offer',
        currentPlayerIndex: 0,
        players: [
          { id: 'player-1', name: 'Player 1', score: 0, data: {} },
          { id: 'player-2', name: 'Player 2', score: 0, data: {} },
        ],
        zones: {},
        round: 1,
        finished: false,
      } as GameState,
      round: initialGameState?.round ?? 1,
      currentPlayerIndex: initialGameState?.currentPlayerIndex ?? 0,
    };

    this.fsmActor = createActor(this.fsm, { input: fsmInput });
    this.fsmActor.subscribe((snapshot) => {
      const stateVal = snapshot.value;
      this.state.currentFsmState = typeof stateVal === 'string'
        ? stateVal
        : JSON.stringify(stateVal);
      this.onStateChange?.();
    });
    this.fsmActor.start();

    // 6. Create scene and render board with real state
    this.scene = new AzulScene(this.renderer, this.model);

    if (initialGameState) {
      this.scene.renderBoard(initialGameState);
    } else {
      this.scene.renderBoard();
    }

    // Wire click handlers
    this.wireClickHandlers();

    console.log(`[SceneManager] init complete — sessionId:${this.state.sessionId}, players:${this.state.playerNames.length}, validMoves:${this.state.validMoves.length}`);
    this.onStateChange?.();
  }

  /**
   * Update SceneManagerState from a GameState received from the server.
   */
  private updateStateFromGameState(gs: GameState): void {
    this.state.gameState = gs;
    this.state.currentPlayerIndex = gs.currentPlayerIndex;
    this.state.playerNames = gs.players.map((p) => p.name);
    this.state.playerScores = gs.players.map((p) => p.score);
  }

  /**
   * Wire click handlers on all source zones (factories/center) and destination zones
   * (pattern lines/floor line) using the AzulScene callback API.
   */
  private wireClickHandlers(): void {
    if (!this.scene) return;

    // Source zone click: factory or center tile click
    this.scene.onSourceClick((zoneId, color) => {
      this.handleSourceClick(zoneId, color);
    });

    // Destination zone click: pattern line row or floor line
    this.scene.onDestinationClick((zoneId) => {
      this.handleDestinationClick(zoneId);
    });
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
   * Handle a source zone click (step 1 of two-step interaction).
   * Player tapped a tile in a factory or center — highlight valid destinations.
   */
  handleSourceClick(zoneId: string, color: string): void {
    if (!this.scene) return;

    const relevantMoves = this.currentValidMoves.filter(
      (vm) => vm.source === zoneId && (vm.pieceId === color || !vm.pieceId)
    );
    console.log(`[SceneManager] handleSourceClick — zoneId:'${zoneId}', color:'${color}', relevantMoves:${relevantMoves.length}`);

    // If same source+color already selected, deselect
    if (this.state.selectedSource === zoneId && this.state.selectedColor === color) {
      this.scene.deselectSource();
      this.state.selectedSource = null;
      this.state.selectedColor = null;
      this.onStateChange?.();
      return;
    }

    // Select new source
    this.state.selectedSource = zoneId;
    this.state.selectedColor = color;

    this.scene.selectSource(zoneId, color, relevantMoves);
    this.onStateChange?.();
  }

  /**
   * Handle a destination zone click (step 2 of two-step interaction).
   * Player tapped a pattern line or floor line — submit the move.
   */
  handleDestinationClick(targetZoneId: string): void {
    if (!this.scene || !this.state.selectedSource || !this.state.selectedColor) {
      console.log(`[SceneManager] handleDestinationClick — ignored (no source selected), target:'${targetZoneId}'`);
      return;
    }

    // Determine patternLineRow from the targetZoneId
    // Convention: "player-{i}-pattern-line-{capacity}" → 0-based row index, "player-{i}-floor-line" → -1
    let patternLineRow = -1; // -1 = floor line
    const patternMatch = targetZoneId.match(/pattern-line-(\d+)$/);
    if (patternMatch) {
      // Zone ID uses capacity (1-5), onMove hook expects 0-based row index (0-4)
      patternLineRow = parseInt(patternMatch[1], 10) - 1;
    }

    // Validate this is a legal destination
    const isLegal = this.currentValidMoves.some((vm) => {
      if (vm.source !== this.state.selectedSource) return false;
      // Match by target zone or by data.patternLineRow
      if (vm.target === targetZoneId) return true;
      // The server valid moves may describe target by zone pattern
      const vmRow = (vm as ValidMove & { data?: { patternLineRow?: number } }).data?.patternLineRow;
      if (vmRow !== undefined && vmRow === patternLineRow) return true;
      return false;
    });

    console.log(`[SceneManager] handleDestinationClick — target:'${targetZoneId}', patternLineRow:${patternLineRow}, isLegal:${isLegal}, selectedSource:'${this.state.selectedSource}', selectedColor:'${this.state.selectedColor}'`);

    if (!isLegal && this.currentValidMoves.length > 0) {
      console.log(`[SceneManager] handleDestinationClick — rejected (not a legal destination)`);
      return;
    }

    if (this.state.sessionId) {
      void this.submitPlayerMove(
        this.state.selectedSource,
        this.state.selectedColor,
        patternLineRow,
        targetZoneId
      );
    }
  }

  /**
   * Submit a player move to the server.
   * Uses the Azul move format: action='pick-tiles', source=zoneId, data.color, data.patternLineRow
   */
  private async submitPlayerMove(
    sourceZone: string,
    color: string,
    patternLineRow: number,
    targetZoneId: string
  ): Promise<void> {
    if (!this.scene || !this.state.sessionId) return;

    const playerIndex = this.state.currentPlayerIndex;
    const playerId = `player-${playerIndex}`;

    const move = {
      playerId,
      action: 'pick-tiles',
      source: sourceZone,
      target: targetZoneId,
      pieceId: color,
      data: {
        color,
        patternLineRow,
      },
    };

    console.log(`[SceneManager] submitPlayerMove — ${JSON.stringify(move)}`);

    // Deselect optimistically while waiting for server
    this.scene.deselectSource();
    const prevSource = this.state.selectedSource;
    const prevColor = this.state.selectedColor;
    this.state.selectedSource = null;
    this.state.selectedColor = null;

    const result = await submitMove(this.state.sessionId, move);
    await this.handleMoveResult(result, sourceZone, prevColor ?? color, targetZoneId);

    void prevSource;
    void prevColor;
  }

  /**
   * Handle a move result from the server:
   * - Valid: animate tiles, update from new server state, advance FSM, fire turn change
   * - Invalid: show error feedback
   */
  async handleMoveResult(
    result: MoveResult,
    sourceZone: string,
    color: string,
    targetZoneId: string
  ): Promise<void> {
    this.state.lastMoveResult = result;
    console.log(`[SceneManager] handleMoveResult — valid:${result.valid}${result.errors ? ', errors:' + result.errors.join(', ') : ''}`);

    if (result.valid) {
      // Animate tiles from source to destination
      if (this.scene) {
        await this.scene.animateMove(sourceZone, color, targetZoneId);
      }

      // Update FSM
      if (this.fsmActor) {
        this.fsmActor.send({ type: 'SUBMIT_MOVE' });
      }

      // Update valid moves from response
      if (result.validMoves) {
        this.currentValidMoves = result.validMoves;
        this.state.validMoves = result.validMoves;
      }

      // Fetch fresh state to get updated game state
      if (this.state.sessionId) {
        try {
          const stateResponse = await getGameState(this.state.sessionId);
          const newGs = stateResponse.state;

          // Update valid moves with fresh fetch
          this.currentValidMoves = stateResponse.validMoves;
          this.state.validMoves = stateResponse.validMoves;

          const prevPlayerIndex = this.state.currentPlayerIndex;
          this.updateStateFromGameState(newGs);

          // Re-render scene with new state
          if (this.scene) {
            this.scene.updateFromState(newGs);
            this.scene.setActivePlayer(newGs.currentPlayerIndex);
          }

          console.log(`[SceneManager] handleMoveResult — newPlayer:${newGs.currentPlayerIndex} ('${this.state.playerNames[newGs.currentPlayerIndex]}'), validMoves:${this.state.validMoves.length}, round:${newGs.round}`);

          // Fire turn change callback if player changed
          if (newGs.currentPlayerIndex !== prevPlayerIndex) {
            this.onTurnChange?.(
              newGs.currentPlayerIndex,
              this.state.playerNames[newGs.currentPlayerIndex] ?? `Player ${newGs.currentPlayerIndex + 1}`
            );
          }

          // Check for game end
          if (newGs.finished) {
            this.onGameFinished?.(newGs);
          }
        } catch (err) {
          console.warn('[SceneManager] Could not refresh state after move:', err);
        }
      }
    } else {
      // Invalid move — log error
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

      const gs = stateResponse.state;
      this.updateStateFromGameState(gs);

      if (this.scene) {
        this.scene.updateFromState(gs);
        this.scene.setActivePlayer(gs.currentPlayerIndex);
      }
    } catch (err) {
      console.warn('[SceneManager] Could not fetch valid moves:', err);
      this.currentValidMoves = [];
    }

    this.onStateChange?.();
  }

  /**
   * Reset/deselect any active selection without submitting a move.
   */
  clearSelection(): void {
    if (!this.scene) return;
    this.scene.deselectSource();
    this.state.selectedSource = null;
    this.state.selectedColor = null;
    this.onStateChange?.();
  }
}
