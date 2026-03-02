/**
 * socialApi — client-side API calls for the social/profile system.
 *
 * Endpoints (via the C# server at localhost:8080):
 *   GET  /social/avatars                  — list preset avatar IDs (public)
 *   GET  /social/profile/{username}       — get a user profile (public)
 *   GET  /social/profile/{username}/history — match history (public if profile is public)
 *   PUT  /social/profile                  — update own avatar + privacy (auth)
 *   PUT  /social/profile/username         — change own username (auth, 30-day cooldown)
 *
 * Auth: Better Auth JWT token fetched from /api/auth/token and cached for 30s.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileResponse {
  username: string;
  displayName: string;
  avatar: string;
  memberSince: string; // ISO date string
  gamesPlayed: number;
  winRate: number;     // percentage 0-100
  isPublic: boolean;
}

export interface MatchHistoryItem {
  gameId: string;
  won: boolean;
  score: number;
  rank: number;
  opponents: string[];
  completedAt: string; // ISO date string
  playerCount: number;
}

export interface UpdateProfileData {
  avatar?: string;
  isPublic?: boolean;
}

export interface UsernameChangeResult {
  success: boolean;
  error?: string;
  retryAfterDays?: number;
}

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number;
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

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Get the list of preset avatar identifiers from the server.
 */
export async function getAvatars(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/social/avatars`);
  if (!res.ok) throw new Error(`Failed to get avatars: HTTP ${res.status}`);
  return res.json() as Promise<string[]>;
}

/**
 * Get a user's public profile by username.
 * Returns null if user not found (404).
 */
export async function getProfile(username: string): Promise<ProfileResponse | null> {
  const res = await fetch(`${API_BASE}/social/profile/${encodeURIComponent(username)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get profile: HTTP ${res.status}`);
  return res.json() as Promise<ProfileResponse>;
}

/**
 * Get match history for a user (by username).
 * Returns empty array on 403 (private profile).
 * @param page 1-based page number (default 1)
 */
export async function getMatchHistory(
  username: string,
  page = 1
): Promise<MatchHistoryItem[]> {
  const url = `${API_BASE}/social/profile/${encodeURIComponent(username)}/history?page=${page}`;
  const res = await fetch(url);
  if (res.status === 403 || res.status === 404) return [];
  if (!res.ok) throw new Error(`Failed to get match history: HTTP ${res.status}`);
  return res.json() as Promise<MatchHistoryItem[]>;
}

/**
 * Update the current user's profile (avatar, privacy). Requires auth.
 */
export async function updateProfile(data: UpdateProfileData): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/social/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Failed to update profile: HTTP ${res.status}`);
  }
}

/**
 * Change the current user's username. Requires auth.
 * Returns success/error/cooldown info.
 */
export async function updateUsername(username: string): Promise<UsernameChangeResult> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/social/profile/username`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username }),
  });

  // Parse response regardless of status code (success/conflict/cooldown)
  try {
    const data = await res.json() as UsernameChangeResult;
    return data;
  } catch {
    return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
  }
}

/**
 * Format a relative time string for match history dates.
 * Examples: "just now", "2h ago", "Mar 1", "Feb 14"
 */
export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // Older than 7 days: show "Mar 1" or "Feb 14"
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
