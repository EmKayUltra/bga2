<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { getProfile, getMatchHistory, formatRelativeDate, type ProfileResponse, type MatchHistoryItem } from '$lib/api/socialApi';
	import { getAvatarEmoji } from '$lib/avatars';

	// ── Props from page server load ────────────────────────────────────────────
	let { data } = $props<{ data: { username: string } }>();

	// ── State ─────────────────────────────────────────────────────────────────
	const session = authClient.useSession();

	let profile = $state<ProfileResponse | null>(null);
	let matchHistory = $state<MatchHistoryItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Is this the viewer's own profile?
	let isOwnProfile = $derived(
		!!$session?.data?.user &&
		(($session.data.user as { username?: string }).username === data.username)
	);

	// ── Data loading ──────────────────────────────────────────────────────────
	async function loadProfile() {
		loading = true;
		error = null;
		try {
			const [profileData, historyData] = await Promise.all([
				getProfile(data.username),
				getMatchHistory(data.username),
			]);

			if (!profileData) {
				error = `User "${data.username}" not found.`;
				return;
			}

			profile = profileData;
			matchHistory = historyData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load profile.';
		} finally {
			loading = false;
		}
	}

	// Load on mount
	$effect(() => {
		loadProfile();
	});

	// ── Helpers ───────────────────────────────────────────────────────────────
	function formatDate(isoDate: string): string {
		return new Date(isoDate).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	}
</script>

<main class="profile-page">
	{#if loading}
		<div class="loading">Loading profile...</div>
	{:else if error}
		<div class="error-state">
			<p>{error}</p>
			<a href="/" class="back-link">Back to home</a>
		</div>
	{:else if profile}
		<!-- Profile Header -->
		<section class="profile-header">
			<div class="avatar-display" title={profile.avatar}>
				{getAvatarEmoji(profile.avatar)}
			</div>

			<div class="profile-info">
				<h1 class="profile-username">@{profile.username}</h1>
				{#if profile.displayName && profile.displayName !== profile.username}
					<p class="profile-displayname">{profile.displayName}</p>
				{/if}
				<p class="member-since">Member since {formatDate(profile.memberSince)}</p>
			</div>

			{#if isOwnProfile}
				<a href="/settings" class="edit-button">Edit Profile</a>
			{/if}
		</section>

		{#if !profile.isPublic && !isOwnProfile}
			<!-- Private profile notice -->
			<div class="private-notice">
				<span class="lock-icon">🔒</span>
				<p>This profile is private.</p>
			</div>
		{:else}
			<!-- Stats Row -->
			<section class="stats-section">
				<div class="stat-card">
					<span class="stat-value">{profile.gamesPlayed}</span>
					<span class="stat-label">Games Played</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{profile.winRate.toFixed(1)}%</span>
					<span class="stat-label">Win Rate</span>
				</div>
			</section>

			<!-- Match History -->
			<section class="history-section">
				<h2 class="section-title">Match History</h2>

				{#if matchHistory.length === 0}
					<p class="empty-state">No matches played yet.</p>
				{:else}
					<ul class="match-list">
						{#each matchHistory as match}
							<li class="match-item">
								<div class="match-left">
									<span class="game-name">{match.gameId === 'azul' ? 'Azul' : match.gameId}</span>
									<span class="result-badge" class:won={match.won} class:lost={!match.won}>
										{match.won ? 'Won' : 'Lost'}
									</span>
								</div>
								<div class="match-center">
									<span class="match-score">Score: {match.score}</span>
									<span class="match-rank">Rank {match.rank}/{match.playerCount}</span>
									{#if match.opponents.length > 0}
										<span class="match-opponents">vs {match.opponents.join(', ')}</span>
									{/if}
								</div>
								<div class="match-right">
									<span class="match-date">{formatRelativeDate(match.completedAt)}</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/if}
</main>

<style>
	.profile-page {
		max-width: 720px;
		margin: 0 auto;
		padding: 2rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.loading,
	.empty-state {
		text-align: center;
		color: #64748b;
		padding: 2rem;
	}

	.error-state {
		text-align: center;
		padding: 2rem;
		color: #dc2626;
	}

	.back-link {
		color: #2563eb;
		text-decoration: none;
		display: inline-block;
		margin-top: 1rem;
	}

	/* Profile header */
	.profile-header {
		display: flex;
		align-items: flex-start;
		gap: 1.5rem;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.75rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}

	.avatar-display {
		font-size: 3.5rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.profile-info {
		flex: 1;
		min-width: 0;
	}

	.profile-username {
		font-size: 1.75rem;
		font-weight: 800;
		color: #0f172a;
		margin: 0 0 0.25rem;
	}

	.profile-displayname {
		font-size: 1.0625rem;
		color: #475569;
		margin: 0 0 0.375rem;
	}

	.member-since {
		font-size: 0.875rem;
		color: #94a3b8;
		margin: 0;
	}

	.edit-button {
		display: inline-block;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.875rem;
		color: #374151;
		text-decoration: none;
		white-space: nowrap;
		transition: background 0.15s, border-color 0.15s;
		align-self: flex-start;
	}

	.edit-button:hover {
		background: #f1f5f9;
		border-color: #94a3b8;
	}

	/* Private notice */
	.private-notice {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
		color: #64748b;
	}

	.lock-icon {
		font-size: 1.5rem;
	}

	.private-notice p {
		margin: 0;
		font-size: 0.9375rem;
	}

	/* Stats */
	.stats-section {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 1rem;
	}

	.stat-card {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 1.25rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 800;
		color: #0f172a;
	}

	.stat-label {
		font-size: 0.8125rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Match history */
	.history-section {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0 0 1rem;
	}

	.match-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.match-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.875rem 1rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		flex-wrap: wrap;
	}

	.match-left {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex-shrink: 0;
	}

	.game-name {
		font-weight: 600;
		color: #1e293b;
		font-size: 0.9375rem;
	}

	.result-badge {
		display: inline-block;
		padding: 0.1875rem 0.5625rem;
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.result-badge.won {
		background: #dcfce7;
		color: #166534;
	}

	.result-badge.lost {
		background: #fee2e2;
		color: #991b1b;
	}

	.match-center {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #475569;
	}

	.match-score,
	.match-rank {
		white-space: nowrap;
	}

	.match-opponents {
		color: #64748b;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}

	.match-right {
		flex-shrink: 0;
		font-size: 0.8125rem;
		color: #94a3b8;
		white-space: nowrap;
	}
</style>
