<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { getProfile, updateProfile, updateUsername, type ProfileResponse } from '$lib/api/socialApi';
	import { getAvatarEmoji, PRESET_AVATAR_IDS } from '$lib/avatars';
	import { getPreferences, updatePreferences, subscribePush } from '$lib/api/notificationApi';
	import { subscribeToPush, isPushPermissionGranted, isInstalledPWA } from '$lib/pushSubscription';

	// ── Auth guard ─────────────────────────────────────────────────────────────
	const session = authClient.useSession();

	// Reactive: redirect to login if not authenticated
	$effect(() => {
		if ($session && !$session.isPending && !$session.data?.user) {
			goto('/auth/login?next=/settings');
		}
	});

	// ── State ─────────────────────────────────────────────────────────────────
	let loadError = $state<string | null>(null);
	let loading = $state(true);

	// Profile form state
	let currentUsername = $state('');
	let selectedAvatar = $state('default');
	let isPublic = $state(true);

	// Username change state
	let newUsername = $state('');
	let usernameLoading = $state(false);
	let usernameSuccess = $state<string | null>(null);
	let usernameError = $state<string | null>(null);
	let usernameCooldownDays = $state<number | null>(null);

	// Profile update state
	let profileSaveLoading = $state(false);
	let profileSaveSuccess = $state<string | null>(null);
	let profileSaveError = $state<string | null>(null);

	// Notification preferences state
	let emailEnabled = $state(true);
	let pushEnabled = $state(true);
	let reminderHours = $state(4);
	let pushPermission = $state<'default' | 'granted' | 'denied'>('default');
	let pushSubscribeLoading = $state(false);
	let notifSaveLoading = $state(false);
	let notifSaveSuccess = $state<string | null>(null);
	let notifSaveError = $state<string | null>(null);

	// ── Load current profile ───────────────────────────────────────────────────
	$effect(() => {
		const user = $session?.data?.user as { username?: string; name?: string } | undefined;
		if (!user?.username) return;

		const username = user.username;
		loading = true;
		loadError = null;

		// Check push permission state (browser-only)
		if (typeof window !== 'undefined' && 'Notification' in window) {
			pushPermission = Notification.permission as 'default' | 'granted' | 'denied';
		}

		// Load profile and notification preferences in parallel
		Promise.all([
			getProfile(username),
			getPreferences().catch(() => null),
		]).then(([profile, prefs]) => {
			if (profile) {
				selectedAvatar = profile.avatar;
				isPublic = profile.isPublic;
				currentUsername = profile.username;
				newUsername = profile.username;
			}
			if (prefs) {
				emailEnabled = prefs.emailEnabled;
				pushEnabled = prefs.pushEnabled;
				reminderHours = prefs.reminderHoursBeforeDeadline;
			}
			loading = false;
		}).catch((e: unknown) => {
			loadError = e instanceof Error ? e.message : 'Failed to load profile.';
			loading = false;
		});
	});

	// ── Handlers ──────────────────────────────────────────────────────────────

	async function handleSaveProfile() {
		profileSaveLoading = true;
		profileSaveSuccess = null;
		profileSaveError = null;

		try {
			await updateProfile({ avatar: selectedAvatar, isPublic });
			profileSaveSuccess = 'Profile saved!';
		} catch (e) {
			profileSaveError = e instanceof Error ? e.message : 'Failed to save profile.';
		} finally {
			profileSaveLoading = false;
		}
	}

	async function handleSaveNotifications() {
		notifSaveLoading = true;
		notifSaveSuccess = null;
		notifSaveError = null;

		try {
			await updatePreferences({
				emailEnabled,
				pushEnabled,
				reminderHoursBeforeDeadline: reminderHours,
			});
			notifSaveSuccess = 'Notification preferences saved!';
		} catch (e) {
			notifSaveError = e instanceof Error ? e.message : 'Failed to save notification preferences.';
		} finally {
			notifSaveLoading = false;
		}
	}

	async function handleEnablePush() {
		const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
		if (!vapidKey) {
			notifSaveError = 'Push notifications not configured.';
			return;
		}

		pushSubscribeLoading = true;
		try {
			const subscription = await subscribeToPush(vapidKey);
			if (subscription) {
				await subscribePush(subscription);
				pushPermission = 'granted';
				pushEnabled = true;
			} else {
				// User denied
				if (typeof window !== 'undefined' && 'Notification' in window) {
					pushPermission = Notification.permission as 'default' | 'granted' | 'denied';
				}
			}
		} catch (e) {
			notifSaveError = e instanceof Error ? e.message : 'Failed to enable push notifications.';
		} finally {
			pushSubscribeLoading = false;
		}
	}

	async function handleChangeUsername() {
		if (!newUsername.trim() || newUsername === currentUsername) return;

		usernameLoading = true;
		usernameSuccess = null;
		usernameError = null;
		usernameCooldownDays = null;

		try {
			const result = await updateUsername(newUsername.trim());
			if (result.success) {
				currentUsername = newUsername.trim();
				usernameSuccess = 'Username changed successfully!';
			} else {
				usernameError = result.error ?? 'Failed to change username.';
				if (result.retryAfterDays) {
					usernameCooldownDays = result.retryAfterDays;
				}
			}
		} catch (e) {
			usernameError = e instanceof Error ? e.message : 'Failed to change username.';
		} finally {
			usernameLoading = false;
		}
	}
