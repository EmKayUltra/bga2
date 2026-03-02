import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

const API_BASE = process.env.API_URL || 'http://server:8080';

interface InviteValidationResponse {
  valid: boolean;
  tableId?: string;
  error?: string;
}

/**
 * Server-side load for the invite link page.
 *
 * Validates the token by calling GET /invites/{token}/validate on the C# server.
 * - Valid + authenticated → redirect to /table/{tableId}
 * - Valid + not authenticated → redirect to /auth/register?next=/invite/{token}
 * - Invalid/expired → return error data for the page to render
 */
export const load: PageServerLoad = async ({ params, locals }) => {
  const { token } = params;

  // Call the C# server to validate the token (server-to-server, no auth needed)
  let validation: InviteValidationResponse;
  try {
    const res = await fetch(
      `${API_BASE}/invites/${encodeURIComponent(token)}/validate`
    );
    if (!res.ok) {
      return { valid: false, error: 'Unable to validate invite link' };
    }
    validation = await res.json() as InviteValidationResponse;
  } catch {
    return { valid: false, error: 'Unable to reach server to validate invite' };
  }

  if (!validation.valid || !validation.tableId) {
    return { valid: false, error: validation.error ?? 'Invalid or expired invite link' };
  }

  const tableId = validation.tableId;

  // Check if the user is authenticated via SvelteKit locals (set by hooks.server.ts)
  if (locals.user) {
    // Authenticated → redirect to the waiting room
    redirect(307, `/table/${tableId}`);
  } else {
    // Not authenticated → redirect to register with next= param
    redirect(307, `/auth/register?next=/invite/${encodeURIComponent(token)}`);
  }
};
