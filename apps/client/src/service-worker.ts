/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// Workbox precaching — injected by vite-plugin-pwa at build time
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Network-first caching for API calls (migrated from vite.config.ts workbox.runtimeCaching)
registerRoute(
	({ url }) => url.pathname.startsWith('/api/'),
	new NetworkFirst({
		cacheName: 'api-cache',
		plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
	})
);

// ── Push Notification Handler ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
	if (!event.data) return;

	let data: { title: string; body: string; url?: string };
	try {
		data = event.data.json();
	} catch {
		data = { title: 'BGA2', body: event.data.text() };
	}

	event.waitUntil(
		self.registration.showNotification(data.title, {
			body: data.body,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: data.url ?? '/' },
			tag: 'bga2-turn',   // Replace previous turn notification (avoid stacking)
			renotify: true,     // Vibrate/sound even when replacing same tag
		} as NotificationOptions)
	);
});

// ── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const targetUrl = (event.notification.data as { url?: string } | null)?.url ?? '/';

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// If a window is already open, focus it and navigate
			for (const client of clientList) {
				if ('focus' in client) {
					client.focus();
					(client as WindowClient).navigate(targetUrl);
					return;
				}
			}
			// Otherwise open a new window
			return self.clients.openWindow(targetUrl);
		})
	);
});
