<script lang="ts">
	/**
	 * Invite link error page — shown when a token is invalid or expired.
	 *
	 * Normal (valid) invite links are handled entirely in +page.server.ts via redirect.
	 * This page only renders if the server-side load returns error data.
	 */
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<main class="invite-error-page">
	<div class="error-card">
		<div class="error-icon" aria-hidden="true">!</div>
		<h1 class="error-title">Invalid Invite Link</h1>
		<p class="error-message">
			{data.error ?? 'This invite link is invalid or has expired.'}
		</p>
		<p class="error-hint">
			Ask the host to share a new invite link from the game lobby.
		</p>
		<a href="/" class="btn btn-primary">Return to Home</a>
	</div>
</main>

<style>
	.invite-error-page {
		min-height: 60vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
	}

	.error-card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 2.5rem 2rem;
		max-width: 420px;
		width: 100%;
		text-align: center;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.error-icon {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: #fef2f2;
		border: 2px solid #fecaca;
		color: #dc2626;
		font-size: 1.75rem;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.error-title {
		font-size: 1.375rem;
		font-weight: 800;
		color: #0f172a;
		margin: 0;
	}

	.error-message {
		color: #dc2626;
		font-size: 0.9375rem;
		margin: 0;
	}

	.error-hint {
		color: #64748b;
		font-size: 0.875rem;
		margin: 0;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.625rem 1.5rem;
		border-radius: 8px;
		font-family: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		text-decoration: none;
		transition: background 0.15s;
		margin-top: 0.5rem;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}
</style>
