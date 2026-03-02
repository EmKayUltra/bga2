/**
 * friendApi — client-side API calls for the friends and invite system.
 *
 * Endpoints (via the C# server at localhost:8080):
 *   GET    /friends               — list accepted friends (auth)
 *   GET    /friends/requests      — pending friend requests (auth)
 *   GET    /friends/search?q=...  — search users by username (auth)
 *   POST   /friends/request       — send a friend request (auth)
 *   POST   /friends/block         — block a user (auth)
 *   POST   /friends/{id}/accept   — accept a request (auth)
 *   POST   /friends/{id}/decline  — decline a request (auth)
 *   DELETE /friends/{id}          — remove a friend (auth)
 *   POST   /invites               — create an invite token (auth)
 *   GET    /invites/{token}/validate — validate a token (no auth)
 *
 * Auth: Better Auth JWT token fetched from /api/auth/token and cached for 30s.
 */

import { browser } from '$app/environment';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = browser
  ? (import.meta.env.VITE_API_URL || 'http://localhost:8080')
  : (import.meta.env.API_SERVER_URL || 'http://server:8080');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FriendInfo {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isOnline: boolean;
  friendSince: string; // ISO date string
}

export interface FriendRequest {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  requestedAt: string; // ISO date string
}

export interface PendingRequestsResult {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export interface UserSearchResult {
  userId: string;
  username: string;
  displayName: string;
}

export interface InviteValidation {
  valid: boolean;
  tableId?: string;
  error?: string;
}

// ─── Token cache (shared with other API modules) ──────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

async function getApiToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  try {
    const res = await fetch('/api/auth/token', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    if (!data.token) return null;
    tokenCache = { token: data.token, expiresAt: now + 30_000 };
    return data.token;
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getApiToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ─── Friends API ──────────────────────────────────────────────────────────────

/**
 * Get the current user's accepted friends list with online status.
 */
export async function getFriends(): Promise<FriendInfo[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/friends`, { headers });
  if (!res.ok) throw new Error(`Failed to get friends: HTTP ${res.status}`);
  return res.json() as Promise<FriendInfo[]>;
}

/**
 * Get pending friend requests split into incoming and outgoing.
 */
export async function getPendingRequests(): Promise<PendingRequestsResult> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/friends/requests`, { headers });
  if (!res.ok) throw new Error(`Failed to get friend requests: HTTP ${res.status}`);
  return res.json() as Promise<PendingRequestsResult>;
}

/**
 * Search for users by username prefix. Returns up to 10 results.
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  if (!query || query.length < 2) return [];
  const headers = await authHeaders();
  const res = await fetch(
    `${API_BASE}/friends/search?q=${encodeURIComponent(query)}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
  return res.json() as Promise<UserSearchResult[]>;
}

/**
 * Send a friend request to a user by their username.
 */
export async function sendFriendRequest(
  username: string
): Promise<{ success: boolean; error?: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/friends/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    return { success: false, error: err.error ?? `HTTP ${res.status}` };
  }
  return { success: true };
}

/**
 * Accept a pending friend request by its friendship ID.
 */
export async function acceptRequest(friendshipId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_BASE}/friends/${encodeURIComponent(friendshipId)}/accept`,
    { method: 'POST', headers }
  );
  if (!res.ok) throw new Error(`Failed to accept request: HTTP ${res.status}`);
}

/**
 * Decline a pending friend request by its friendship ID.
 */
export async function declineRequest(friendshipId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_BASE}/friends/${encodeURIComponent(friendshipId)}/decline`,
    { method: 'POST', headers }
  );
  if (!res.ok) throw new Error(`Failed to decline request: HTTP ${res.status}`);
}

/**
 * Remove a friend (or cancel an outgoing request) by friendship ID.
 */
export async function removeFriend(friendshipId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_BASE}/friends/${encodeURIComponent(friendshipId)}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`Failed to remove friend: HTTP ${res.status}`);
}

// ─── Invites API ──────────────────────────────────────────────────────────────

/**
 * Create a signed invite link for a game table.
 * Returns the full invite URL including the token.
 */
export async function createInviteLink(tableId: string): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ tableId }),
  });
  if (!res.ok) throw new Error(`Failed to create invite: HTTP ${res.status}`);
  const data = await res.json() as { token: string };
  // Build the full invite URL using the current origin
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${origin}/invite/${encodeURIComponent(data.token)}`;
}

/**
 * Validate an invite token. Returns { valid, tableId } or { valid: false, error }.
 * No auth required — link recipients may not be logged in yet.
 */
export async function validateInviteToken(token: string): Promise<InviteValidation> {
  const res = await fetch(
    `${API_BASE}/invites/${encodeURIComponent(token)}/validate`
  );
  if (!res.ok) throw new Error(`Failed to validate invite: HTTP ${res.status}`);
  return res.json() as Promise<InviteValidation>;
}
