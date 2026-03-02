/**
 * lobbyApi — client-side API calls for the lobby/table system.
 *
 * Endpoints (via the C# server at localhost:8080):
 *   GET  /tables              — list public Waiting tables (no auth)
 *   GET  /tables/:id          — get table details (no auth)
 *   POST /tables              — create a table (auth)
 *   POST /tables/:id/join     — join a table (auth)
 *   POST /tables/:id/leave    — leave a table (auth)
 *   POST /tables/:id/start    — start the game (auth, host only)
 *   POST /tables/quick-play   — auto-join or create (auth)
 *
 * Auth: Better Auth JWT token fetched from /api/auth/token and cached for 30s.
 */

import { browser } from '$app/environment';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = browser
  ? (import.meta.env.VITE_API_URL || 'http://localhost:8080')
  : (import.meta.env.API_SERVER_URL || 'http://server:8080');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTableRequest {
  gameId: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  password?: string;
  isAsync?: boolean;        // NEW: async game mode
  timerMode?: string;       // NEW: "fast" | "normal" | "slow" | "unlimited"
  skipThreshold?: number;   // NEW: 0 = disable auto-forfeit, default 3
}

export interface TableListItem {
  id: string;
  gameId: string;
  displayName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: string;
  isAsync: boolean;         // NEW: whether this is an async game
  timerMode?: string;       // NEW: "fast" | "normal" | "slow" | "unlimited" | undefined
}

export interface TablePlayerInfo {
  userId: string;
  displayName: string;
  seatIndex: number;
  isReady: boolean;
}

export type TableStatus = 'Waiting' | 'Playing' | 'Finished';

export interface TableDetail {
  id: string;
  gameId: string;
  displayName: string;
  isPrivate: boolean;
  status: TableStatus;
  sessionId: string | null;
  minPlayers: number;
  maxPlayers: number;
  hostUserId: string;
  players: TablePlayerInfo[];
}

export interface JoinResult {
  success: boolean;
  error?: string;
}

export interface StartGameResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface QuickPlayResult {
  joined: boolean;
  created: boolean;
  tableId: string;
}

export interface MyGameItem {
  tableId: string;
  sessionId: string;
  displayName: string;
  timerMode: string;
  turnDeadline: string | null;
  isPaused: boolean;
  opponents: string[];
  isMyTurn: boolean;
}

export interface TableAsyncMeta {
  tableId: string;
  isAsync: boolean;
  timerMode: string | null;
  turnDeadline: string | null;
  isPaused: boolean;
  pauseRequestedByUserId: string | null;
  pauseRequestedByName: string | null;
}

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

/**
 * Fetch a JWT from Better Auth's /api/auth/token endpoint.
 * Caches for 30 seconds to avoid hammering the endpoint during polling.
 */
async function getApiToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  try {
    const res = await fetch('/api/auth/token', {
      method: 'GET',
      credentials: 'include', // send session cookie
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

/**
 * Build Authorization header for authenticated requests.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getApiToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * List all public Waiting tables. No auth required.
 */
export async function listTables(): Promise<TableListItem[]> {
  const res = await fetch(`${API_BASE}/tables`);
  if (!res.ok) throw new Error(`Failed to list tables: HTTP ${res.status}`);
  return res.json() as Promise<TableListItem[]>;
}

/**
 * Get full table details (players, status, sessionId). No auth required.
 */
export async function getTable(id: string): Promise<TableDetail> {
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to get table: HTTP ${res.status}`);
  return res.json() as Promise<TableDetail>;
}

/**
 * Create a new lobby table. Returns the new table ID.
 */
export async function createTable(req: CreateTableRequest): Promise<{ id: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Failed to create table: HTTP ${res.status}`);
  }
  return res.json() as Promise<{ id: string }>;
}

/**
 * Join a table. Pass password for private tables.
 */
export async function joinTable(id: string, password?: string): Promise<JoinResult> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(id)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ password: password ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    return { success: false, error: err.error ?? `HTTP ${res.status}` };
  }
  return res.json() as Promise<JoinResult>;
}

/**
 * Leave a table.
 */
export async function leaveTable(id: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API_BASE}/tables/${encodeURIComponent(id)}/leave`, {
    method: 'POST',
    headers,
  });
}

/**
 * Start the game (host only). Returns the sessionId for redirect.
 */
export async function startGame(id: string): Promise<{ sessionId: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(id)}/start`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Failed to start game: HTTP ${res.status}`);
  }
  const data = await res.json() as StartGameResult;
  if (!data.sessionId) throw new Error('Server did not return a session ID');
  return { sessionId: data.sessionId };
}

/**
 * Quick Play: auto-join an open table or create a new one for the given gameId.
 */
export async function quickPlay(gameId: string): Promise<QuickPlayResult> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/quick-play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ gameId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Quick Play failed: HTTP ${res.status}`);
  }
  return res.json() as Promise<QuickPlayResult>;
}

/**
 * Get active async games for the authenticated user.
 */
export async function getMyGames(): Promise<MyGameItem[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/my-games`, { headers });
  if (!res.ok) throw new Error(`Failed to get my games: HTTP ${res.status}`);
  return res.json() as Promise<MyGameItem[]>;
}

/**
 * Get async table metadata by session ID (for game page timer display).
 */
export async function getTableBySession(sessionId: string): Promise<TableAsyncMeta | null> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/by-session/${encodeURIComponent(sessionId)}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get table meta: HTTP ${res.status}`);
  return res.json() as Promise<TableAsyncMeta>;
}

/**
 * Request a pause in an async game.
 */
export async function requestPause(tableId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(tableId)}/pause-request`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Pause request failed: HTTP ${res.status}`);
  }
}

/**
 * Accept a pause request in an async game.
 */
export async function acceptPause(tableId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(tableId)}/pause-accept`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Pause accept failed: HTTP ${res.status}`);
  }
}

/**
 * Decline a pause request in an async game.
 */
export async function declinePause(tableId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(tableId)}/pause-decline`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Pause decline failed: HTTP ${res.status}`);
  }
}

/**
 * Resume a paused async game.
 */
export async function resumeGame(tableId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(tableId)}/resume`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Resume failed: HTTP ${res.status}`);
  }
}
