/**
 * Game page load function.
 *
 * SSR is disabled because PixiJS requires browser globals (WebGL, canvas, RAF).
 * The game page is client-only — SvelteKit will render a minimal shell on the
 * server and hydrate on the client.
 *
 * Research note: Without `export const ssr = false`, SvelteKit will try to
 * import PixiJS during server rendering, which crashes on `self is not defined`
 * even with the @mszu/pixi-ssr-shim. The dynamic import inside onMount is the
 * second line of defense; ssr=false is the primary guard.
 */

import type { PageLoad } from './$types.js';

/** Disable server-side rendering for the game route. */
export const ssr = false;

/** Extract the game session ID from URL params. */
export const load: PageLoad = ({ params }) => {
  return {
    id: params.id,
  };
};
