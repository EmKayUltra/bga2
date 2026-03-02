<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import {
		getTable,
		startGame,
		leaveTable,
		type TableDetail,
	} from '$lib/api/lobbyApi.js';

	// ── Session ──────────────────────────────────────────────────────────────
	const session = authClient.useSession();

	// ── Route param ──────────────────────────────────────────────────────────
	const tableId = $derived($page.params.id);

	// ── State ────────────────────────────────────────────────────────────────

	let table = $state<TableDetail | null>(null);
	let loadError = $state<string | null>(null);
	let isLoading = $state(true);

	let startLoading = $state(false);
	let startError = $state<string | null>(null);

	let leaveLoading = $state(false);

	// ── Derived ──────────────────────────────────────────────────────────────

	let currentUserId = $derived($session?.data?.user?.id ?? null);
	let isHost = $derived(table != null && currentUserId != null && table.hostUserId === currentUserId);
	let canStart = $derived(table != null && table.players.length >= table.minPlayers);

	// ── Polling ──────────────────────────────────────────────────────────────

	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function fetchTable() {
		try {
			const detail = await getTable(tableId);
			table = detail;
			loadError = null;

			// Auto-redirect when game starts
			if (detail.status === 'Playing' && detail.sessionId) {
				if (pollInterval) clearInterval(pollInterval);
				await goto(`/game/${detail.sessionId}`);
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load table';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchTable();
		pollInterval = setInterval(fetchTable, 3000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});

	// ── Handlers ─────────────────────────────────────────────────────────────

	async function handleStart() {
		startError = null;
		startLoading = true;
		try {
			const result = await startGame(tableId);
			if (pollInterval) clearInterval(pollInterval);
			await goto(`/game/${result.sessionId}`);
		} catch (err) {
			startError = err instanceof Error ? err.message : 'Failed to start game';
			startLoading = false;
		}
	}

	async function handleLeave() {
		leaveLoading = true;
		try {
			await leaveTable(tableId);
			if (pollInterval) clearInterval(pollInterval);
			await goto('/lobby');
		} catch {
			// Leave is best-effort — navigate anyway
			await goto('/lobby');
		}
	}
</script>

<main class="waiting-room">
	{#if isLoading}
		<div class="loading">Loading table...</div>
	{:else if loadError}
		<div class="error-page">
			<p class="error-message" role="alert">{loadError}</p>
			<a href="/lobby" class="btn btn-secondary">Back to Lobby</a>
		</div>
	{:else if table}
		<div class="room-header">
			<div class="room-title-row">
				<h1 class="room-title">{table.displayName}</h1>
				{#if table.isPrivate}
					<span class="badge badge-private">Private</span>
				{/if}
			</div>
			<p class="room-meta">
				{table.gameId} &bull;
				{table.players.length}/{table.maxPlayers} players &bull;
				need {table.minPlayers}+ to start
			</p>
		</div>

		<!-- Player list -->
		<section class="player-section">
			<h2 class="section-title">Players</h2>
			<ul class="player-list" role="list">
				{#each table.players as player (player.userId)}
					<li class="player-card">
						<div class="player-avatar" aria-hidden="true">
							{player.displayName.charAt(0).toUpperCase()}
						</div>
						<div class="player-info">
							<span class="player-name">
								{player.displayName}
								{#if player.userId === table.hostUserId}
									<span class="host-badge">Host</span>
								{/if}
							</span>
							<span class="seat-label">Seat {player.seatIndex + 1}</span>
						</div>
						<div class="player-status">
							{#if player.isReady}
								<span class="status-ready">Ready</span>
							{:else}
								<span class="status-waiting">Waiting</span>
							{/if}
						</div>
					</li>
				{/each}

				<!-- Empty seats -->
				{#each { length: table.maxPlayers - table.players.length } as _, i}
					<li class="player-card player-card--empty">
						<div class="player-avatar player-avatar--empty" aria-hidden="true">?</div>
						<div class="player-info">
							<span class="player-name player-name--empty">Waiting for player...</span>
							<span class="seat-label">Seat {table.players.length + i + 1}</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<!-- Chat placeholder -->
		<section class="chat-section">
			<h2 class="section-title">Chat</h2>
			<div class="chat-placeholder">
				<p>Chat will be available in a future update.</p>
			</div>
		</section>

		<!-- Actions -->
		<div class="room-actions">
			{#if isHost}
				<button
					class="btn btn-primary btn-start"
					onclick={handleStart}
					disabled={!canStart || startLoading}
					title={!canStart ? `Need ${table.minPlayers} players to start` : ''}
				>
					{#if startLoading}
						<span class="spinner" aria-hidden="true"></span>
						Starting...
					{:else}
						Start Game
					{/if}
				</button>
				{#if !canStart}
					<p class="start-hint">Waiting for {table.minPlayers - table.players.length} more player(s)</p>
				{/if}
			{/if}

			{#if startError}
				<p class="error-message" role="alert">{startError}</p>
			{/if}

			<button class="btn btn-secondary" onclick={handleLeave} disabled={leaveLoading}>
				{#if leaveLoading}
					Leaving...
				{:else}
					Leave Table
				{/if}
			</button>
		</div>
	{/if}
</main>

<style>
	.waiting-room {
		max-width: 640px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	.loading {
		text-align: center;
		color: #64748b;
		padding: 4rem 0;
	}

	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 4rem 0;
	}

	/* ── Room header ── */

	.room-header {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.room-title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.room-title {
		font-size: clamp(1.5rem, 5vw, 2rem);
		font-weight: 800;
		color: #0f172a;
		margin: 0;
	}

	.room-meta {
		color: #64748b;
		margin: 0;
		font-size: 0.9375rem;
	}

	.badge {
		display: inline-block;
		padding: 0.2rem 0.6rem;
		border-radius: 99px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.badge-private {
		background: #fef3c7;
		color: #92400e;
		border: 1px solid #fde68a;
	}

	/* ── Players ── */

	.player-section,
	.chat-section {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	.section-title {
		font-size: 1rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
	}

	.player-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.player-card {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.75rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
	}

	.player-card--empty {
		opacity: 0.5;
	}

	.player-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: #2563eb;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.125rem;
		flex-shrink: 0;
	}

	.player-avatar--empty {
		background: #cbd5e1;
		color: #94a3b8;
	}

	.player-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.player-name {
		font-weight: 600;
		color: #1e293b;
		font-size: 0.9375rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.player-name--empty {
		color: #94a3b8;
		font-weight: 400;
		font-style: italic;
	}

	.host-badge {
		font-size: 0.6875rem;
		font-weight: 700;
		background: #2563eb;
		color: #ffffff;
		padding: 0.125rem 0.5rem;
		border-radius: 99px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.seat-label {
		font-size: 0.8125rem;
		color: #64748b;
	}

	.player-status {
		flex-shrink: 0;
	}

	.status-ready {
		font-size: 0.8125rem;
		font-weight: 600;
		color: #16a34a;
	}

	.status-waiting {
		font-size: 0.8125rem;
		color: #64748b;
	}

	/* ── Chat placeholder ── */

	.chat-placeholder {
		padding: 1.5rem;
		background: #f8fafc;
		border: 1px dashed #cbd5e1;
		border-radius: 8px;
		text-align: center;
		color: #94a3b8;
	}

	.chat-placeholder p {
		margin: 0;
		font-size: 0.9375rem;
	}

	/* ── Actions ── */

	.room-actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.btn-start {
		width: 100%;
	}

	.start-hint {
		text-align: center;
		color: #64748b;
		font-size: 0.875rem;
		margin: 0;
	}

	/* ── Buttons ── */

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		border: none;
		text-decoration: none;
		transition: background 0.15s;
	}

	.btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #2563eb;
		color: #ffffff;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-secondary {
		background: #f1f5f9;
		color: #374151;
		border: 1px solid #d1d5db;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #e2e8f0;
	}

	/* ── Error ── */

	.error-message {
		margin: 0;
		padding: 0.625rem 0.875rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #dc2626;
		font-size: 0.875rem;
	}

	/* ── Spinner ── */

	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ── Mobile ── */

	@media (max-width: 480px) {
		.waiting-room {
			padding: 1.25rem 0.75rem 3rem;
		}
	}
</style>
