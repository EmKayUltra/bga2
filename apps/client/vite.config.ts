import { sveltekit } from '@sveltejs/kit/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		nxViteTsPaths(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'BGA2 — Board Games Online',
				short_name: 'BGA2',
				description: 'Play board games online with friends',
				theme_color: '#1a1a2e',
				background_color: '#1a1a2e',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
			},
			workbox: {
				// Cache API responses with network-first strategy
				runtimeCaching: [
					{
						urlPattern: /^https?:\/\/.*\/api\//,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							expiration: { maxEntries: 50, maxAgeSeconds: 300 },
						},
					},
				],
			},
			// Dev options: disable PWA in dev to avoid SW cache conflicts
			devOptions: {
				enabled: false,
			},
		}),
	],
	server: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		allowedHosts: ['client', 'localhost'],
		hmr: {
			port: 24678,
		},
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom',
	},
});
