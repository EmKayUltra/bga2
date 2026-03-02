<script lang="ts">
	/**
	 * Game page — mounts the PixiJS canvas and drives the Azul game session.
	 *
	 * SSR is disabled via +page.ts `export const ssr = false`.
	 * SceneManager is dynamically imported inside onMount so PixiJS never
	 * runs on the server (guards against "self is not defined" errors).
	 *
	 * Features:
	 *   - Turn banner: animated "{PlayerName}'s Turn" toast on each turn change
	 *   - Active player top bar: Round N, current player name, score
	 *   - Score summary overlay on game end: wall/row/col/color/floor breakdown + winner
	 *   - Floor overflow warning: opt-in localStorage toggle (default: auto-overflow)
	 *   - Production info bar replaces Phase 1 dev toolbar
	 */
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { PageData } from './$types.js';
	import type { SceneManagerState, ConnectionState } from '$lib/engine/SceneManager.js';
	import type { GameState } from '@bga2/shared-types';
	import type { GameStateResponse } from '$lib/api/gameApi.js';
	import DevMenu from '$lib/components/DevMenu.svelte';
	import { sendFriendRequest } from '$lib/api/friendApi.js';
	import { authClient } from '$lib/auth-client';

	// Page data from load function (contains the game session ID from URL)
	let { data }: { data: PageData } = $props();

	// Container element bound to the <div> for canvas mounting
	let container: HTMLElement;

	// Loading state
	let loading = $state(true);
	let errorMessage = $state<string | null>(null);

	// SceneManager instance (dynamically imported in onMount)
	let sceneManager: import('$lib/engine/SceneManager.js').SceneManager | null = null;

	// Observable state from SceneManager
	let gameState = $state<SceneManagerState>({
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
		connectionState: 'connected',
		localPlayerIndex: null,
		version: 0,
	});

	// Connection status indicator
	let connectionState = $state<ConnectionState>('connected');

	// Turn banner state
	let turnBanner = $state<string | null>(null);
	let turnBannerTimer: ReturnType<typeof setTimeout> | null = null;

	// Score summary state (when game finishes)
	let finishedGameState = $state<GameState | null>(null);

	// Post-game friend prompt state: tracks request status per player name
	let friendRequestStatus = $state<Record<string, 'idle' | 'loading' | 'sent' | 'error'>>({});
	let currentUserName = $state<string | null>(null);

	// Floor overflow preference (opt-in; stored in localStorage)
	let floorOverflowWarning = $state(false);

	// Computed properties
	let currentPlayerName = $derived(
		gameState.playerNames[gameState.currentPlayerIndex] ??
		`Player ${gameState.currentPlayerIndex + 1}`
	);

	let currentPlayerScore = $derived(
		gameState.playerScores[gameState.currentPlayerIndex] ?? 0
	);

	let currentRound = $derived(gameState.gameState?.round ?? 1);

	/**
	 * Turn status for multiplayer: "Your turn" vs "Waiting for {playerName}".
	 * In hot-seat mode (localPlayerIndex == null), always shows current player name.
	 */
	let turnStatus = $derived(() => {
		if (gameState.localPlayerIndex === null) {
			// Hot-seat mode: show whose turn it is
			return `${currentPlayerName}'s Turn`;
		}
		if (gameState.currentPlayerIndex === gameState.localPlayerIndex) {
			return 'Your Turn';
		}
		return `Waiting for ${currentPlayerName}`;
	});

	let winnerName = $derived(() => {
		if (!finishedGameState?.winnerId) return null;
		const winner = finishedGameState.players.find(p => p.id === finishedGameState?.winnerId);
		return winner?.name ?? null;
	});

	/**
	 * Show the turn banner for 2 seconds, then auto-hide.
	 */
	function showTurnBanner(playerName: string): void {
		if (turnBannerTimer !== null) {
			clearTimeout(turnBannerTimer);
			turnBannerTimer = null;
		}
		turnBanner = `${playerName}'s Turn`;
		turnBannerTimer = setTimeout(() => {
			turnBanner = null;
			turnBannerTimer = null;
		}, 2000);
	}

	/**
	 * Compute per-player score breakdown from wall grid data.
	 * The server computes the final score; we derive the breakdown client-side
	 * from the player's wall data for the summary table.
	 */
	function computeBreakdown(player: GameState['players'][number]): {
		wall: number;
		rows: number;
		cols: number;
		colors: number;
		floor: number;
		total: number;
	} {
		const data = player.data as Record<string, unknown>;
		const wall = (data.wallScore as number) ?? 0;
		const rows = (data.rowBonus as number) ?? 0;
		const cols = (data.colBonus as number) ?? 0;
		const colors = (data.colorBonus as number) ?? 0;
		const floor = (data.floorPenalty as number) ?? 0;
		return { wall, rows, cols, colors, floor, total: player.score };
	}

	/**
	 * Start a new game — navigate back to home/lobby.
	 */
	function startNewGame(): void {
		window.location.href = '/';
	}

	/**
	 * Send a friend request to an opponent by their username (player name).
	 * Players in Azul use their display name as the player name.
	 */
	async function handleAddFriend(opponentName: string): Promise<void> {
		friendRequestStatus = { ...friendRequestStatus, [opponentName]: 'loading' };
		try {
			const result = await sendFriendRequest(opponentName);
			friendRequestStatus = {
				...friendRequestStatus,
				[opponentName]: result.success ? 'sent' : 'error',
			};
		} catch {
			friendRequestStatus = { ...friendRequestStatus, [opponentName]: 'error' };
		}
	}

	/**
	 * Handle a state update from the DevMenu.
	 * Pushes fresh state from the dev endpoint through SceneManager and triggers re-render.
	 */
	function handleDevStateUpdate(response: GameStateResponse): void {
		if (!sceneManager) return;
		// Push fresh state into SceneManager
		sceneManager.state.gameState = response.state;
		sceneManager.state.validMoves = response.validMoves;
		sceneManager.state.currentPlayerIndex = response.state.currentPlayerIndex;
		sceneManager.state.playerNames = response.state.players.map((p: any) => p.name);
		sceneManager.state.playerScores = response.state.players.map((p: any) => p.score);
		// Trigger reactive update
		gameState = { ...sceneManager.state };
		// Re-render the scene with new state
		if ((sceneManager as any).scene) {
			(sceneManager as any).scene.updateFromState(response.state);
			(sceneManager as any).scene.setActivePlayer(response.state.currentPlayerIndex);
		}
		// Check for game end
		if (response.state.finished) {
			finishedGameState = response.state;
		}
	}

	/**
	 * Toggle floor overflow warning preference.
	 */
	function toggleFloorWarning(): void {
		floorOverflowWarning = !floorOverflowWarning;
		try {
			localStorage.setItem('bga2-floor-overflow-warning', String(floorOverflowWarning));
		} catch {
			// localStorage might not be available (SSR shim, privacy mode)
		}
	}

	onMount(async () => {
		// Load floor overflow preference from localStorage
		try {
			const pref = localStorage.getItem('bga2-floor-overflow-warning');
			if (pref !== null) {
				floorOverflowWarning = pref === 'true';
			}
		} catch {
			// ignore
		}

		// Load current user's name so we can exclude them from the friend prompt
		try {
			const session = await authClient.getSession();
			currentUserName = session?.data?.user?.name ?? null;
		} catch {
			// Not logged in — post-game prompt won't show
		}

		try {
			// Dynamically import SceneManager (SSR-safe — only runs in browser)
			const { SceneManager } = await import('$lib/engine/SceneManager.js');

			// Load Azul game config
			const { azulGameConfig: gameConfig } = await import('$lib/azul-game-config.js');

			// Create SceneManager with the mounted container
			sceneManager = new SceneManager(container, gameConfig);

			// Wire reactivity: update gameState when SceneManager state changes
			sceneManager.onStateChange = () => {
				if (sceneManager) {
					gameState = { ...sceneManager.state };
					connectionState = sceneManager.state.connectionState;
				}
			};

			// Wire turn change banner
			sceneManager.onTurnChange = (_playerIndex, playerName) => {
				showTurnBanner(playerName);
			};

			// Wire game finished handler
			sceneManager.onGameFinished = (gs) => {
				finishedGameState = gs;
			};

			// Wire connection state change
			sceneManager.onConnectionStateChange = (state) => {
				connectionState = state;
			};

			// Initialize: renderer, viewport, model, FSM, scene render
			// Use session ID from URL if available (not 'test')
			const sessionId = data.id !== 'test' ? data.id : undefined;
			await sceneManager.init(sessionId);

			loading = false;
			gameState = { ...sceneManager.state };
			connectionState = sceneManager.state.connectionState;

			// Show initial player banner
			if (gameState.playerNames.length > 0) {
				showTurnBanner(gameState.playerNames[0] ?? 'Player 1');
			}

			// ── AppSync real-time subscription (browser only) ─────────────────────
			if (browser && sessionId) {
				const { configureAppSync, subscribeToGame } = await import('$lib/appsync.js');

				configureAppSync();

				// Subscribe to game state channel
				const unsubscribe = await subscribeToGame(
					sessionId,
					sceneManager.applyRemoteState,
				);

				if (unsubscribe && sceneManager) {
					sceneManager.setAppSyncUnsubscribe(unsubscribe);
				}
			}

			// Expose SceneManager on window for puppeteer / dev access
			if (typeof window !== 'undefined') {
				(window as any).__sm = sceneManager;
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to initialize game';
			loading = false;
			console.error('[GamePage] Init error:', err);
		}
	});

	onDestroy(() => {
		if (turnBannerTimer !== null) {
			clearTimeout(turnBannerTimer);
		}
		sceneManager?.destroy();
		sceneManager = null;
	});
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

<!-- Player info top bar — replaces Phase 1 dev toolbar -->
{#if !loading && !errorMessage}
<div class="player-info-bar" aria-label="Game info">
	<div class="info-section">
		<span class="info-label">Round</span>
		<span class="info-value">{currentRound}</span>
	</div>
	<div class="info-divider"></div>
	<div class="info-section active-player">
		<span class="info-label">Turn</span>
		<span class="info-value player-name" class:waiting={gameState.localPlayerIndex !== null && gameState.currentPlayerIndex !== gameState.localPlayerIndex}>{turnStatus()}</span>
	</div>
	<div class="info-divider"></div>
	<div class="info-section">
		<span class="info-label">Score</span>
		<span class="info-value">{currentPlayerScore}</span>
	</div>
	<div class="info-divider"></div>
	<div class="info-section">
		<span class="info-label">Moves</span>
		<span class="info-value">{gameState.validMoves.length}</span>
	</div>

	<div class="info-bar-settings">
		<button
			class="settings-toggle"
			class:active={floorOverflowWarning}
			onclick={toggleFloorWarning}
			title="Toggle floor overflow warning (currently: {floorOverflowWarning ? 'on' : 'off'})"
			aria-pressed={floorOverflowWarning}
		>
			Floor warn: {floorOverflowWarning ? 'on' : 'off'}
		</button>
	</div>
</div>
{/if}

<!-- Turn change banner — fades in/out when turn changes -->
{#if turnBanner}
<div class="turn-banner" role="status" aria-live="polite">
	{turnBanner}
</div>
{/if}

<!-- Connection status banners — shown only when not in normal 'connected' state -->
{#if connectionState === 'reconnecting'}
<div class="connection-banner reconnecting" role="status" aria-live="polite">
	Reconnecting...
</div>
{:else if connectionState === 'disconnected'}
<div class="connection-banner disconnected" role="alert">
	Connection lost
	<button class="reconnect-button" onclick={() => window.location.reload()}>
		Refresh
	</button>
</div>
{/if}

<!-- Score summary overlay — shown when game is finished -->
<!-- Dev menu — toggled with backtick key, bottom-right corner, z-index 500 -->
<DevMenu
	sessionId={gameState.sessionId}
	gameState={gameState}
	onStateUpdated={handleDevStateUpdate}
/>

{#if finishedGameState}
<div class="score-overlay" role="dialog" aria-label="Game over — score summary">
	<div class="score-modal">
		<h2 class="score-title">Game Over!</h2>
		{#if winnerName()}
			<h3 class="score-winner">{winnerName()} Wins!</h3>
		{/if}

		<div class="score-table-wrapper">
			<table class="score-table">
				<thead>
					<tr>
						<th>Player</th>
						<th>Wall</th>
						<th>Rows</th>
						<th>Cols</th>
						<th>Colors</th>
						<th>Floor</th>
						<th>Total</th>
					</tr>
				</thead>
				<tbody>
					{#each finishedGameState.players as player}
					{@const breakdown = computeBreakdown(player)}
					<tr class:winner-row={player.id === finishedGameState?.winnerId}>
						<td class="player-col">{player.name}</td>
						<td>{breakdown.wall}</td>
						<td>{breakdown.rows}</td>
						<td>{breakdown.cols}</td>
						<td>{breakdown.colors}</td>
						<td class="floor-col">{breakdown.floor > 0 ? `-${breakdown.floor}` : '0'}</td>
						<td class="total-col">{breakdown.total}</td>
					</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Post-game friend prompt: shown when user is logged in and game is multiplayer -->
		{#if currentUserName && finishedGameState && finishedGameState.players.length > 1}
			{@const opponents = finishedGameState.players.filter(p => p.name !== currentUserName)}
			{#if opponents.length > 0}
				<div class="friend-prompt">
					<p class="friend-prompt-label">Add opponents as friends?</p>
					<div class="friend-prompt-list">
						{#each opponents as opponent (opponent.id)}
							<div class="friend-prompt-item">
								<span class="friend-prompt-name">{opponent.name}</span>
								{#if friendRequestStatus[opponent.name] === 'sent'}
									<span class="friend-prompt-sent">Request Sent</span>
								{:else if friendRequestStatus[opponent.name] === 'error'}
									<span class="friend-prompt-error">Failed</span>
								{:else}
									<button
										class="btn-add-friend"
										onclick={() => handleAddFriend(opponent.name)}
										disabled={friendRequestStatus[opponent.name] === 'loading'}
									>
										{friendRequestStatus[opponent.name] === 'loading' ? '...' : 'Add Friend'}
									</button>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<button class="new-game-button" onclick={startNewGame}>
			New Game
		</button>
	</div>
</div>
{/if}

<style>
	/* ── Game container ── */
	.game-container {
		width: 100%;
		height: calc(100vh - 44px);  /* subtract player info bar height */
		background: #fafaf8;
		overflow: hidden;
		position: relative;
		cursor: grab;
	}

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

	/* ── Player info bar (replaces dev toolbar) ── */
	.player-info-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 44px;
		background: rgba(15, 23, 42, 0.92);
		backdrop-filter: blur(8px);
		color: #e2e8f0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.8125rem;
		display: flex;
		align-items: center;
		padding: 0 1.25rem;
		gap: 0;
		z-index: 100;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.info-section {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0 1rem;
	}

	.info-divider {
		width: 1px;
		height: 20px;
		background: rgba(255, 255, 255, 0.12);
		flex-shrink: 0;
	}

	.info-label {
		color: #64748b;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-value {
		color: #e2e8f0;
		font-weight: 500;
	}

	.active-player .player-name {
		color: #60a5fa;
		font-weight: 600;
	}

	.info-bar-settings {
		margin-left: auto;
		padding: 0 0.5rem;
	}

	.settings-toggle {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.10);
		border-radius: 4px;
		color: #64748b;
		font-family: inherit;
		font-size: 0.6875rem;
		padding: 0.2rem 0.6rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.settings-toggle.active {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.4);
		color: #60a5fa;
	}

	.settings-toggle:hover {
		background: rgba(255, 255, 255, 0.10);
		color: #94a3b8;
	}

	/* ── Turn banner ── */
	.turn-banner {
		position: fixed;
		top: 24px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(15, 23, 42, 0.92);
		backdrop-filter: blur(8px);
		color: #60a5fa;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		padding: 0.625rem 1.5rem;
		border-radius: 8px;
		border: 1px solid rgba(96, 165, 250, 0.3);
		z-index: 200;
		white-space: nowrap;
		animation: banner-in 0.25s ease-out;
	}

	@keyframes banner-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	/* ── Connection status banners ── */
	.connection-banner {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 250;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.connection-banner.reconnecting {
		background: rgba(217, 119, 6, 0.92);
		color: #fff;
	}

	.connection-banner.disconnected {
		background: rgba(220, 38, 38, 0.92);
		color: #fff;
	}

	.reconnect-button {
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 4px;
		color: #fff;
		font-family: inherit;
		font-size: 0.8125rem;
		padding: 0.2rem 0.6rem;
		cursor: pointer;
	}

	.reconnect-button:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	/* "Waiting" turn indicator — muted to show it's not the local player's turn */
	.player-name.waiting {
		color: #64748b;
		font-weight: 400;
	}

	/* ── Score summary overlay ── */
	.score-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 300;
		padding: 1rem;
	}

	.score-modal {
		background: #0f172a;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 16px;
		padding: 2rem;
		max-width: 600px;
		width: 100%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
	}

	.score-title {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 1.75rem;
		font-weight: 700;
		color: #e2e8f0;
		margin: 0;
	}

	.score-winner {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 1.25rem;
		font-weight: 600;
		color: #fbbf24;
		margin: 0;
	}

	.score-table-wrapper {
		width: 100%;
		overflow-x: auto;
	}

	.score-table {
		width: 100%;
		border-collapse: collapse;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.score-table th {
		padding: 0.5rem 0.75rem;
		text-align: center;
		color: #64748b;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.score-table th:first-child {
		text-align: left;
	}

	.score-table td {
		padding: 0.625rem 0.75rem;
		text-align: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.score-table .player-col {
		text-align: left;
		font-weight: 500;
		color: #e2e8f0;
	}

	.score-table .floor-col {
		color: #f87171;
	}

	.score-table .total-col {
		font-weight: 700;
		color: #60a5fa;
		font-size: 1rem;
	}

	.winner-row td {
		background: rgba(251, 191, 36, 0.08);
	}

	.winner-row .player-col {
		color: #fbbf24;
	}

	.new-game-button {
		background: #4a90d9;
		border: none;
		border-radius: 8px;
		color: #ffffff;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 1rem;
		font-weight: 600;
		padding: 0.75rem 2rem;
		cursor: pointer;
		transition: background 0.15s;
		margin-top: 0.5rem;
	}

	.new-game-button:hover {
		background: #3a7bc8;
	}

	/* ── Post-game friend prompt ── */
	.friend-prompt {
		width: 100%;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.friend-prompt-label {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.8125rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.friend-prompt-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.friend-prompt-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.friend-prompt-name {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.9375rem;
		color: #e2e8f0;
		font-weight: 500;
	}

	.friend-prompt-sent {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.8125rem;
		color: #4ade80;
		font-weight: 600;
	}

	.friend-prompt-error {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.8125rem;
		color: #f87171;
	}

	.btn-add-friend {
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.3);
		border-radius: 6px;
		color: #60a5fa;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0.3125rem 0.875rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-add-friend:hover:not(:disabled) {
		background: rgba(96, 165, 250, 0.25);
	}

	.btn-add-friend:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
