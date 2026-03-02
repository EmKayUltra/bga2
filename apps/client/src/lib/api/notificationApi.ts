/**
 * notificationApi — client-side API calls for push subscriptions and notification preferences.
 *
 * Endpoints (via the C# server at localhost:8080):
 *   POST /notifications/push/subscribe   — register a push subscription (auth)
 *   POST /notifications/push/unsubscribe — remove a push subscription (auth)
 *   GET  /notifications/preferences      — get notification preferences (auth)
 *   PUT  /notifications/preferences      — update notification preferences (auth)
 *
 * Auth: Better Auth JWT token fetched from /api/auth/token and cached for 30s.
 */

import { browser } from '$app/environment';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = browser
  ? (import.meta.env.VITE_API_URL || 'http://localhost:8080')
  : (import.meta.env.API_SERVER_URL || 'http://server:8080');

// ─── Token cache ──────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getApiToken(): Promise<string> {
	if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
	const res = await fetch('/api/auth/token');
	if (!res.ok) throw new Error('Not authenticated');
	const data = (await res.json()) as { token: string };
	tokenCache = { token: data.token, expiresAt: Date.now() + 30_000 };
	return data.token;
}

function authHeaders(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ─── Push subscription ────────────────────────────────────────────────────────

/**
 * Send a push subscription to the server for storage.
 */
export async function subscribePush(subscription: PushSubscription): Promise<void> {
	const token = await getApiToken();
	const sub = subscription.toJSON();
	const res = await fetch(`${API_BASE}/notifications/push/subscribe`, {
		method: 'POST',
		headers: authHeaders(token),
		body: JSON.stringify({
			endpoint: sub.endpoint,
			p256dh: sub.keys?.p256dh ?? '',
			auth: sub.keys?.auth ?? '',
		}),
	});
	if (!res.ok) throw new Error(`Push subscribe failed: ${res.status}`);
}

/**
 * Remove a push subscription from the server.
 */
export async function unsubscribePush(endpoint: string): Promise<void> {
	const token = await getApiToken();
	const res = await fetch(`${API_BASE}/notifications/push/unsubscribe`, {
		method: 'POST',
		headers: authHeaders(token),
		body: JSON.stringify({ endpoint }),
	});
	if (!res.ok) throw new Error(`Push unsubscribe failed: ${res.status}`);
}

// ─── Notification preferences ─────────────────────────────────────────────────

export interface NotificationPreferences {
	emailEnabled: boolean;
	pushEnabled: boolean;
	reminderHoursBeforeDeadline: number;
}

export async function getPreferences(): Promise<NotificationPreferences> {
	const token = await getApiToken();
	const res = await fetch(`${API_BASE}/notifications/preferences`, {
		headers: authHeaders(token),
	});
	if (!res.ok) throw new Error(`Get preferences failed: ${res.status}`);
	return res.json() as Promise<NotificationPreferences>;
}

export async function updatePreferences(prefs: NotificationPreferences): Promise<void> {
	const token = await getApiToken();
	const res = await fetch(`${API_BASE}/notifications/preferences`, {
		method: 'PUT',
		headers: authHeaders(token),
		body: JSON.stringify(prefs),
	});
	if (!res.ok) throw new Error(`Update preferences failed: ${res.status}`);
}
