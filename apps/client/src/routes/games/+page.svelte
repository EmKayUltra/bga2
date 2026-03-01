<script lang="ts">
	import { onMount } from 'svelte';
	import { loadRecentGames, removeRecentGame } from '$lib/api/gameApi.js';
	import type { RecentGame } from '$lib/api/gameApi.js';
	import { getGameState } from '$lib/api/gameApi.js';

	// ── Types ──────────────────────────────────────────────────────────────────

	type GameStatus = 'loading' | 'in-progress' | 'finished' | 'not-found';

	interface GameEntry {
		game: RecentGame;
		status: GameStatus;
	}

	// ── State ──────────────────────────────────────────────────────────────────

	let entries = $state<GameEntry[]>([]);
	let initialising = $state(true);

	// ── Helpers ────────────────────────────────────────────────────────────────

	function formatDate(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			});
		} catch {
			return iso;
		}
	}

	function handleRemove(sessionId: string) {
		removeRecentGame(sessionId);
		entries = entries.filter(e => e.game.sessionId !== sessionId);
	}

	// ── Mount: load from localStorage, then fetch statuses ────────────────────

	onMount(() => {
		const recent = loadRecentGames();

		if (recent.length === 0) {
			initialising = false;
			return;
		}

		// Initialise entries with loading status
		entries = recent.map(game => ({ game, status: 'loading' }));
		initialising = false;

		// Fetch all statuses in parallel (cached per mount — no re-fetch on render)
		void Promise.all(
			recent.map(async (game, index) => {
				try {
					const stateResponse = await getGameState(game.sessionId);
					// Check if game is finished: look for a 'finished' phase in state
					const state = stateResponse.state;
					const isFinished =
						(state as Record<string, unknown>).phase === 'finished' ||
						(state as Record<string, unknown>).status === 'finished';
					entries[index] = {
						game,
						status: isFinished ? 'finished' : 'in-progress',
					};
				} catch (err) {
					const isNotFound =
						err instanceof Error && err.message.includes('404');
					entries[index] = {
						game,
						status: isNotFound ? 'not-found' : 'in-progress',
					};
				}
			})
		);
	});
</script>

<main>
	<div class="page">
		<header class="page-header">
			<a href="/" class="back-link" aria-label="Back to home">← Home</a>
			<h1 class="page-title">Your Games</h1>
		</header>

		{#if initialising}
			<div class="loading-state">
				<div class="spinner" aria-label="Loading"></div>
				<p>Loading games…</p>
			</div>
		{:else if entries.length === 0}
			<div class="empty-state">
				<p class="empty-message">No recent games. Start a new one!</p>
				<a href="/" class="new-game-link">Start New Azul Game</a>
			</div>
		{:else}
			<ul class="game-list" role="list">
				{#each entries as entry (entry.game.sessionId)}
					<li class="game-card">
						<div class="game-card-main">
							<div class="game-info">
								<span class="game-name">
									{entry.game.gameId.charAt(0).toUpperCase() + entry.game.gameId.slice(1)}
								</span>
								<span class="game-players">
									{entry.game.playerNames.join(', ')}
								</span>
								<span class="game-date">{formatDate(entry.game.createdAt)}</span>
							</div>

							<div class="game-actions">
								{#if entry.status === 'loading'}
									<span class="status-badge status-loading">
										<span class="spinner-sm" aria-hidden="true"></span>
										Checking…
									</span>
								{:else if entry.status === 'not-found'}
									<span class="status-badge status-expired">Game expired</span>
									<button
										class="remove-button"
										onclick={() => handleRemove(entry.game.sessionId)}
										aria-label="Remove expired game from list"
									>
										Remove
									</button>
								{:else if entry.status === 'finished'}
									<span class="status-badge status-finished">Finished</span>
									<a href="/game/{entry.game.sessionId}" class="continue-link">View</a>
								{:else}
									<span class="status-badge status-active">In Progress</span>
									<a href="/game/{entry.game.sessionId}" class="continue-link">Continue</a>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="footer-link">
			<a href="/" class="new-game-link">+ Start a new game</a>
		</div>
	</div>
</main>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
		background: #f8fafc;
		color: #1e293b;
	}

	main {
		min-height: 100vh;
		padding: 2rem 1rem;
	}

	.page {
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* ── Header ── */

	.page-header {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back-link {
		color: #64748b;
		font-size: 0.9375rem;
		text-decoration: none;
		padding: 0.25rem;
		flex-shrink: 0;
	}

	.back-link:hover {
		color: #1e293b;
		text-decoration: underline;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		color: #0f172a;
	}

	/* ── Loading ── */

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 3rem;
		color: #64748b;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e2e8f0;
		border-top-color: #4a90d9;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.spinner-sm {
		display: inline-block;
		width: 10px;
		height: 10px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		opacity: 0.7;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ── Empty state ── */

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		padding: 3rem 1rem;
		text-align: center;
	}

	.empty-message {
		color: #64748b;
		font-size: 1rem;
		margin: 0;
	}

	/* ── Game list ── */

	.game-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.game-card {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 1rem 1.25rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
	}

	.game-card-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.game-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.game-name {
		font-weight: 600;
		font-size: 1rem;
		color: #0f172a;
	}

	.game-players {
		font-size: 0.875rem;
		color: #475569;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 260px;
	}

	.game-date {
		font-size: 0.8125rem;
		color: #94a3b8;
	}

	.game-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	/* ── Status badges ── */

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.status-loading {
		background: #f1f5f9;
		color: #64748b;
	}

	.status-active {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.status-finished {
		background: #dcfce7;
		color: #16a34a;
	}

	.status-expired {
		background: #fef2f2;
		color: #dc2626;
	}

	/* ── Actions ── */

	.continue-link {
		display: inline-block;
		padding: 0.375rem 0.875rem;
		background: #2563eb;
		color: #ffffff;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		transition: background 0.15s;
	}

	.continue-link:hover {
		background: #1d4ed8;
	}

	.remove-button {
		background: none;
		border: 1px solid #fca5a5;
		border-radius: 6px;
		color: #dc2626;
		font-size: 0.875rem;
		font-family: inherit;
		padding: 0.375rem 0.75rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.remove-button:hover {
		background: #fef2f2;
	}

	/* ── Footer ── */

	.footer-link {
		text-align: center;
		padding-top: 0.5rem;
	}

	.new-game-link {
		color: #4a90d9;
		font-size: 0.9375rem;
		text-decoration: none;
		padding: 0.25rem;
	}

	.new-game-link:hover {
		text-decoration: underline;
	}

	/* ── Mobile ── */

	@media (max-width: 480px) {
		.game-card-main {
			flex-direction: column;
			align-items: flex-start;
		}

		.game-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
