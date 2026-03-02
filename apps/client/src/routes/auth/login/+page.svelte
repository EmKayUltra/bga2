<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';

	// ── State ─────────────────────────────────────────────────────────────────

	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);

	// ── Handlers ──────────────────────────────────────────────────────────────

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!username.trim() || !password) {
			errorMessage = 'Username and password are required.';
			return;
		}

		errorMessage = null;
		loading = true;

		try {
			const result = await authClient.signIn.username({
				username: username.trim(),
				password,
			});

			if (result.error) {
				errorMessage = result.error.message ?? 'Invalid username or password.';
				loading = false;
				return;
			}

			// Redirect to next page or home
			const next = $page.url.searchParams.get('next') ?? '/';
			await goto(next);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
			loading = false;
		}
	}
</script>

<main>
	<div class="auth-container">
		<header class="auth-header">
			<h1 class="title">Sign In</h1>
			<p class="subtitle">Welcome back to BGA2</p>
		</header>

		<form class="auth-form" onsubmit={handleSubmit}>
			<div class="field">
				<label for="username" class="label">Username</label>
				<input
					id="username"
					type="text"
					class="input"
					bind:value={username}
					placeholder="your_username"
					required
					disabled={loading}
					autocomplete="username"
				/>
			</div>

			<div class="field">
				<label for="password" class="label">Password</label>
				<input
					id="password"
					type="password"
					class="input"
					bind:value={password}
					placeholder="••••••••"
					required
					disabled={loading}
					autocomplete="current-password"
				/>
			</div>

			{#if errorMessage}
				<p class="error-message" role="alert">{errorMessage}</p>
			{/if}

			<button type="submit" class="submit-button" disabled={loading}>
				{#if loading}
					<span class="spinner" aria-hidden="true"></span>
					Signing in...
				{:else}
					Sign In
				{/if}
			</button>
		</form>

		<p class="auth-link">
			Don't have an account?
			<a href="/auth/register">Create one</a>
		</p>
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

	.auth-container {
		width: 100%;
		max-width: 400px;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.auth-header {
		text-align: center;
	}

	.title {
		font-size: 2rem;
		font-weight: 800;
		margin: 0 0 0.5rem;
		color: #0f172a;
	}

	.subtitle {
		font-size: 1rem;
		color: #64748b;
		margin: 0;
	}

	.auth-form {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.75rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}

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

	.input {
		padding: 0.625rem 0.875rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-family: inherit;
		color: #1e293b;
		background: #ffffff;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.input:focus {
		outline: none;
		border-color: #4a90d9;
		box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);
	}

	.input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		margin: 0;
		padding: 0.625rem 0.875rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #dc2626;
		font-size: 0.875rem;
	}

	.submit-button {
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
		transition: background 0.15s;
		width: 100%;
		margin-top: 0.25rem;
	}

	.submit-button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.submit-button:disabled {
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

	.auth-link {
		text-align: center;
		font-size: 0.9375rem;
		color: #64748b;
		margin: 0;
	}

	.auth-link a {
		color: #2563eb;
		text-decoration: none;
		font-weight: 500;
	}

	.auth-link a:hover {
		text-decoration: underline;
	}
</style>
