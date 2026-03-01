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
  console.log(`[gameApi] POST /games → {gameId:'${gameId}', players:${playerNames.length}}`);
  const res = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, playerNames }),
  });

  if (!res.ok) {
    const err = await parseErrorResponse(res);
    console.log(`[gameApi] POST /games ← error: ${err.errors?.join(', ')}`);
    throw new Error(err.errors?.join(', ') ?? 'Failed to create game');
  }

  const data = await res.json() as CreateGameResponse;
  console.log(`[gameApi] POST /games ← sessionId:${data.sessionId}`);
  return data;
}

/**
 * Fetch the current game state and valid moves for the current player.
 *
 * @param sessionId - The game session ID
 * @returns Current GameState and valid moves for client-side highlighting
 */
export async function getGameState(sessionId: string): Promise<GameStateResponse> {
  console.log(`[gameApi] GET /games/${sessionId}/state`);
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(sessionId)}/state`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    console.log(`[gameApi] GET /games/${sessionId}/state ← error: HTTP ${res.status}`);
    throw new Error(`Failed to get game state: HTTP ${res.status}`);
  }

  const raw = await res.json();
  const result = {
    state: typeof raw.state === 'string' ? JSON.parse(raw.state) : raw.state,
    validMoves: raw.validMoves ?? [],
  };
  console.log(`[gameApi] GET /games/${sessionId}/state ← validMoves:${result.validMoves.length}, player:${result.state.currentPlayerIndex}, phase:${result.state.phase}`);
  return result;
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
  console.log(`[gameApi] POST /move → {action:'${move.action}', source:'${move.source}', target:'${move.target}', pieceId:'${move.pieceId}'}`);
  let res: Response;

  try {
    res = await fetch(`${API_BASE}/games/${encodeURIComponent(sessionId)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(move),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Network error';
    console.log(`[gameApi] POST /move ← network error: ${errMsg}`);
    return {
      valid: false,
      errors: [errMsg],
    };
  }

  if (!res.ok) {
    const result = await parseErrorResponse(res);
    console.log(`[gameApi] POST /move ← error: ${result.errors?.join(', ')}`);
    return result;
  }

  // Server sends { valid, state (string), validMoves, errors }
  // Client MoveResult expects { valid, newState (object), validMoves, errors }
  const raw = await res.json();
  const result = {
    valid: raw.valid,
    newState: raw.state ? (typeof raw.state === 'string' ? JSON.parse(raw.state) : raw.state) : undefined,
    validMoves: raw.validMoves ?? undefined,
    errors: raw.errors ?? undefined,
  };
  console.log(`[gameApi] POST /move ← valid:${result.valid}, nextMoves:${result.validMoves?.length ?? 0}${result.errors ? ', errors:' + result.errors.join(', ') : ''}`);
  return result;
}
