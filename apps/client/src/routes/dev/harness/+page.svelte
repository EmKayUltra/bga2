<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createTestGame, fetchGameState, fetchGameConfig, loadScenario, exportScenario, triggerRoundEnd, triggerGameEnd, setState, discoverGames, getApiBase } from './harness.js';
  import { runBotValidation } from './botRunner.js';
  import { validateGameConfig } from './schemaValidator.js';
  import { SceneManager } from '$lib/engine/SceneManager.js';
  import type { GameConfig } from '@bga2/shared-types';

  let availableGames = $state<string[]>([]);
  let selectedGame = $state('azul');
  let playerCount = $state(2);
  let sessionId = $state('');
  let gameState = $state<Record<string, unknown> | null>(null);
  let validMoves = $state<unknown[]>([]);
  let stateVersion = $state(0);
  let error = $state('');
  let botResult = $state<{ success: boolean; moveCount: number; reason: string; error?: string; duration: number } | null>(null);
  let botRunning = $state(false);
  let autoBot = $state(true);  // Default true per user decision: auto-validate on reload
  let schemaErrors = $state<{ field: string; message: string }[]>([]);
  let rendererContainer: HTMLElement;
  let sceneManager: SceneManager | null = null;
  let rendererError = $state('');

  // Dev panel inputs
  let setScorePlayer = $state(0);
  let setScoreValue = $state(0);
  let setPhaseValue = $state('');
  let setRoundValue = $state(1);

  async function newGame() {
    try {
      error = '';
      schemaErrors = [];
      rendererError = '';

      // Step 1: Schema validation — validate game.json before creating session
      const gameConfig = await fetchGameConfig(selectedGame);
      const configErrors = validateGameConfig(gameConfig);
      schemaErrors = configErrors;
      if (configErrors.length > 0) {
        error = `Schema validation failed: ${configErrors.length} error(s). See details below.`;
        // Continue anyway — let developer see the errors but still create the game
      }

      // Step 2: Create game session
      const result = await createTestGame(selectedGame, playerCount);
      sessionId = result.sessionId;
      await refreshState();

      // Step 3: Wire PixiJS SceneManager for visual rendering
      if (sceneManager) { sceneManager.destroy(); sceneManager = null; }
      if (rendererContainer) {
        try {
          sceneManager = new SceneManager(rendererContainer, gameConfig as GameConfig);
          await sceneManager.init(sessionId);
        } catch (e) {
          rendererError = `PixiJS renderer failed: ${String(e)}. Falling back to JSON viewer.`;
          sceneManager = null;
        }
      }

      // Step 4: Auto-bot validation
      if (autoBot) await runBot(50);
    } catch (e) {
      error = String(e);
    }
  }

  async function refreshState() {
    if (!sessionId) return;
    try {
      const data = await fetchGameState(sessionId);
      gameState = typeof data.state === 'string' ? JSON.parse(data.state) : data.state;
      validMoves = data.validMoves || [];
      stateVersion = data.version || 0;
    } catch (e) {
      error = String(e);
    }
  }

  async function doTriggerRoundEnd() {
    if (!sessionId) return;
    await triggerRoundEnd(sessionId);
    await refreshState();
  }

  async function doTriggerGameEnd() {
    if (!sessionId) return;
    await triggerGameEnd(sessionId);
    await refreshState();
  }

  async function doAdvanceTurn() {
    if (!sessionId || !gameState) return;
    const players = gameState.players as unknown[];
    const nextIdx = ((gameState.currentPlayerIndex as number) + 1) % players.length;
    await setState(sessionId, { currentPlayerIndex: nextIdx });
    await refreshState();
  }

  async function doSetScore() {
    if (!sessionId || !gameState) return;
    const players = [...(gameState.players as Record<string, unknown>[])];
    if (setScorePlayer >= 0 && setScorePlayer < players.length) {
      players[setScorePlayer] = { ...players[setScorePlayer], score: setScoreValue };
      await setState(sessionId, { players });
      await refreshState();
    }
  }

  async function doSetPhase() {
    if (!sessionId) return;
    await setState(sessionId, { phase: setPhaseValue });
    await refreshState();
  }

  async function doSetRound() {
    if (!sessionId) return;
    await setState(sessionId, { round: setRoundValue });
    await refreshState();
  }

  async function doLoadScenario(event: Event) {
    if (!sessionId) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    await loadScenario(sessionId, text);
    await refreshState();
  }

  async function doExportScenario() {
    if (!sessionId) return;
    const json = await exportScenario(sessionId);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-${selectedGame}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doCopyState() {
    if (!gameState) return;
    await navigator.clipboard.writeText(JSON.stringify(gameState, null, 2));
  }

  async function runBot(maxMoves: number) {
    if (!sessionId || botRunning) return;
    botRunning = true;
    botResult = null;
    try {
      botResult = await runBotValidation(sessionId, maxMoves, getApiBase());
      await refreshState(); // Refresh to show final state after bot run
    } catch (e) {
      botResult = { success: false, moveCount: 0, reason: 'error', error: String(e), duration: 0 };
    }
    botRunning = false;
  }

  onMount(async () => {
    // Discover available games dynamically from libs/games/*/
    availableGames = await discoverGames();
    if (availableGames.length > 0 && !availableGames.includes(selectedGame)) {
      selectedGame = availableGames[0];
    }
    // Auto-create a game on mount for quick iteration (per user decision: auto-validate on reload)
    if (availableGames.length > 0) {
      await newGame();
    }
  });

  onDestroy(() => {
    if (sceneManager) { sceneManager.destroy(); sceneManager = null; }
  });
</script>

<div class="harness">
  <header class="harness-header">
    <div class="controls">
      <select bind:value={selectedGame}>
        {#each availableGames as game}
          <option value={game}>{game}</option>
        {/each}
      </select>
      <select bind:value={playerCount}>
        <option value={2}>2 players</option>
        <option value={3}>3 players</option>
        <option value={4}>4 players</option>
      </select>
      <button onclick={newGame}>New Game</button>
      {#if sessionId}
        <span class="session-id">Session: {sessionId.slice(0, 8)}...</span>
      {/if}
    </div>
    {#if error}
      <div class="error">{error}</div>
    {/if}
  </header>

  <div class="harness-body">
    <!-- Main area: PixiJS renderer + state viewer -->
    <main class="state-viewer">
      <!-- PixiJS Renderer Container — primary view per user decision -->
      <div class="renderer-container" bind:this={rendererContainer}></div>
      {#if rendererError}
        <div class="renderer-error">{rendererError}</div>
      {/if}
      {#if schemaErrors.length > 0}
        <details class="schema-errors" open>
          <summary>Schema Validation Errors ({schemaErrors.length})</summary>
          <ul>
            {#each schemaErrors as err}
              <li><strong>{err.field}</strong>: {err.message}</li>
            {/each}
          </ul>
        </details>
      {/if}
      {#if gameState}
        <div class="state-summary">
          <span>Phase: <strong>{gameState.phase as string}</strong></span>
          <span>Round: <strong>{gameState.round as number}</strong></span>
          <span>Turn: <strong>{(gameState.players as { name: string }[])?.[gameState.currentPlayerIndex as number]?.name || '?'}</strong></span>
          <span>Finished: <strong>{gameState.finished ? 'YES' : 'no'}</strong></span>
          {#if gameState.winnerId}
            <span>Winner: <strong>{gameState.winnerId as string}</strong></span>
          {/if}
        </div>
        <div class="scores">
          {#each (gameState.players as { name: string; score: number }[]) || [] as player, i}
            <span class:active={i === (gameState.currentPlayerIndex as number)}>
              {player.name}: {player.score}
            </span>
          {/each}
        </div>
        <details open>
          <summary>Valid Moves ({validMoves.length})</summary>
          <pre class="moves-list">{JSON.stringify(validMoves, null, 2)}</pre>
        </details>
        <details>
          <summary>Full State (v{stateVersion})</summary>
          <pre class="state-json">{JSON.stringify(gameState, null, 2)}</pre>
        </details>
      {:else}
        <p class="placeholder">Select a game and click "New Game" to start testing.</p>
      {/if}
    </main>

    <!-- Dev Panel -->
    <aside class="dev-panel">
      <h3>State Actions</h3>
      <div class="panel-group">
        <button onclick={doTriggerRoundEnd} disabled={!sessionId}>Trigger Round End</button>
        <button onclick={doTriggerGameEnd} disabled={!sessionId}>Trigger Game End</button>
        <button onclick={doAdvanceTurn} disabled={!sessionId}>Advance Turn</button>
      </div>

      <div class="panel-group">
        <label>Set Score</label>
        <div class="inline-form">
          <input type="number" bind:value={setScorePlayer} min="0" max="3" placeholder="Player #" />
          <input type="number" bind:value={setScoreValue} placeholder="Score" />
          <button onclick={doSetScore} disabled={!sessionId}>Set</button>
        </div>
      </div>

      <div class="panel-group">
        <label>Set Phase</label>
        <div class="inline-form">
          <input type="text" bind:value={setPhaseValue} placeholder="phase name" />
          <button onclick={doSetPhase} disabled={!sessionId}>Set</button>
        </div>
      </div>

      <div class="panel-group">
        <label>Set Round</label>
        <div class="inline-form">
          <input type="number" bind:value={setRoundValue} min="1" placeholder="Round #" />
          <button onclick={doSetRound} disabled={!sessionId}>Set</button>
        </div>
      </div>

      <h3>Scenarios</h3>
      <div class="panel-group">
        <label>Load Scenario</label>
        <input type="file" accept=".json" onchange={doLoadScenario} disabled={!sessionId} />
        <button onclick={doExportScenario} disabled={!sessionId}>Export Scenario</button>
        <button onclick={doCopyState} disabled={!gameState}>Copy State to Clipboard</button>
      </div>

      <h3>Bot Validator</h3>
      <div class="panel-group">
        <div class="bot-controls">
          <button onclick={() => runBot(50)} disabled={!sessionId || botRunning}>
            {botRunning ? 'Running...' : 'Run Bot (50 moves)'}
          </button>
          <button onclick={() => runBot(200)} disabled={!sessionId || botRunning}>
            {botRunning ? 'Running...' : 'Run Bot (200 moves)'}
          </button>
        </div>
        <label class="auto-bot">
          <input type="checkbox" bind:checked={autoBot} />
          Auto-run on new game
        </label>
        {#if botResult}
          <div class="bot-result" class:bot-success={botResult.success} class:bot-failure={!botResult.success}>
            <strong>{botResult.success ? 'PASS' : 'FAIL'}</strong>
            — {botResult.reason} ({botResult.moveCount} moves, {botResult.duration}ms)
            {#if botResult.error}
              <pre class="bot-error">{botResult.error}</pre>
            {/if}
          </div>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  .harness {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 40px);
    font-family: 'Segoe UI', sans-serif;
  }
  .harness-header {
    padding: 0.75rem 1rem;
    background: #1a1a2e;
    border-bottom: 1px solid #333;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .controls select, .controls button {
    padding: 0.4rem 0.75rem;
    background: #2a2a4e;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
  }
  .controls button:hover { background: #3a3a6e; }
  .session-id {
    font-family: monospace;
    font-size: 0.85rem;
    color: #888;
  }
  .error {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #3c1414;
    border: 1px solid #e74c3c;
    border-radius: 4px;
    color: #e74c3c;
  }
  .harness-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .state-viewer {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
  }
  .state-summary {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
  }
  .scores {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }
  .scores span { padding: 0.25rem 0.5rem; border-radius: 4px; background: #2a2a4e; }
  .scores .active { background: #1abc9c; color: #0a0a1a; font-weight: bold; }
  .state-json, .moves-list {
    font-size: 0.75rem;
    background: #111;
    padding: 0.75rem;
    border-radius: 4px;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }
  .renderer-container {
    min-height: 400px;
    background: #0a0a1a;
    border: 1px solid #333;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  .renderer-container:empty { display: none; }
  .renderer-error {
    padding: 0.5rem;
    background: #3c2e14;
    border: 1px solid #f5a623;
    border-radius: 4px;
    color: #f5a623;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
  .schema-errors {
    margin-bottom: 1rem;
    background: #3c1414;
    border: 1px solid #e74c3c;
    border-radius: 4px;
    padding: 0.5rem;
  }
  .schema-errors ul { margin: 0.5rem 0 0; padding-left: 1.5rem; font-size: 0.8rem; }
  .schema-errors li { color: #e74c3c; margin-bottom: 0.25rem; }
  .placeholder { color: #666; text-align: center; margin-top: 4rem; }
  details { margin-bottom: 1rem; }
  summary { cursor: pointer; color: #4a90d9; font-weight: bold; }

  .dev-panel {
    width: 320px;
    padding: 1rem;
    background: #12122a;
    border-left: 1px solid #333;
    overflow-y: auto;
  }
  .dev-panel h3 {
    font-size: 0.85rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 1rem 0 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid #333;
  }
  .dev-panel h3:first-child { margin-top: 0; }
  .panel-group { margin-bottom: 0.75rem; }
  .panel-group button {
    display: block;
    width: 100%;
    padding: 0.4rem;
    margin-bottom: 0.25rem;
    background: #2a2a4e;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .panel-group button:hover:not(:disabled) { background: #3a3a6e; }
  .panel-group button:disabled { opacity: 0.5; cursor: not-allowed; }
  .panel-group label { display: block; font-size: 0.8rem; color: #aaa; margin-bottom: 0.25rem; }
  .panel-group input[type="text"],
  .panel-group input[type="number"] {
    padding: 0.3rem 0.5rem;
    background: #1a1a2e;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.8rem;
    width: 100%;
    box-sizing: border-box;
  }
  .panel-group input[type="file"] {
    font-size: 0.75rem;
    color: #aaa;
    margin-bottom: 0.25rem;
  }
  .inline-form {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  .inline-form input { flex: 1; }
  .inline-form button { width: auto; flex-shrink: 0; }
  .auto-bot { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; }
  .bot-controls { display: flex; gap: 0.25rem; }
  .bot-controls button { flex: 1; }
  .bot-result {
    margin-top: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  .bot-success { background: #143c14; border: 1px solid #1abc9c; }
  .bot-failure { background: #3c1414; border: 1px solid #e74c3c; }
  .bot-error { font-size: 0.7rem; margin-top: 0.25rem; white-space: pre-wrap; }
</style>
