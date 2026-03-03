import { sveltekit } from '@sveltejs/kit/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { watch as chokidarWatch } from 'chokidar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function gameWatcherPlugin(): Plugin {
	const gamesDir = '../../libs/games';

	return {
		name: 'bga2-game-watcher',
		resolveId(id) {
			// Virtual module: import gameList from 'virtual:game-list'
			if (id === 'virtual:game-list') return '\0virtual:game-list';
		},
		load(id) {
			// Dynamic game discovery: enumerate libs/games/*/ directories containing game.json
			if (id === '\0virtual:game-list') {
				const resolved = path.resolve(__dirname, gamesDir);
				let dirs: string[] = [];
				try {
					dirs = fs.readdirSync(resolved, { withFileTypes: true })
						.filter((d) => d.isDirectory() && fs.existsSync(path.join(resolved, d.name, 'game.json')))
						.map((d) => d.name);
				} catch {
					// libs/games/ may not exist in some environments
				}
				return `export default ${JSON.stringify(dirs)};`;
			}
		},
		configureServer(server) {
			// Watch all game packages for changes
			const resolved = path.resolve(__dirname, gamesDir);
			const watcher = chokidarWatch(resolved, {
				ignored: /(node_modules|\.git|dist)/,
				persistent: true,
				depth: 4,
				awaitWriteFinish: { stabilityThreshold: 300 }
			});
			watcher.on('change', (filePath) => {
				console.log(`[game-watcher] Changed: ${filePath} — triggering reload`);
				// Invalidate the virtual module so game list is re-enumerated
				const mod = server.moduleGraph.getModuleById('\0virtual:game-list');
				if (mod) server.moduleGraph.invalidateModule(mod);
				server.ws.send({ type: 'full-reload' });
			});
			watcher.on('addDir', () => {
				// New game directory added — invalidate game list
				const mod = server.moduleGraph.getModuleById('\0virtual:game-list');
				if (mod) server.moduleGraph.invalidateModule(mod);
				server.ws.send({ type: 'full-reload' });
			});
			// Cleanup on server shutdown
			server.httpServer?.on('close', () => { void watcher.close(); });
		}
	};
}

export default defineConfig({
	plugins: [
		sveltekit(),
		nxViteTsPaths(),
		gameWatcherPlugin(),
		SvelteKitPWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
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
			// Runtime caching moved into custom service-worker.ts
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
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
		proxy: {
			'/api': {
				target: 'http://server:8080',
				rewrite: (p: string) => p.replace(/^\/api/, ''),
			},
		},
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom',
	},
});
