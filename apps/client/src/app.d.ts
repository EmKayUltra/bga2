// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: { id: string; email: string; name: string; username: string };
			session?: { id: string; userId: string; expiresAt: Date };
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

// Virtual module provided by the gameWatcherPlugin in vite.config.ts
// Dynamically enumerates libs/games/*/ directories containing game.json
declare module 'virtual:game-list' {
	const gameList: string[];
	export default gameList;
}
