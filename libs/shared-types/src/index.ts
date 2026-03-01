// @bga2/shared-types
// Cross-cutting types shared by client, server, engine, and games
// Phase 1 stub — core types defined in subsequent plans

// Player types
export interface Player {
  id: string;
  displayName: string;
}

// Move types
export interface Move {
  type: string;
  playerId: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

// Game configuration
export interface GameConfig {
  gameId: string;
  gameName: string;
  players: Player[];
  settings: Record<string, unknown>;
}

// Game state envelope — game-specific state is in `state`
export interface GameStateEnvelope {
  matchId: string;
  gameId: string;
  version: number;
  turn: number;
  currentPlayerId: string;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// API response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}
