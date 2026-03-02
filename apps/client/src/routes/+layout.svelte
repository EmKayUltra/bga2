<script lang="ts">
	import { authClient } from '$lib/auth-client';

	let { children } = $props();

	// Reactive session state from Better Auth
	const session = authClient.useSession();

	async function handleSignOut() {
		await authClient.signOut();
		// Reload to update session state
		window.location.href = '/';
	}
</script>

<div class="app">
	<nav class="navbar">
		<a href="/" class="nav-brand">BGA2</a>

		<div class="nav-actions">
			{#if $session?.data?.user}
				<span class="nav-username">{($session.data.user as { username?: string }).username ?? $session.data.user.name}</span>
				<button class="nav-button" onclick={handleSignOut}>Sign out</button>
			{:else}
				<a href="/auth/login" class="nav-link">Sign in</a>
				<a href="/auth/register" class="nav-link nav-link--primary">Register</a>
			{/if}
		</div>
	</nav>

	{@render children()}
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.navbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.5rem;
		background: #ffffff;
		border-bottom: 1px solid #e2e8f0;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.nav-brand {
		font-size: 1.25rem;
		font-weight: 800;
		color: #0f172a;
		text-decoration: none;
		letter-spacing: -0.02em;
	}

	.nav-brand:hover {
		color: #2563eb;
	}

	.nav-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.nav-username {
		font-size: 0.9375rem;
		font-weight: 500;
		color: #374151;
	}

	.nav-button {
		padding: 0.375rem 0.875rem;
		background: transparent;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.875rem;
		font-family: inherit;
		color: #374151;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.nav-button:hover {
		background: #f1f5f9;
		border-color: #94a3b8;
	}

	.nav-link {
		font-size: 0.9375rem;
		color: #374151;
		text-decoration: none;
		padding: 0.375rem 0.5rem;
		border-radius: 6px;
		transition: color 0.15s;
	}

	.nav-link:hover {
		color: #2563eb;
	}

	.nav-link--primary {
		background: #2563eb;
		color: #ffffff;
		padding: 0.375rem 0.875rem;
		font-weight: 500;
	}

	.nav-link--primary:hover {
		background: #1d4ed8;
		color: #ffffff;
	}
</style>
