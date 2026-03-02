<script lang="ts">
	/**
	 * Friends page — search for users, manage friend requests, view friends list.
	 *
	 * Features:
	 *   - Search bar with 300ms debounce, shows "Add Friend" button per result
	 *   - Pending requests: incoming (Accept/Decline) and outgoing (Cancel)
	 *   - Friends list with avatar, online dot, Invite to Game and Remove buttons
	 *   - Polling: refreshes on tab focus + every 30 seconds
	 *   - Auth guard: redirects to /auth/login if not authenticated
	 */
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { getAvatarEmoji } from '$lib/avatars.js';
	import {
		getFriends,
		getPendingRequests,
		searchUsers,
		sendFriendRequest,
		acceptRequest,
		declineRequest,
		removeFriend,
		createInviteLink,
		type FriendInfo,
		type FriendRequest,
		type UserSearchResult,
	} from '$lib/api/friendApi.js';

	// ── Auth ─────────────────────────────────────────────────────────────────
	const session = authClient.useSession();

	// ── State ─────────────────────────────────────────────────────────────────
	let friends = $state<FriendInfo[]>([]);
	let incomingRequests = $state<FriendRequest[]>([]);
	let outgoingRequests = $state<FriendRequest[]>([]);
	let loadError = $state<string | null>(null);
	let isLoading = $state(true);

	// Search
	let searchQuery = $state('');
	let searchResults = $state<UserSearchResult[]>([]);
	let searchLoading = $state(false);
	let searchError = $state<string | null>(null);
	let requestSent = $state<Record<string, boolean>>({}); // userId -> sent
	let requestError = $state<Record<string, string>>({}); // userId -> error

	// Action feedback
	let copyToast = $state(false);
	let actionLoading = $state<Record<string, boolean>>({}); // friendshipId -> loading

	// ── Polling ───────────────────────────────────────────────────────────────

	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function loadFriendsData() {
		try {
			const [friendsList, pending] = await Promise.all([
				getFriends(),
				getPendingRequests(),
			]);
			friends = friendsList;
			incomingRequests = pending.incoming;
			outgoingRequests = pending.outgoing;
			loadError = null;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load friends';
		} finally {
			isLoading = false;
		}
	}

	// ── Search ────────────────────────────────────────────────────────────────

	function onSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		searchQuery = value;

		if (debounceTimer) clearTimeout(debounceTimer);

		if (!value || value.length < 2) {
			searchResults = [];
			searchError = null;
			return;
		}

		debounceTimer = setTimeout(() => {
			runSearch(value);
		}, 300);
	}

	async function runSearch(query: string) {
		searchLoading = true;
		searchError = null;
		try {
			searchResults = await searchUsers(query);
		} catch (err) {
			searchError = err instanceof Error ? err.message : 'Search failed';
			searchResults = [];
		} finally {
			searchLoading = false;
		}
	}

	async function handleSendRequest(userId: string, username: string) {
		actionLoading = { ...actionLoading, [userId]: true };
		try {
			const result = await sendFriendRequest(username);
			if (result.success) {
				requestSent = { ...requestSent, [userId]: true };
			} else {
				requestError = { ...requestError, [userId]: result.error ?? 'Failed to send request' };
			}
		} catch (err) {
			requestError = { ...requestError, [userId]: err instanceof Error ? err.message : 'Error' };
		} finally {
			actionLoading = { ...actionLoading, [userId]: false };
		}
	}

	// ── Request actions ───────────────────────────────────────────────────────

	async function handleAccept(friendshipId: string) {
		actionLoading = { ...actionLoading, [friendshipId]: true };
		try {
			await acceptRequest(friendshipId);
			await loadFriendsData();
		} catch {
			// silently retry
		} finally {
			actionLoading = { ...actionLoading, [friendshipId]: false };
		}
	}

	async function handleDecline(friendshipId: string) {
		actionLoading = { ...actionLoading, [friendshipId]: true };
		try {
			await declineRequest(friendshipId);
			await loadFriendsData();
		} catch {
			// best effort
		} finally {
			actionLoading = { ...actionLoading, [friendshipId]: false };
		}
	}

	async function handleRemove(friendshipId: string) {
		actionLoading = { ...actionLoading, [friendshipId]: true };
		try {
			await removeFriend(friendshipId);
			await loadFriendsData();
		} catch {
			// best effort
		} finally {
			actionLoading = { ...actionLoading, [friendshipId]: false };
		}
	}

	// ── Invite ────────────────────────────────────────────────────────────────

	async function handleInviteToGame(friendUserId: string) {
		// Navigate to lobby to create a table — the friend's username is displayed in the friends list
		// For now, go to the lobby page where the host creates a table and shares the link
		await goto('/lobby');
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	function handleVisibilityChange() {
		if (!document.hidden) {
			loadFriendsData();
		}
	}

	onMount(async () => {
		// Auth guard
		const s = await authClient.getSession();
		if (!s?.data?.user) {
			await goto('/auth/login?next=/friends');
			return;
		}

		await loadFriendsData();

		// Poll every 30 seconds
		pollInterval = setInterval(loadFriendsData, 30_000);

		// Refresh on tab focus
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
		if (debounceTimer) clearTimeout(debounceTimer);
		if (browser) document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	// ── Derived ───────────────────────────────────────────────────────────────

	let onlineFriends = $derived(friends.filter(f => f.isOnline));
	let offlineFriends = $derived(friends.filter(f => !f.isOnline));
	let totalPending = $derived(incomingRequests.length + outgoingRequests.length);
</script>

<main class="friends-page">
	<div class="page-header">
		<h1 class="page-title">Friends</h1>
		{#if totalPending > 0}
			<span class="pending-badge">{totalPending} pending</span>
		{/if}
	</div>

	<!-- Search -->
	<section class="search-section">
		<label class="search-label" for="user-search">Find Players</label>
		<div class="search-bar">
			<input
				id="user-search"
				class="search-input"
				type="text"
				placeholder="Search by username..."
				value={searchQuery}
				oninput={onSearchInput}
				autocomplete="off"
			/>
			{#if searchLoading}
				<span class="search-spinner" aria-hidden="true"></span>
			{/if}
		</div>

		{#if searchError}
			<p class="error-text" role="alert">{searchError}</p>
		{/if}

		{#if searchResults.length > 0}
			<ul class="search-results" role="list">
				{#each searchResults as user (user.userId)}
					<li class="search-result-item">
						<div class="user-avatar" aria-hidden="true">
							{getAvatarEmoji('default')}
						</div>
						<div class="user-info">
							<span class="user-username">{user.username}</span>
							{#if user.displayName !== user.username}
								<span class="user-display">{user.displayName}</span>
							{/if}
						</div>
						<div class="search-action">
							{#if requestSent[user.userId]}
								<span class="sent-label">Request Sent</span>
							{:else if requestError[user.userId]}
								<span class="error-label">{requestError[user.userId]}</span>
							{:else}
								<button
									class="btn btn-sm btn-primary"
									onclick={() => handleSendRequest(user.userId, user.username)}
									disabled={actionLoading[user.userId]}
								>
									{actionLoading[user.userId] ? '...' : 'Add Friend'}
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else if searchQuery.length >= 2 && !searchLoading}
			<p class="no-results">No users found for "{searchQuery}"</p>
		{/if}
	</section>

	{#if isLoading}
		<div class="loading" aria-live="polite">Loading friends...</div>
	{:else if loadError}
		<p class="error-text" role="alert">{loadError}</p>
	{:else}
		<!-- Incoming requests -->
		{#if incomingRequests.length > 0}
			<section class="requests-section">
				<h2 class="section-title">Incoming Requests</h2>
				<ul class="request-list" role="list">
					{#each incomingRequests as req (req.friendshipId)}
						<li class="request-card">
							<div class="user-avatar" aria-hidden="true">
								{getAvatarEmoji(req.avatar)}
							</div>
							<div class="user-info">
								<span class="user-username">{req.username}</span>
								{#if req.displayName !== req.username}
									<span class="user-display">{req.displayName}</span>
								{/if}
							</div>
							<div class="request-actions">
								<button
									class="btn btn-sm btn-primary"
									onclick={() => handleAccept(req.friendshipId)}
									disabled={actionLoading[req.friendshipId]}
								>
									{actionLoading[req.friendshipId] ? '...' : 'Accept'}
								</button>
								<button
									class="btn btn-sm btn-ghost"
									onclick={() => handleDecline(req.friendshipId)}
									disabled={actionLoading[req.friendshipId]}
								>
									Decline
								</button>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Outgoing requests -->
		{#if outgoingRequests.length > 0}
			<section class="requests-section">
				<h2 class="section-title">Sent Requests</h2>
				<ul class="request-list" role="list">
					{#each outgoingRequests as req (req.friendshipId)}
						<li class="request-card">
							<div class="user-avatar" aria-hidden="true">
								{getAvatarEmoji(req.avatar)}
							</div>
							<div class="user-info">
								<span class="user-username">{req.username}</span>
								{#if req.displayName !== req.username}
									<span class="user-display">{req.displayName}</span>
								{/if}
								<span class="request-status">Pending</span>
							</div>
							<div class="request-actions">
								<button
									class="btn btn-sm btn-ghost"
									onclick={() => handleDecline(req.friendshipId)}
									disabled={actionLoading[req.friendshipId]}
								>
									{actionLoading[req.friendshipId] ? '...' : 'Cancel'}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Friends list -->
		<section class="friends-section">
			<h2 class="section-title">
				Friends
				{#if friends.length > 0}
					<span class="count-badge">{friends.length}</span>
					{#if onlineFriends.length > 0}
						<span class="online-count">{onlineFriends.length} online</span>
					{/if}
				{/if}
			</h2>

			{#if friends.length === 0}
				<div class="empty-state">
					<p>No friends yet. Search for players to add them!</p>
				</div>
			{:else}
				<ul class="friend-list" role="list">
					{#each [...onlineFriends, ...offlineFriends] as friend (friend.friendshipId)}
						<li class="friend-card">
							<div class="friend-avatar-wrap">
								<div class="user-avatar" aria-hidden="true">
									{getAvatarEmoji(friend.avatar)}
								</div>
								<span
									class="online-dot"
									class:online={friend.isOnline}
									class:offline={!friend.isOnline}
									title={friend.isOnline ? 'Online' : 'Offline'}
									aria-label={friend.isOnline ? 'Online' : 'Offline'}
								></span>
							</div>
							<div class="user-info">
								<span class="user-username">{friend.username}</span>
								{#if friend.displayName !== friend.username}
									<span class="user-display">{friend.displayName}</span>
								{/if}
								<span class="friend-since">
									Friends since {new Date(friend.friendSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
								</span>
							</div>
							<div class="friend-actions">
								<button
									class="btn btn-sm btn-secondary"
									onclick={() => handleInviteToGame(friend.userId)}
									title="Invite to Game"
								>
									Invite
								</button>
								<button
									class="btn btn-sm btn-ghost"
									onclick={() => handleRemove(friend.friendshipId)}
									disabled={actionLoading[friend.friendshipId]}
									title="Remove friend"
								>
									{actionLoading[friend.friendshipId] ? '...' : 'Remove'}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>

{#if copyToast}
	<div class="toast" role="status" aria-live="polite">Link copied!</div>
{/if}

<style>
	.friends-page {
		max-width: 640px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* ── Header ── */

	.page-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.page-title {
		font-size: clamp(1.5rem, 5vw, 2rem);
		font-weight: 800;
		color: #0f172a;
		margin: 0;
	}

	.pending-badge {
		display: inline-block;
		background: #dc2626;
		color: #fff;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.125rem 0.5rem;
		border-radius: 99px;
	}

	/* ── Search ── */

	.search-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.search-label {
		font-weight: 700;
		color: #0f172a;
		font-size: 0.9375rem;
	}

	.search-bar {
		position: relative;
	}

	.search-input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		padding-right: 2.5rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-family: inherit;
		color: #0f172a;
		background: #fff;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.search-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.search-spinner {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		border: 2px solid #e2e8f0;
		border-top-color: #2563eb;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.search-results {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		overflow: hidden;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}

	.search-result-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #f1f5f9;
	}

	.search-result-item:last-child {
		border-bottom: none;
	}

	.no-results {
		color: #64748b;
		font-size: 0.875rem;
		margin: 0;
	}

	/* ── Common user card ── */

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: #f1f5f9;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.user-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.user-username {
		font-weight: 600;
		color: #1e293b;
		font-size: 0.9375rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-display {
		color: #64748b;
		font-size: 0.8125rem;
	}

	.request-status {
		color: #f59e0b;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.friend-since {
		color: #94a3b8;
		font-size: 0.75rem;
	}

	.sent-label {
		color: #16a34a;
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.error-label {
		color: #dc2626;
		font-size: 0.75rem;
		max-width: 120px;
		text-align: right;
	}

	.search-action {
		flex-shrink: 0;
	}

	/* ── Requests ── */

	.requests-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.request-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.request-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
	}

	.request-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* ── Friends list ── */

	.friends-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.count-badge {
		background: #e2e8f0;
		color: #475569;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.1rem 0.5rem;
		border-radius: 99px;
	}

	.online-count {
		color: #16a34a;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.empty-state {
		text-align: center;
		color: #94a3b8;
		padding: 2rem;
		background: #f8fafc;
		border: 1px dashed #cbd5e1;
		border-radius: 10px;
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9375rem;
	}

	.friend-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.friend-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
	}

	.friend-avatar-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.online-dot {
		position: absolute;
		bottom: 1px;
		right: 1px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid #fff;
	}

	.online-dot.online {
		background: #16a34a;
	}

	.online-dot.offline {
		background: #94a3b8;
	}

	.friend-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* ── Buttons ── */

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		font-family: inherit;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: background 0.15s, opacity 0.15s;
		text-decoration: none;
	}

	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.btn-sm {
		font-size: 0.8125rem;
		padding: 0.375rem 0.75rem;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
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

	.btn-ghost {
		background: transparent;
		color: #64748b;
		border: 1px solid transparent;
	}

	.btn-ghost:hover:not(:disabled) {
		background: #f1f5f9;
		color: #374151;
	}

	/* ── Toast ── */

	.toast {
		position: fixed;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		background: #0f172a;
		color: #e2e8f0;
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		z-index: 500;
		animation: fade-in 0.2s ease-out;
	}

	/* ── Misc ── */

	.loading {
		text-align: center;
		color: #64748b;
		padding: 2rem;
	}

	.error-text {
		color: #dc2626;
		font-size: 0.875rem;
		margin: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@keyframes fade-in {
		from { opacity: 0; transform: translateX(-50%) translateY(4px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	/* ── Mobile ── */

	@media (max-width: 480px) {
		.friends-page {
			padding: 1.25rem 0.75rem 3rem;
		}

		.friend-actions,
		.request-actions {
			flex-direction: column;
		}
	}
</style>
