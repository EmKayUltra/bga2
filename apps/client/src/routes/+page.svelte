<script lang="ts">
	import { goto } from '$app/navigation';
	import { createGame, saveRecentGame } from '$lib/api/gameApi.js';
	import { authClient } from '$lib/auth-client';

	// ── Session ──────────────────────────────────────────────────────────────

	const session = authClient.useSession();

	// ── State ──────────────────────────────────────────────────────────────────

	let playerCount = $state(2);
	let playerNames = $state<string[]>(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);

	// Derived: only the first N names are used
	let activeNames = $derived(playerNames.slice(0, playerCount));

	// ── Handlers ───────────────────────────────────────────────────────────────

	function handlePlayerCountChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		playerCount = parseInt(target.value, 10);
	}

	function handleNameInput(index: number, event: Event) {
		const target = event.target as HTMLInputElement;
		const updated = [...playerNames];
		updated[index] = target.value;
		playerNames = updated;
	}

	async function handleStartGame() {
		// Validate that all active names are non-empty
		const trimmed = activeNames.map(n => n.trim());
		if (trimmed.some(n => n.length === 0)) {
			errorMessage = 'All player names must be filled in.';
			return;
		}

		errorMessage = null;
		loading = true;

		try {
			const response = await createGame('azul', trimmed);

			// Save to localStorage for the game list page
			saveRecentGame({
				sessionId: response.sessionId,
				createdAt: new Date().toISOString(),
				gameId: 'azul',
				playerNames: trimmed,
			});

			await goto(`/game/${response.sessionId}`);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to create game. Is the server running?';
			loading = false;
		}
	}
</script>

<main>
	<div class="hero">
		<header class="header">
			<h1 class="title">BGA2</h1>
			<p class="tagline">Play board games online</p>
		</header>

		<!-- Lobby CTA for logged-in users -->
		{#if $session?.data?.user}
			<section class="lobby-cta">
				<div class="lobby-cta-text">
					<h2 class="cta-title">Find a Game</h2>
					<p class="cta-subtitle">Browse open tables or jump straight in with Quick Play</p>
				</div>
				<a href="/lobby" class="lobby-button">Go to Lobby</a>
			</section>
		{:else}
			<section class="auth-cta">
				<p class="auth-cta-text">Sign in to play online with others</p>
				<div class="auth-cta-actions">
					<a href="/auth/login" class="btn-link btn-link--primary">Sign in</a>
					<a href="/auth/register" class="btn-link">Register</a>
				</div>
			</section>
		{/if}

		<section class="new-game-section" aria-labelledby="new-game-heading">
			<h2 id="new-game-heading" class="section-title">Start Local Game</h2>

			<div class="field">
				<label for="player-count" class="label">Number of players</label>
				<select
					id="player-count"
					class="select"
					value={playerCount}
					onchange={handlePlayerCountChange}
					disabled={loading}
				>
					<option value={2}>2 players</option>
					<option value={3}>3 players</option>
					<option value={4}>4 players</option>
				</select>
			</div>

			<div class="player-names">
				{#each { length: playerCount } as _, i}
					<div class="field">
						<label for="player-{i}" class="label">Player {i + 1} name</label>
						<input
							id="player-{i}"
							type="text"
							class="input"
							value={playerNames[i]}
							oninput={(e) => handleNameInput(i, e)}
							placeholder="Player {i + 1}"
							minlength="1"
							maxlength="32"
							required
							disabled={loading}
						/>
					</div>
				{/each}
			</div>

			{#if errorMessage}
				<p class="error-message" role="alert">{errorMessage}</p>
			{/if}

			<button
				class="start-button"
				onclick={handleStartGame}
				disabled={loading}
			>
				{#if loading}
					<span class="spinner" aria-hidden="true"></span>
					Starting game...
				{:else}
					Start Game
				{/if}
			</button>
		</section>

		<nav class="resume-link-section">
			<a href="/games" class="resume-link">Resume a game</a>
		</nav>
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
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
	}

	.hero {
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* ── Header ── */

	.header {
		text-align: center;
	}

	.title {
		font-size: clamp(2.5rem, 8vw, 4rem);
		font-weight: 800;
		margin: 0 0 0.5rem;
		color: #0f172a;
		letter-spacing: -0.03em;
	}

	.tagline {
		font-size: 1.125rem;
		color: #64748b;
		margin: 0;
	}

	/* ── New game section ── */

	.new-game-section {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.75rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: #0f172a;
		margin: 0 0 0.25rem;
	}

	/* ── Form fields ── */

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
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
		transition: border-color 0.15s, box-shadow 0.15s;
		appearance: none;
		-webkit-appearance: none;
	}

	.select {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23475569' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.875rem center;
		padding-right: 2.5rem;
	}

	.input:focus,
	.select:focus {
		outline: none;
		border-color: #4a90d9;
		box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);
	}

	.input:disabled,
	.select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.player-names {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* ── Error message ── */

	.error-message {
		margin: 0;
		padding: 0.625rem 0.875rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #dc2626;
		font-size: 0.875rem;
	}

	/* ── Start button ── */

	.start-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: #2563eb;
		color: #ffffff;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, transform 0.1s;
		width: 100%;
		margin-top: 0.25rem;
	}

	.start-button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.start-button:active:not(:disabled) {
		transform: scale(0.98);
	}

	.start-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ── Lobby CTA ── */

	.lobby-cta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
		flex-wrap: wrap;
	}

	.lobby-cta-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.cta-title {
		font-size: 1.0625rem;
		font-weight: 700;
		color: #1e40af;
		margin: 0;
	}

	.cta-subtitle {
		font-size: 0.875rem;
		color: #3b82f6;
		margin: 0;
	}

	.lobby-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.625rem 1.25rem;
		background: #2563eb;
		color: #ffffff;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		text-decoration: none;
		transition: background 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.lobby-button:hover {
		background: #1d4ed8;
	}

	/* ── Auth CTA ── */

	.auth-cta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
		flex-wrap: wrap;
	}

	.auth-cta-text {
		font-size: 0.9375rem;
		color: #475569;
		margin: 0;
	}

	.auth-cta-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.btn-link {
		display: inline-flex;
		padding: 0.5rem 1rem;
		border-radius: 7px;
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		color: #374151;
		background: #f1f5f9;
		border: 1px solid #d1d5db;
		transition: background 0.15s;
	}

	.btn-link:hover {
		background: #e2e8f0;
	}

	.btn-link--primary {
		background: #2563eb;
		color: #ffffff;
		border-color: #2563eb;
	}

	.btn-link--primary:hover {
		background: #1d4ed8;
		border-color: #1d4ed8;
	}

	/* ── Resume link ── */

	.resume-link-section {
		text-align: center;
	}

	.resume-link {
		color: #4a90d9;
		font-size: 0.9375rem;
		text-decoration: none;
		padding: 0.25rem;
	}

	.resume-link:hover {
		text-decoration: underline;
	}

	/* ── Mobile ── */

	@media (max-width: 520px) {
		.new-game-section {
			padding: 1.25rem;
		}
	}
</style>
