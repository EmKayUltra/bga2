---
status: testing
phase: 02-azul-first-playable
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md
started: 2026-03-01T17:10:00Z
updated: 2026-03-01T17:10:00Z
---

## Current Test

number: 1
name: Landing Page
expected: |
  Navigate to http://localhost:5173/. See a player count dropdown (2-4 players), dynamic name input fields matching the count, and a "Start Game" button.
awaiting: user response

## Tests

### 1. Landing Page
expected: Navigate to http://localhost:5173/. See a player count dropdown (2-4 players), dynamic name input fields matching the count, and a "Start Game" button.
result: [pending]

### 2. Create Game
expected: Select 2 players, enter names, click Start Game. Browser navigates to /game/{sessionId}. Board renders with factories and player boards visible (no loading spinner stuck, no error overlay).
result: [pending]

### 3. Board Layout
expected: Game board shows 5 factories (2-player) with colored tiles (blue, yellow, red, black, teal), a center area, and 2 player boards each with pattern lines (1-5 slots), a 5x5 wall grid, and a floor line.
result: [pending]

### 4. Select Source Tile
expected: Click a colored tile in a factory. The tile(s) of that color glow blue (selection highlight). Valid destination pattern lines and floor line glow green.
result: [pending]

### 5. Submit Move
expected: After selecting a source tile, click a green-highlighted destination (pattern line or floor line). Tiles animate from factory to the destination. Board re-renders with updated state.
result: [pending]

### 6. Turn Change
expected: After a successful move, a turn banner toast appears near the top showing "Player 2's Turn" (or the other player's name). The banner auto-hides after ~2 seconds.
result: [pending]

### 7. Player Info Bar
expected: A bottom bar is visible showing: Round number, current player's name (highlighted), their score, and the count of available moves. Values update after each move.
result: [pending]

### 8. Multiple Moves
expected: Play 3-4 moves alternating between players. Factories empty out as tiles are drafted. Pattern lines fill up. The game progresses without errors or freezing.
result: [pending]

### 9. Game List
expected: Navigate to /games. The recently created game appears in the list with an "In Progress" status badge and a "Continue" link that navigates back to the game.
result: [pending]

### 10. Game Persistence
expected: Refresh the game page (F5 or navigate back to /game/{sessionId}). The board reloads from the server with the current state preserved — tiles in the same positions, correct player's turn.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]
