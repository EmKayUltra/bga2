<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { pwaInfo } from 'virtual:pwa-info';
	import { getMyGames } from '$lib/api/lobbyApi.js';

	let { children } = $props();

	// Reactive session state from Better Auth
	const session = authClient.useSession();

	// PWA web manifest link tag — injected by @vite-pwa/sveltekit
	// undefined in dev when devOptions.enabled is false
	let webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

	// In-app badge: count of async games where it's the player's turn
	let myTurnCount = $state(0);
	let badgePollInterval: ReturnType<typeof setInterval> | null = null;

	async function fetchBadgeCount() {
		if (!$session?.data?.user) {
			myTurnCount = 0;
			return;
		}
		try {
			const games = await getMyGames();
			myTurnCount = games.filter(g => g.isMyTurn).length;
		} catch {
			// Silent fail
		}
	}

	onMount(() => {
		fetchBadgeCount();
		badgePollInterval = setInterval(fetchBadgeCount, 60000);
	});

	onDestroy(() => {
		if (badgePollInterval) clearInterval(badgePollInterval);
	});

	async function handleSignOut() {
		await authClient.signOut();
		// Reload to update session state
		window.location.href = '/';
	}
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

<div class="app">
	<nav class="navbar">
		<a href="/" class="nav-brand">BGA2</a>

		<div class="nav-actions">
			{#if $session?.data?.user}
				{@const username = ($session.data.user as { username?: string }).username ?? $session.data.user.name}
				<a href="/lobby" class="nav-link nav-link--lobby">
					Lobby
					{#if myTurnCount > 0}
						<span class="nav-badge" aria-label="{myTurnCount} games need your attention">{myTurnCount}</span>
					{/if}
				</a>
				<a href="/profile/{username}" class="nav-link nav-link--user">{username}</a>
				<a href="/settings" class="nav-link">Settings</a>
				<button class="nav-button" onclick={handleSignOut}>Sign out</button>
			{:else}
				<a href="/lobby" class="nav-link">Lobby</a>
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

	.nav-link--user {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #1e293b;
	}

	.nav-link--user:hover {
		color: #2563eb;
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

	.nav-link--lobby {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.nav-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		background: #ef4444;
		color: #ffffff;
		font-size: 0.6875rem;
		font-weight: 700;
		border-radius: 9px;
		line-height: 1;
	}
</style>
