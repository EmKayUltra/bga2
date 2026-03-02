<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { configureAppSync, subscribeToChatChannel, type ChatMessage } from '$lib/appsync.js';
	import { getApiToken } from '$lib/api/gameApi.js';

	// ── Props ─────────────────────────────────────────────────────────────────
	let {
		channelId,
		currentUserId = '',
		currentUsername,
	}: {
		channelId: string;
		currentUserId?: string;
		currentUsername: string;
	} = $props();

	// ── State ─────────────────────────────────────────────────────────────────
	let messages = $state<ChatMessage[]>([]);
	let inputText = $state('');
	let sending = $state(false);
	let reportedMessages = $state<Set<string>>(new Set());
	let cleanup: (() => void) | null = null;
	let chatContainer: HTMLDivElement;

	const API_BASE = browser
		? (import.meta.env.VITE_API_URL || 'http://localhost:8080')
		: (import.meta.env.API_SERVER_URL || 'http://server:8080');

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	onMount(async () => {
		if (!browser) return;
		configureAppSync();
		cleanup = await subscribeToChatChannel(channelId, (msg: ChatMessage) => {
			messages = [...messages, msg];
			// Auto-scroll to bottom after DOM update
			requestAnimationFrame(() => {
				chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
			});
		});
	});

	onDestroy(() => {
		cleanup?.();
	});

	// ── Handlers ─────────────────────────────────────────────────────────────

	async function sendMessage() {
		const text = inputText.trim();
		if (!text || sending) return;

		sending = true;
		try {
			const token = await getApiToken();
			if (!token) {
				console.warn('[ChatPanel] Not authenticated — cannot send message');
				return;
			}
			await fetch(`${API_BASE}/chat/${channelId}/send`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ message: text }),
			});
			inputText = '';
		} catch (err) {
			console.error('[ChatPanel] Failed to send message:', err);
		} finally {
			sending = false;
		}
	}

	async function reportMessage(msg: ChatMessage) {
		// Create a stable key for this message
		const key = `${msg.userId}:${msg.timestamp}`;
		if (reportedMessages.has(key)) return;

		try {
			const token = await getApiToken();
			if (!token) return;

			await fetch(`${API_BASE}/chat/${channelId}/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					reportedUserId: msg.userId,
					messageText: msg.message,
				}),
			});

			// Mark as reported (immutable set replacement for reactivity)
			const next = new Set(reportedMessages);
			next.add(key);
			reportedMessages = next;
		} catch (err) {
			console.error('[ChatPanel] Failed to report message:', err);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function formatTime(timestamp: string): string {
		try {
			return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	function isOwnMessage(msg: ChatMessage): boolean {
		// Match by userId (preferred) or username if userId is unavailable
		if (currentUserId && msg.userId === currentUserId) return true;
		return msg.username === currentUsername;
	}
</script>

<div class="chat-panel">
	<!-- Message list -->
	<div class="message-list" bind:this={chatContainer} aria-label="Chat messages" aria-live="polite">
		{#if messages.length === 0}
			<p class="empty-state">No messages yet</p>
		{:else}
			{#each messages as msg (msg.userId + ':' + msg.timestamp)}
				{@const own = isOwnMessage(msg)}
				{@const reportKey = msg.userId + ':' + msg.timestamp}
				<div class="message" class:message--own={own} class:message--other={!own}>
					<div class="message-header">
						<span class="message-sender">{own ? 'You' : msg.username}</span>
						<span class="message-time">{formatTime(msg.timestamp)}</span>
					</div>
					<div class="message-bubble">
						<span class="message-text">{msg.message}</span>
					</div>
					{#if !own}
						<div class="message-actions">
							{#if reportedMessages.has(reportKey)}
								<span class="report-done">Reported</span>
							{:else}
								<button
									class="report-btn"
									onclick={() => reportMessage(msg)}
									title="Report this message"
									aria-label="Report message from {msg.username}"
								>
									Report
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	<!-- Input bar -->
	<div class="input-bar">
		<input
			class="message-input"
			type="text"
			placeholder="Type a message..."
			bind:value={inputText}
			onkeydown={handleKeyDown}
			maxlength="500"
			disabled={sending}
			aria-label="Chat message input"
		/>
		<button
			class="send-btn"
			onclick={sendMessage}
			disabled={sending || !inputText.trim()}
			aria-label="Send message"
		>
			{#if sending}
				...
			{:else}
				Send
			{/if}
		</button>
	</div>
</div>

<style>
	.chat-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 200px;
		background: #0f172a;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		overflow: hidden;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	/* ── Message list ── */

	.message-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
	}

	.message-list::-webkit-scrollbar {
		width: 4px;
	}

	.message-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.12);
		border-radius: 2px;
	}

	.empty-state {
		text-align: center;
		color: #475569;
		font-size: 0.8125rem;
		margin: auto;
		padding: 1rem;
	}

	/* ── Individual messages ── */

	.message {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		max-width: 85%;
	}

	.message--own {
		align-self: flex-end;
		align-items: flex-end;
	}

	.message--other {
		align-self: flex-start;
		align-items: flex-start;
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		color: #64748b;
	}

	.message-sender {
		font-weight: 600;
	}

	.message-time {
		opacity: 0.7;
	}

	.message-bubble {
		padding: 0.4375rem 0.75rem;
		border-radius: 12px;
		word-break: break-word;
	}

	.message--own .message-bubble {
		background: #2563eb;
		color: #ffffff;
		border-bottom-right-radius: 3px;
	}

	.message--other .message-bubble {
		background: rgba(255, 255, 255, 0.07);
		color: #e2e8f0;
		border-bottom-left-radius: 3px;
	}

	.message-text {
		font-size: 0.875rem;
		line-height: 1.4;
	}

	/* ── Report button ── */

	.message-actions {
		margin-top: 0.125rem;
	}

	.report-btn {
		background: transparent;
		border: none;
		color: #475569;
		font-size: 0.6875rem;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
		transition: color 0.15s;
	}

	.report-btn:hover {
		color: #f87171;
	}

	.report-done {
		font-size: 0.6875rem;
		color: #4ade80;
	}

	/* ── Input bar ── */

	.input-bar {
		display: flex;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(0, 0, 0, 0.2);
	}

	.message-input {
		flex: 1;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: #e2e8f0;
		font-family: inherit;
		font-size: 0.8125rem;
		padding: 0.4375rem 0.625rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.message-input::placeholder {
		color: #475569;
	}

	.message-input:focus {
		border-color: rgba(96, 165, 250, 0.4);
	}

	.message-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-btn {
		background: #2563eb;
		border: none;
		border-radius: 6px;
		color: #ffffff;
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0.4375rem 0.875rem;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.send-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.send-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
