/**
 * gameApi — client-side API calls to the C# game server.
 *
 * The server runs at localhost:8080 in development.
 * All moves are validated server-side; the client never computes legal moves.
 *
 * Endpoints:
 *   POST /games              — create a new game session
 *   GET  /games/:id/state    — get current game state + validMoves for highlighting
 *   POST /games/:id/move     — submit a player move for validation and execution
 */

import type { Move, ValidMove, MoveResult, GameState } from '@bga2/shared-types';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8080';

// ─── localStorage schema ──────────────────────────────────────────────────────

export interface RecentGame {
  sessionId: string;
  createdAt: string;  // ISO date
  gameId: string;
  playerNames: string[];
}

const RECENT_GAMES_KEY = 'bga2-recent-games';

export function saveRecentGame(game: RecentGame): void {
  let games: RecentGame[] = [];
  try {
    const raw = localStorage.getItem(RECENT_GAMES_KEY);
    if (raw) games = JSON.parse(raw) as RecentGame[];
  } catch {
    // corrupt storage — start fresh
  }
  // Prepend new game, limit to 20 entries
  games = [game, ...games.filter(g => g.sessionId !== game.sessionId)].slice(0, 20);
  localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(games));
}

export function loadRecentGames(): RecentGame[] {
  try {
    const raw = localStorage.getItem(RECENT_GAMES_KEY);
    if (raw) return JSON.parse(raw) as RecentGame[];
  } catch {
    // corrupt storage
  }
  return [];
}

export function removeRecentGame(sessionId: string): void {
  const games = loadRecentGames().filter(g => g.sessionId !== sessionId);
  localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(games));
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface CreateGameResponse {
  sessionId: string;
  gameId: string;
  version: number;
}

export interface GameStateResponse {
  state: GameState;
  validMoves: ValidMove[];
}

export interface MoveResponse {
  valid: boolean;
  newState?: GameState;
  validMoves?: ValidMove[];
  errors?: string[];
}

// ─── Error helpers ────────────────────────────────────────────────────────────

/**
 * Parse an error response body into a MoveResult-shaped error.
 * 4xx responses are parsed for server-provided error messages.
 */
async function parseErrorResponse(res: Response): Promise<MoveResponse> {
  try {
    const body = await res.json();
    return {
      valid: false,
      errors: body.errors ?? body.message ? [body.message] : [`HTTP ${res.status}: ${res.statusText}`],
    };
  } catch {
    return {
      valid: false,
      errors: [`HTTP ${res.status}: ${res.statusText}`],
    };
  }
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Create a new game session on the server.
 *
 * @param gameId - The game definition ID (e.g. 'azul')
 * @param playerNames - Array of 2-4 player names
 * @returns The new session ID, gameId, and version
 */
export async function createGame(gameId: string, playerNames: string[]): Promise<CreateGameResponse> {
  const res = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, playerNames }),
  });

  if (!res.ok) {
    const err = await parseErrorResponse(res);
    throw new Error(err.errors?.join(', ') ?? 'Failed to create game');
  }

  return res.json() as Promise<CreateGameResponse>;
}

/**
 * Fetch the current game state and valid moves for the current player.
 *
 * @param sessionId - The game session ID
 * @returns Current GameState and valid moves for client-side highlighting
 */
export async function getGameState(sessionId: string): Promise<GameStateResponse> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(sessionId)}/state`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to get game state: HTTP ${res.status}`);
  }

  return res.json() as Promise<GameStateResponse>;
}

/**
 * Submit a player move to the server for validation and execution.
 *
 * Returns a MoveResult. If the move is valid, the result contains the updated
 * game state and the next set of valid moves. If invalid, it contains errors.
 *
 * @param sessionId - The game session ID
 * @param move - The move to submit
 */
export async function submitMove(sessionId: string, move: Move): Promise<MoveResult> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE}/games/${encodeURIComponent(sessionId)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(move),
    });
  } catch (err) {
    // Network error (server unreachable, CORS failure, etc.)
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : 'Network error'],
    };
  }

  if (!res.ok) {
    return parseErrorResponse(res);
  }

  return res.json() as Promise<MoveResult>;
}
