<script lang="ts">
	/**
	 * DevMenu — developer panel for real-time game state manipulation.
	 *
	 * Toggle visibility with the backtick key (`).
	 * Provides:
	 *   - Current game state summary (round, phase, player, finished)
	 *   - Trigger Round End button (calls onRoundEnd hook server-side)
	 *   - Trigger Game End button (sets finished=true, computes winner)
	 *   - Set State textarea (arbitrary JSON override, shallow-merged on state root)
	 *
	 * Fixed in bottom-right corner, above the player info bar (z-index 500).
	 */
	import { onMount, onDestroy } from 'svelte';
	import type { SceneManagerState } from '$lib/engine/SceneManager.js';
	import type { GameStateResponse } from '$lib/api/gameApi.js';
	import { devTriggerRoundEnd, devTriggerGameEnd, devSetState } from '$lib/api/gameApi.js';

	// ─── Props ────────────────────────────────────────────────────────────────

	interface Props {
		sessionId: string | null;
		gameState: SceneManagerState;
		onStateUpdated: (response: GameStateResponse) => void;
	}

	let { sessionId, gameState, onStateUpdated }: Props = $props();

	// ─── Internal state ───────────────────────────────────────────────────────

	let open = $state(false);
	let busy = $state(false);
	let lastError = $state<string | null>(null);
	let stateJson = $state('{}');
	let setStateParseError = $state<string | null>(null);

	// ─── Keyboard handler ─────────────────────────────────────────────────────

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key !== '`') return;
		// Don't toggle if typing in an input/textarea
		const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
		if (tag === 'input' || tag === 'textarea') return;
		open = !open;
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
	});

	// ─── Action helpers ───────────────────────────────────────────────────────

	async function triggerRoundEnd(): Promise<void> {
		if (!sessionId || busy) return;
		busy = true;
		lastError = null;
		try {
			const response = await devTriggerRoundEnd(sessionId);
			onStateUpdated(response);
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function triggerGameEnd(): Promise<void> {
		if (!sessionId || busy) return;
		busy = true;
		lastError = null;
		try {
			const response = await devTriggerGameEnd(sessionId);
			onStateUpdated(response);
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function applySetState(): Promise<void> {
		if (!sessionId || busy) return;
		setStateParseError = null;

		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(stateJson) as Record<string, unknown>;
		} catch (err) {
			setStateParseError = err instanceof Error ? err.message : 'Invalid JSON';
			return;
		}

		busy = true;
		lastError = null;
		try {
			const response = await devSetState(sessionId, parsed);
			onStateUpdated(response);
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	// ─── Derived state display ────────────────────────────────────────────────

	let gs = $derived(gameState.gameState);
	let displayRound = $derived(gs?.round ?? '-');
	let displayPhase = $derived(gs?.phase ?? '-');
	let displayPlayerIndex = $derived(gameState.currentPlayerIndex);
	let displayFinished = $derived(gs?.finished ?? false);
	let displayPlayerCount = $derived(gs?.players?.length ?? '-');
</script>

{#if open}
<div class="dev-menu" role="complementary" aria-label="Developer menu">
	<!-- Header -->
	<div class="dev-header">
		<span class="dev-title">Dev Menu</span>
		<button class="close-btn" onclick={() => { open = false; }} aria-label="Close dev menu">
			&times;
		</button>
	</div>

	<!-- State summary -->
	<div class="dev-section">
		<div class="section-label">Game State</div>
		<div class="state-grid">
			<span class="state-key">Round</span>
			<span class="state-val">{displayRound}</span>
			<span class="state-key">Phase</span>
			<span class="state-val phase-val">{displayPhase}</span>
			<span class="state-key">Player</span>
			<span class="state-val">{displayPlayerIndex} / {displayPlayerCount}</span>
			<span class="state-key">Finished</span>
			<span class="state-val" class:finished-yes={displayFinished}>{displayFinished ? 'yes' : 'no'}</span>
		</div>
	</div>

	<!-- Action buttons -->
	<div class="dev-section">
		<div class="section-label">Actions</div>
		<div class="action-buttons">
			<button
				class="dev-btn"
				class:busy={busy}
				disabled={busy || !sessionId}
				onclick={triggerRoundEnd}
			>
				{busy ? 'Working...' : 'Trigger Round End'}
			</button>
			<button
				class="dev-btn dev-btn-danger"
				class:busy={busy}
				disabled={busy || !sessionId}
				onclick={triggerGameEnd}
			>
				{busy ? 'Working...' : 'Trigger Game End'}
			</button>
		</div>
	</div>

	<!-- Set State -->
	<div class="dev-section">
		<div class="section-label">Set State (JSON)</div>
		<textarea
			class="state-textarea"
			rows={3}
			bind:value={stateJson}
			placeholder="e.g. &lbrace;&quot;round&quot;: 5&rbrace;"
			aria-label="JSON state overrides"
		></textarea>
		{#if setStateParseError}
			<div class="parse-error">{setStateParseError}</div>
		{/if}
		<button
			class="dev-btn"
			class:busy={busy}
			disabled={busy || !sessionId}
			onclick={applySetState}
		>
			{busy ? 'Working...' : 'Apply'}
		</button>
	</div>

	<!-- Error display -->
	{#if lastError}
		<div class="dev-error">{lastError}</div>
	{/if}

	<!-- Session ID (for quick copy) -->
	{#if sessionId}
		<div class="dev-session-id" title={sessionId}>
			ID: {sessionId.slice(0, 8)}...
		</div>
	{:else}
		<div class="dev-session-id no-session">No session</div>
	{/if}
</div>
{/if}

<style>
	.dev-menu {
		position: fixed;
		bottom: 52px; /* above the 44px player info bar with a bit of margin */
		right: 12px;
		width: 320px;
		background: rgba(15, 23, 42, 0.95);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		z-index: 500;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
		font-size: 0.8125rem;
		color: #e2e8f0;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	/* Header */
	.dev-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.875rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.04);
	}

	.dev-title {
		font-weight: 600;
		font-size: 0.8125rem;
		color: #60a5fa;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.close-btn {
		background: none;
		border: none;
		color: #64748b;
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.25rem;
		transition: color 0.15s;
	}

	.close-btn:hover {
		color: #e2e8f0;
	}

	/* Sections */
	.dev-section {
		padding: 0.625rem 0.875rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.section-label {
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #64748b;
		margin-bottom: 0.125rem;
	}

	/* State summary grid */
	.state-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.125rem 0.75rem;
	}

	.state-key {
		color: #64748b;
		font-size: 0.75rem;
	}

	.state-val {
		color: #94a3b8;
		font-size: 0.75rem;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.phase-val {
		color: #a78bfa;
	}

	.finished-yes {
		color: #fbbf24;
	}

	/* Buttons */
	.action-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.dev-btn {
		background: rgba(96, 165, 250, 0.12);
		border: 1px solid rgba(96, 165, 250, 0.25);
		border-radius: 6px;
		color: #93c5fd;
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		padding: 0.4375rem 0.75rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.dev-btn:hover:not(:disabled) {
		background: rgba(96, 165, 250, 0.2);
		border-color: rgba(96, 165, 250, 0.4);
		color: #bfdbfe;
	}

	.dev-btn:disabled,
	.dev-btn.busy {
		opacity: 0.5;
		pointer-events: none;
	}

	.dev-btn-danger {
		background: rgba(248, 113, 113, 0.1);
		border-color: rgba(248, 113, 113, 0.25);
		color: #fca5a5;
	}

	.dev-btn-danger:hover:not(:disabled) {
		background: rgba(248, 113, 113, 0.2);
		border-color: rgba(248, 113, 113, 0.4);
		color: #fecaca;
	}

	/* Set State textarea */
	.state-textarea {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: #94a3b8;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.75rem;
		padding: 0.375rem 0.5rem;
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
		outline: none;
		transition: border-color 0.15s;
	}

	.state-textarea:focus {
		border-color: rgba(96, 165, 250, 0.4);
		color: #e2e8f0;
	}

	/* Parse error */
	.parse-error {
		color: #f87171;
		font-size: 0.6875rem;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	/* Error display */
	.dev-error {
		padding: 0.5rem 0.875rem;
		color: #f87171;
		font-size: 0.75rem;
		border-top: 1px solid rgba(248, 113, 113, 0.2);
		background: rgba(248, 113, 113, 0.06);
	}

	/* Session ID */
	.dev-session-id {
		padding: 0.375rem 0.875rem;
		font-size: 0.6875rem;
		color: #334155;
		font-family: 'SF Mono', 'Fira Code', monospace;
		cursor: default;
	}

	.no-session {
		color: #475569;
	}
</style>
