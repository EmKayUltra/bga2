<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import {
		listTables,
		createTable,
		quickPlay,
		type TableListItem,
		type CreateTableRequest,
	} from '$lib/api/lobbyApi.js';

	// ── Session ──────────────────────────────────────────────────────────────
	const session = authClient.useSession();

	// ── State ────────────────────────────────────────────────────────────────

	let tables = $state<TableListItem[]>([]);
	let loadError = $state<string | null>(null);
	let isLoading = $state(true);

	// Create dialog state
	let showCreate = $state(false);
	let createDisplayName = $state('My Azul Table');
	let createMinPlayers = $state(2);
	let createMaxPlayers = $state(4);
	let createIsPrivate = $state(false);
	let createPassword = $state('');
	let createError = $state<string | null>(null);
	let createLoading = $state(false);

	// Quick Play state
	let quickPlayLoading = $state(false);
	let quickPlayError = $state<string | null>(null);

	// ── Polling ──────────────────────────────────────────────────────────────

	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function fetchTables() {
		try {
			tables = await listTables();
			loadError = null;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load tables';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchTables();
		pollInterval = setInterval(fetchTables, 5000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});

	// ── Handlers ─────────────────────────────────────────────────────────────

	async function handleCreate() {
		if (!createDisplayName.trim()) {
			createError = 'Table name is required';
			return;
		}

		createError = null;
		createLoading = true;

		try {
			const req: CreateTableRequest = {
				gameId: 'azul',
				displayName: createDisplayName.trim(),
				minPlayers: createMinPlayers,
				maxPlayers: createMaxPlayers,
				isPrivate: createIsPrivate,
				password: createIsPrivate && createPassword ? createPassword : undefined,
			};
			const result = await createTable(req);
			await goto(`/table/${result.id}`);
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create table';
			createLoading = false;
		}
	}

	async function handleQuickPlay() {
		quickPlayError = null;
		quickPlayLoading = true;
		try {
			const result = await quickPlay('azul');
			await goto(`/table/${result.tableId}`);
		} catch (err) {
			quickPlayError = err instanceof Error ? err.message : 'Quick Play failed';
			quickPlayLoading = false;
		}
	}

	function formatAge(createdAt: string): string {
		const diff = Date.now() - new Date(createdAt).getTime();
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		return `${Math.floor(mins / 60)}h ago`;
	}
</script>

<main class="lobby">
	<div class="lobby-header">
		<h1 class="lobby-title">Game Lobby</h1>
		<p class="lobby-subtitle">Find an open table or create your own</p>
	</div>

	{#if !$session?.data?.user}
		<div class="auth-notice">
			<p>You must be signed in to create tables or use Quick Play.</p>
			<a href="/auth/login?next=/lobby" class="btn btn-primary">Sign in to play</a>
		</div>
	{/if}

	{#if $session?.data?.user}
		<div class="lobby-actions">
			<button
				class="btn btn-primary btn-quick-play"
				onclick={handleQuickPlay}
				disabled={quickPlayLoading}
			>
				{#if quickPlayLoading}
					<span class="spinner" aria-hidden="true"></span>
					Finding game...
				{:else}
					Quick Play
				{/if}
			</button>

			<button class="btn btn-secondary" onclick={() => (showCreate = true)}>
				Create Table
			</button>
		</div>

		{#if quickPlayError}
			<p class="error-message" role="alert">{quickPlayError}</p>
		{/if}
	{/if}

	<!-- Table list -->
	<section class="table-list-section">
		<h2 class="section-title">Open Tables</h2>

		{#if isLoading}
			<div class="loading-state">Loading tables...</div>
		{:else if loadError}
			<p class="error-message">{loadError}</p>
		{:else if tables.length === 0}
			<div class="empty-state">
				<p>No open tables right now.</p>
				{#if $session?.data?.user}
					<p>Be the first — create a table or use Quick Play!</p>
				{:else}
					<p>Sign in to create a table or join a game.</p>
				{/if}
			</div>
		{:else}
			<ul class="table-list" role="list">
				{#each tables as table (table.id)}
					<li class="table-card">
						<div class="table-info">
							<span class="table-name">{table.displayName}</span>
							<span class="table-meta">
								{table.gameId} &bull; hosted by {table.hostName} &bull; {formatAge(table.createdAt)}
							</span>
						</div>
						<div class="table-right">
							<span class="table-players">
								{table.playerCount}/{table.maxPlayers}
							</span>
							{#if $session?.data?.user}
								<a href="/table/{table.id}" class="btn btn-sm btn-join">Join</a>
							{:else}
								<a href="/auth/login?next=/table/{table.id}" class="btn btn-sm btn-join">Sign in to join</a>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<p class="poll-note">List refreshes every 5 seconds.</p>
	</section>
</main>

<!-- Create Table Dialog -->
{#if showCreate}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="dialog-overlay" onclick={() => (showCreate = false)}>
		<div class="dialog" role="dialog" aria-labelledby="create-dialog-title" onclick={(e) => e.stopPropagation()}>
			<h2 id="create-dialog-title" class="dialog-title">Create Table</h2>

			<div class="field">
				<label class="label" for="table-name">Table name</label>
				<input
					id="table-name"
					type="text"
					class="input"
					bind:value={createDisplayName}
					maxlength="128"
					placeholder="My Azul Table"
					disabled={createLoading}
				/>
			</div>

			<div class="field">
				<label class="label" for="game-id">Game</label>
				<select id="game-id" class="select" disabled>
					<option value="azul">Azul</option>
				</select>
			</div>

			<div class="field-row">
				<div class="field">
					<label class="label" for="min-players">Min players</label>
					<select
						id="min-players"
						class="select"
						bind:value={createMinPlayers}
						disabled={createLoading}
					>
						<option value={2}>2</option>
						<option value={3}>3</option>
						<option value={4}>4</option>
					</select>
				</div>
				<div class="field">
					<label class="label" for="max-players">Max players</label>
					<select
						id="max-players"
						class="select"
						bind:value={createMaxPlayers}
						disabled={createLoading}
					>
						<option value={2}>2</option>
						<option value={3}>3</option>
						<option value={4}>4</option>
					</select>
				</div>
			</div>

			<div class="field field-checkbox">
				<input
					id="is-private"
					type="checkbox"
					class="checkbox"
					bind:checked={createIsPrivate}
					disabled={createLoading}
				/>
				<label class="label label-inline" for="is-private">Private (invite only)</label>
			</div>

			{#if createIsPrivate}
				<div class="field">
					<label class="label" for="table-password">Password (optional)</label>
					<input
						id="table-password"
						type="password"
						class="input"
						bind:value={createPassword}
						placeholder="Leave blank for no password"
						disabled={createLoading}
					/>
				</div>
			{/if}

			{#if createError}
				<p class="error-message" role="alert">{createError}</p>
			{/if}

			<div class="dialog-actions">
				<button
					class="btn btn-secondary"
					onclick={() => (showCreate = false)}
					disabled={createLoading}
				>
					Cancel
				</button>
				<button class="btn btn-primary" onclick={handleCreate} disabled={createLoading}>
					{#if createLoading}
						<span class="spinner" aria-hidden="true"></span>
						Creating...
					{:else}
						Create
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.lobby {
		max-width: 760px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	.lobby-header {
		text-align: center;
	}

	.lobby-title {
		font-size: clamp(1.75rem, 5vw, 2.5rem);
		font-weight: 800;
		color: #0f172a;
		margin: 0 0 0.375rem;
	}

	.lobby-subtitle {
		color: #64748b;
		margin: 0;
	}

	/* ── Auth notice ── */

	.auth-notice {
		background: #f0f9ff;
		border: 1px solid #bae6fd;
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.auth-notice p {
		margin: 0;
		color: #0369a1;
		font-size: 0.9375rem;
	}

	/* ── Actions bar ── */

	.lobby-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.btn-quick-play {
		min-width: 160px;
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

	.btn-sm {
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
	}

	.btn-join {
		background: #2563eb;
		color: #ffffff;
	}

	.btn-join:hover {
		background: #1d4ed8;
	}

	/* ── Table list ── */

	.table-list-section {
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
		font-size: 1.125rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
	}

	.loading-state {
		color: #64748b;
		text-align: center;
		padding: 1.5rem 0;
	}

	.empty-state {
		text-align: center;
		color: #64748b;
		padding: 1.5rem 0;
	}

	.empty-state p {
		margin: 0 0 0.5rem;
	}

	.table-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.table-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		flex-wrap: wrap;
	}

	.table-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.table-name {
		font-weight: 600;
		color: #1e293b;
		font-size: 0.9375rem;
	}

	.table-meta {
		font-size: 0.8125rem;
		color: #64748b;
	}

	.table-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.table-players {
		font-size: 0.875rem;
		color: #475569;
		font-weight: 500;
	}

	.poll-note {
		font-size: 0.8125rem;
		color: #94a3b8;
		margin: 0;
		text-align: right;
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

	/* ── Dialog ── */

	.dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	.dialog {
		background: #ffffff;
		border-radius: 12px;
		padding: 2rem;
		width: 100%;
		max-width: 440px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.dialog-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.field-checkbox {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	.label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
	}

	.label-inline {
		margin: 0;
	}

	.input,
	.select {
		padding: 0.625rem 0.875rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-family: inherit;
		color: #1e293b;
		background: #ffffff;
	}

	.input:focus,
	.select:focus {
		outline: none;
		border-color: #4a90d9;
		box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);
	}

	.checkbox {
		width: 1.125rem;
		height: 1.125rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.dialog-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
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

	@media (max-width: 520px) {
		.lobby {
			padding: 1.25rem 0.75rem 3rem;
		}

		.auth-notice {
			flex-direction: column;
			align-items: flex-start;
		}

		.table-card {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
