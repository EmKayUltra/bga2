/**
 * pushSubscription — client-side VAPID push subscription helpers.
 *
 * Usage:
 *   import { subscribeToPush, isPushPermissionGranted, isInstalledPWA } from '$lib/pushSubscription';
 *
 *   const sub = await subscribeToPush(import.meta.env.VITE_VAPID_PUBLIC_KEY);
 *   if (sub) await subscribePush(sub); // from notificationApi.ts
 */

/**
 * Converts a URL-safe base64 VAPID key to Uint8Array for PushManager.subscribe.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Subscribe to Web Push notifications via the browser PushManager.
 * Returns the PushSubscription if successful, null if permission denied or unavailable.
 *
 * @param vapidPublicKey - The VAPID public key from VITE_VAPID_PUBLIC_KEY env var
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		console.warn('Push notifications not supported in this browser');
		return null;
	}

	const registration = await navigator.serviceWorker.ready;

	// Check for existing subscription first
	const existing = await registration.pushManager.getSubscription();
	if (existing) return existing;

	try {
		return await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
		});
	} catch (err) {
		console.error('Push subscription failed:', err);
		return null;
	}
}

/**
 * Check if the user has already granted push permission.
 */
export function isPushPermissionGranted(): boolean {
	if (!('Notification' in window)) return false;
	return Notification.permission === 'granted';
}

/**
 * Check if running as installed PWA (for iOS detection).
 * iOS requires home screen install for push to work.
 */
export function isInstalledPWA(): boolean {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}
