// Virtual module type declarations for Vite plugins
// See vite.config.ts for implementation

declare module 'virtual:game-list' {
	const gameList: string[];
	export default gameList;
}
