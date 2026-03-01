<script lang="ts">
	/**
	 * Game page — mounts the PixiJS canvas and initializes the game scene.
	 *
	 * SSR is disabled via +page.ts `export const ssr = false`.
	 * SceneManager is dynamically imported inside onMount so PixiJS never
	 * runs on the server (guards against "self is not defined" errors).
	 *
	 * Flow:
	 *   1. onMount: dynamically import SceneManager
	 *   2. Load Azul game.json (static import works because resolveJsonModule: true)
	 *   3. Create SceneManager with container and config
	 *   4. init() → PixiAdapter, viewport, GameLoader, FSM, AzulScene.renderBoard()
	 *   5. For Phase 1 demo: attempt to create a game session via server API
	 *   6. onDestroy: clean up renderer + FSM
	 */
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types.js';
	import type { SceneManagerState } from '$lib/engine/SceneManager.js';

	// Page data from load function (contains the game session ID from URL)
	let { data }: { data: PageData } = $props();

	// Container element bound to the <div> for canvas mounting
	let container: HTMLElement;

	// Loading state
	let loading = $state(true);
	let errorMessage = $state<string | null>(null);

	// SceneManager instance (dynamically imported in onMount)
	let sceneManager: import('$lib/engine/SceneManager.js').SceneManager | null = null;

	// Observable state from SceneManager (for dev toolbar)
	let gameState = $state<SceneManagerState>({
		sessionId: null,
		playerId: 'player-1',
		currentFsmState: 'idle',
		lastMoveResult: null,
		validMoves: [],
	});

	onMount(async () => {
		try {
			// 1. Dynamically import SceneManager (SSR-safe — only runs in browser)
			const { SceneManager } = await import('$lib/engine/SceneManager.js');

			// 2. Load Azul game config (embedded as TypeScript for reliable Vite module resolution)
			// In Phase 2, this will be fetched from the server's game registry
			const { azulGameConfig: gameConfig } = await import('$lib/azul-game-config.js');

			// 3. Create SceneManager with the mounted container
			sceneManager = new SceneManager(container, gameConfig);

			// Wire reactivity: update gameState when SceneManager state changes
			sceneManager.onStateChange = () => {
				if (sceneManager) {
					gameState = { ...sceneManager.state };
				}
			};

			// 4. Initialize: renderer, viewport, model, FSM, scene render
			const sessionId = data.id !== 'test' ? data.id : undefined;
			await sceneManager.init(sessionId);

			// 5. Phase 1 demo: if session ID is 'test', try to create a game session
			if (data.id === 'test') {
				try {
					const { createGame } = await import('$lib/api/gameApi.js');
					const response = await createGame('azul');
					sceneManager.state.sessionId = response.id;
					await sceneManager.refreshValidMoves();
				} catch {
					// Server might not be running — that's OK for Phase 1 demo
					// The game scene renders fine without server interaction
					console.info('[GamePage] Server not available — running in offline demo mode');
				}
			}

			loading = false;
			gameState = { ...sceneManager.state };
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to initialize game';
			loading = false;
			console.error('[GamePage] Init error:', err);
		}
	});

	onDestroy(() => {
		sceneManager?.destroy();
		sceneManager = null;
	});

	function handleResetGame() {
		sceneManager?.resetGame();
	}
</script>

<!-- Game container — fills full viewport, overflow hidden (viewport handles nav) -->
<div
	class="game-container"
	bind:this={container}
	role="application"
	aria-label="Azul board game"
>
	{#if loading}
		<div class="loading-overlay">
			<div class="loading-spinner"></div>
			<p class="loading-text">Loading game...</p>
		</div>
	{/if}

	{#if errorMessage}
		<div class="error-overlay">
			<p class="error-text">{errorMessage}</p>
			<a href="/" class="error-link">Return to home</a>
		</div>
	{/if}
</div>

<!-- Phase 1 dev toolbar — shows FSM state and last move result for debugging -->
<div class="dev-toolbar" aria-label="Dev toolbar (Phase 1)">
	<div class="dev-toolbar-section">
		<span class="dev-label">FSM:</span>
		<span class="dev-value dev-fsm-state">{gameState.currentFsmState}</span>
	</div>

	<div class="dev-toolbar-section">
		<span class="dev-label">Session:</span>
		<span class="dev-value">{gameState.sessionId ?? 'offline'}</span>
	</div>

	<div class="dev-toolbar-section">
		<span class="dev-label">Valid moves:</span>
		<span class="dev-value">{gameState.validMoves.length}</span>
	</div>

	{#if gameState.lastMoveResult}
		<div class="dev-toolbar-section">
			<span class="dev-label">Last move:</span>
			<span
				class="dev-value"
				class:dev-valid={gameState.lastMoveResult.valid}
				class:dev-invalid={!gameState.lastMoveResult.valid}
			>
				{gameState.lastMoveResult.valid ? 'valid' : 'invalid'}
				{#if gameState.lastMoveResult.errors?.length}
					— {gameState.lastMoveResult.errors.join(', ')}
				{/if}
			</span>
		</div>
	{/if}

	<div class="dev-toolbar-actions">
		<button class="dev-button" onclick={handleResetGame}>Reset Game</button>
	</div>
</div>

<style>
	/* ── Game container ── */
	.game-container {
		width: 100%;
		height: 100vh;
		background: #fafaf8;   /* light + clean theme */
		overflow: hidden;       /* viewport handles navigation — no scrollbars */
		position: relative;
		cursor: grab;
	}

	/* Grabbing cursor state is applied to the canvas element directly by PixiJS,
	   but we set grab as the default for the container */
	.game-container:active {
		cursor: grabbing;
	}

	/* ── Loading overlay ── */
	.loading-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #fafaf8;
		gap: 1rem;
		z-index: 10;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #e2e8f0;
		border-top-color: #4a90d9;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.loading-text {
		color: #64748b;
		font-size: 0.9375rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		margin: 0;
	}

	/* ── Error overlay ── */
	.error-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #fafaf8;
		gap: 1rem;
		z-index: 10;
	}

	.error-text {
		color: #dc2626;
		font-size: 1rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		margin: 0;
		max-width: 480px;
		text-align: center;
	}

	.error-link {
		color: #4a90d9;
		font-size: 0.875rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		text-decoration: underline;
	}

	/* ── Dev toolbar (Phase 1 only) ── */
	.dev-toolbar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 44px;
		background: rgba(15, 23, 42, 0.92);
		backdrop-filter: blur(8px);
		color: #94a3b8;
		font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
		font-size: 0.75rem;
		display: flex;
		align-items: center;
		padding: 0 1rem;
		gap: 1.5rem;
		z-index: 100;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.dev-toolbar-section {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.dev-label {
		color: #475569;
	}

	.dev-value {
		color: #94a3b8;
	}

	.dev-fsm-state {
		color: #38bdf8;
		font-weight: 600;
	}

	.dev-valid {
		color: #4ade80;
	}

	.dev-invalid {
		color: #f87171;
	}

	.dev-toolbar-actions {
		margin-left: auto;
	}

	.dev-button {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		color: #94a3b8;
		font-family: inherit;
		font-size: 0.75rem;
		padding: 0.25rem 0.75rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.dev-button:hover {
		background: rgba(255, 255, 255, 0.14);
		color: #cbd5e1;
	}
</style>
