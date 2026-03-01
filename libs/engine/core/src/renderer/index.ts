/**
 * Renderer implementations for @bga2/engine-core.
 *
 * PixiAdapter — PixiJS v8 WebGL renderer (browser only, use with dynamic import in SvelteKit)
 * StubRenderer — no-op test renderer (safe in Node.js / headless environments)
 */

export { PixiAdapter } from './PixiAdapter.js';
export { StubRenderer } from './StubRenderer.js';
