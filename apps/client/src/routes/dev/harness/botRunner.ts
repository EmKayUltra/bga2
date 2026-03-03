/**
 * Random Bot Validator — plays random valid moves to catch crashes,
 * infinite loops, and deadlock states in generated game packages.
 *
 * Runs automatically on game load/reload in the test harness.
 */

interface ValidationResult {
  success: boolean;
  moveCount: number;
  reason: 'game-ended-normally' | 'deadlock-no-valid-moves' | 'max-moves-reached' | 'error';
  error?: string;
  duration: number; // milliseconds
}

/**
 * Runs a bot that plays random valid moves against the server.
 * Returns a ValidationResult indicating whether the game ran without issues.
 */
export async function runBotValidation(
  sessionId: string,
  maxMoves: number = 200,
  apiBase: string
): Promise<ValidationResult> {
  const start = Date.now();
  let moveCount = 0;

  try {
    while (moveCount < maxMoves) {
      // Fetch current game state
      const stateRes = await fetch(`${apiBase}/games/${sessionId}`);
      if (!stateRes.ok) {
        return { success: false, moveCount, reason: 'error', error: `GET /games failed: ${stateRes.status}`, duration: Date.now() - start };
      }
      const { state: stateJson, validMoves } = await stateRes.json();
      const state = typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson;

      // Check if game finished
      if (state.finished) {
        return { success: true, moveCount, reason: 'game-ended-normally', duration: Date.now() - start };
      }

      // Check for deadlock
      if (!validMoves || validMoves.length === 0) {
        return { success: false, moveCount, reason: 'deadlock-no-valid-moves', duration: Date.now() - start };
      }

      // Pick a random valid move
      const move = validMoves[Math.floor(Math.random() * validMoves.length)];

      // Submit the move
      const moveRes = await fetch(`${apiBase}/games/${sessionId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: state.players[state.currentPlayerIndex].id,
          action: move.action,
          source: move.source,
          target: move.target,
          pieceId: move.pieceId,
          data: move.data || {}
        })
      });

      if (!moveRes.ok) {
        const errBody = await moveRes.text();
        return { success: false, moveCount, reason: 'error', error: `POST /move failed: ${moveRes.status} — ${errBody}`, duration: Date.now() - start };
      }

      moveCount++;
    }

    return { success: true, moveCount, reason: 'max-moves-reached', duration: Date.now() - start };
  } catch (err) {
    return { success: false, moveCount, reason: 'error', error: String(err), duration: Date.now() - start };
  }
}
