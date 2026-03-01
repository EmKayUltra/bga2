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

// ─── Response types ───────────────────────────────────────────────────────────

export interface CreateGameResponse {
  id: string;
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
 * @returns The new session ID
 */
export async function createGame(gameId: string): Promise<CreateGameResponse> {
  const res = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId }),
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