</script>

<main class="settings-page">
	<header class="settings-header">
		<h1 class="settings-title">Settings</h1>
		{#if $session?.data?.user}
			<a href="/profile/{currentUsername || ($session.data.user as { username?: string }).username}" class="view-profile-link">
				View Profile
			</a>
		{/if}
	</header>

	{#if loading}
		<div class="loading">Loading your profile...</div>
	{:else if loadError}
		<div class="error-message" role="alert">{loadError}</div>
	{:else}

		<!-- Username Change Section -->
		<section class="settings-section">
			<h2 class="section-title">Username</h2>
			<p class="section-desc">
				Change your username. You can change it once every 30 days.
			</p>

			<div class="field-row">
				<input
					type="text"
					class="input"
					bind:value={newUsername}
					placeholder="new_username"
					maxlength="20"
					disabled={usernameLoading || usernameCooldownDays !== null}
					autocomplete="username"
				/>
				<button
					class="action-button"
					onclick={handleChangeUsername}
					disabled={usernameLoading || !newUsername.trim() || newUsername === currentUsername || usernameCooldownDays !== null}
				>
					{#if usernameLoading}Changing...{:else}Change Username{/if}
				</button>
			</div>

			{#if usernameCooldownDays !== null}
				<p class="cooldown-notice">
					You can change your username again in <strong>{usernameCooldownDays} days</strong>.
				</p>
			{/if}
			{#if usernameSuccess}
				<p class="success-message" role="status">{usernameSuccess}</p>
			{/if}
			{#if usernameError && usernameCooldownDays === null}
				<p class="error-message" role="alert">{usernameError}</p>
			{/if}
		</section>

		<!-- Avatar Selection Section -->
		<section class="settings-section">
			<h2 class="section-title">Avatar</h2>
			<p class="section-desc">Choose an avatar that represents you.</p>

			<div class="avatar-grid">
				{#each PRESET_AVATAR_IDS as avatarId}
					<button
						class="avatar-option"
						class:selected={selectedAvatar === avatarId}
						onclick={() => { selectedAvatar = avatarId; }}
						title={avatarId}
						aria-label="Select {avatarId} avatar"
						aria-pressed={selectedAvatar === avatarId}
					>
						{getAvatarEmoji(avatarId)}
					</button>
				{/each}
			</div>
		</section>

		<!-- Privacy Section -->
		<section class="settings-section">
			<h2 class="section-title">Privacy</h2>

			<label class="toggle-label">
				<input
					type="checkbox"
					class="toggle-input"
					bind:checked={isPublic}
				/>
				<span class="toggle-track">
					<span class="toggle-thumb"></span>
				</span>
				<span class="toggle-text">
					{#if isPublic}
						<strong>Public profile</strong> — anyone can view your stats and match history
					{:else}
						<strong>Private profile</strong> — only you can see your stats and match history
					{/if}
				</span>
			</label>
		</section>

		<!-- Notifications Section -->
		<section class="settings-section">
			<h2 class="section-title">Notifications</h2>
			<p class="section-desc">Control how you receive turn notifications for async games.</p>

			<!-- Email toggle -->
			<label class="toggle-label">
				<input
					type="checkbox"
					class="toggle-input"
					bind:checked={emailEnabled}
				/>
				<span class="toggle-track">
					<span class="toggle-thumb"></span>
				</span>
				<span class="toggle-text">
					<strong>Email notifications</strong> — receive email when it's your turn in async games
				</span>
			</label>

			<!-- Push notifications -->
			{#if pushPermission === 'denied'}
				<p class="push-blocked-notice">
					Push notifications were blocked. Enable them in your browser settings, then reload this page.
				</p>
			{:else if pushPermission === 'granted'}
				<label class="toggle-label">
					<input
						type="checkbox"
						class="toggle-input"
						bind:checked={pushEnabled}
					/>
					<span class="toggle-track">
						<span class="toggle-thumb"></span>
					</span>
					<span class="toggle-text">
						<strong>Push notifications</strong> — receive push notifications when it's your turn
					</span>
				</label>
			{:else}
				<div class="push-prompt-row">
					<span class="toggle-text">
						<strong>Push notifications</strong> — receive push notifications when it's your turn
					</span>
					<button
						class="action-button"
						onclick={handleEnablePush}
						disabled={pushSubscribeLoading}
					>
						{pushSubscribeLoading ? 'Enabling...' : 'Enable Push Notifications'}
					</button>
				</div>
			{/if}

			<!-- Reminder timing -->
			<div class="field-row">
				<label class="label" for="reminder-hours">Remind me before deadline</label>
				<select id="reminder-hours" class="select" bind:value={reminderHours}>
					<option value={0}>Off</option>
					<option value={1}>1 hour before</option>
					<option value={2}>2 hours before</option>
					<option value={4}>4 hours before (default)</option>
					<option value={8}>8 hours before</option>
					<option value={12}>12 hours before</option>
				</select>
			</div>

			<div class="notif-save-row">
				<button
					class="action-button"
					onclick={handleSaveNotifications}
					disabled={notifSaveLoading}
				>
					{notifSaveLoading ? 'Saving...' : 'Save Notifications'}
				</button>
				{#if notifSaveSuccess}
					<p class="success-message" role="status">{notifSaveSuccess}</p>
				{/if}
				{#if notifSaveError}
					<p class="error-message" role="alert">{notifSaveError}</p>
				{/if}
			</div>
		</section>

		<!-- Save Button -->
		<div class="save-row">
			<button
				class="save-button"
				onclick={handleSaveProfile}
				disabled={profileSaveLoading}
			>
				{#if profileSaveLoading}Saving...{:else}Save Profile{/if}
			</button>

			{#if profileSaveSuccess}
				<p class="success-message" role="status">{profileSaveSuccess}</p>
			{/if}
			{#if profileSaveError}
				<p class="error-message" role="alert">{profileSaveError}</p>
			{/if}
		</div>

	{/if}
</main>

<style>
	.settings-page {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.settings-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.settings-title {
		font-size: 2rem;
		font-weight: 800;
		color: #0f172a;
		margin: 0;
	}

	.view-profile-link {
		font-size: 0.9375rem;
		color: #2563eb;
		text-decoration: none;
		padding: 0.375rem 0.75rem;
		border: 1px solid #bfdbfe;
		border-radius: 6px;
		transition: background 0.15s;
	}

	.view-profile-link:hover {
		background: #eff6ff;
	}

	.loading {
		text-align: center;
		color: #64748b;
		padding: 2rem;
	}

	.settings-section {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}

	.section-title {
		font-size: 1.0625rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
	}

	.section-desc {
		font-size: 0.875rem;
		color: #64748b;
		margin: -0.5rem 0 0;
	}

	/* Username field */
	.field-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.input {
		flex: 1;
		min-width: 160px;
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

	.action-button {
		padding: 0.625rem 1.25rem;
		background: #0f172a;
		color: #ffffff;
		border: none;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.15s;
	}

	.action-button:hover:not(:disabled) {
		background: #1e293b;
	}

	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cooldown-notice {
		font-size: 0.875rem;
		color: #92400e;
		background: #fef3c7;
		border: 1px solid #fde68a;
		border-radius: 8px;
		padding: 0.625rem 0.875rem;
		margin: 0;
	}

	/* Avatar grid */
	.avatar-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
		gap: 0.625rem;
	}

	.avatar-option {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.75rem;
		width: 56px;
		height: 56px;
		background: #f8fafc;
		border: 2px solid #e2e8f0;
		border-radius: 10px;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, transform 0.1s;
		padding: 0;
	}

	.avatar-option:hover {
		border-color: #94a3b8;
		background: #f1f5f9;
		transform: scale(1.05);
	}

	.avatar-option.selected {
		border-color: #2563eb;
		background: #eff6ff;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
	}

	/* Privacy toggle */
	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		cursor: pointer;
	}

	.toggle-input {
		/* Hide native checkbox */
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-track {
		position: relative;
		display: inline-block;
		width: 44px;
		height: 24px;
		background: #d1d5db;
		border-radius: 999px;
		transition: background 0.2s;
		flex-shrink: 0;
	}

	.toggle-input:checked + .toggle-track {
		background: #2563eb;
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		background: #ffffff;
		border-radius: 50%;
		transition: transform 0.2s;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-input:checked + .toggle-track .toggle-thumb {
		transform: translateX(20px);
	}

	.toggle-text {
		font-size: 0.9375rem;
		color: #374151;
		line-height: 1.4;
	}

	/* Save section */
	.save-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.save-button {
		padding: 0.75rem 2rem;
		background: #2563eb;
		color: #ffffff;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}

	.save-button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.save-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	/* Notifications section */
	.push-blocked-notice {
		font-size: 0.875rem;
		color: #92400e;
		background: #fef3c7;
		border: 1px solid #fde68a;
		border-radius: 8px;
		padding: 0.625rem 0.875rem;
		margin: 0;
	}

	.push-prompt-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.field-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		white-space: nowrap;
	}

	.select {
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-family: inherit;
		color: #1e293b;
		background: #ffffff;
	}

	.notif-save-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding-top: 0.25rem;
	}

	/* Messages */
	.success-message {
		font-size: 0.875rem;
		color: #166534;
		background: #dcfce7;
		border: 1px solid #bbf7d0;
		border-radius: 8px;
		padding: 0.5rem 0.875rem;
		margin: 0;
	}

	.error-message {
		font-size: 0.875rem;
		color: #dc2626;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		padding: 0.5rem 0.875rem;
		margin: 0;
	}
</style>
