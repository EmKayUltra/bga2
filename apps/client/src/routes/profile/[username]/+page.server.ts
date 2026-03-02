import type { PageServerLoad } from './$types';

/**
 * Profile page server load: extract username from route params.
 * Actual data fetching happens client-side via socialApi to avoid
 * server-side fetch complications with the C# API Docker service.
 */
export const load: PageServerLoad = async ({ params }) => {
  return {
    username: params.username,
  };
};
