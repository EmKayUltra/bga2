---
phase: quick-1
plan: 01
subsystem: developer-tools
tags: [dev-tools, server-endpoints, svelte-component, game-state]
dependency_graph:
  requires: []
  provides: [dev-menu, dev-endpoints]
  affects: [game-page, game-api]
tech_stack:
  added: []
  patterns: [minimal-api-extension-method, svelte5-runes, json-node-mutation]
key_files:
  created:
    - apps/server/Endpoints/DevEndpoints.cs
    - apps/client/src/lib/components/DevMenu.svelte
  modified:
    - apps/server/Services/GameService.cs
    - apps/server/Program.cs
    - apps/client/src/lib/api/gameApi.ts
    - apps/client/src/routes/game/[id]/+page.svelte
decisions:
  - DevEndpoints uses JsonNode.Parse for state mutation (avoids full deserialization into typed model)
  - ExtractPlayerAndRound changed from internal to public static for DevEndpoints reuse
  - Svelte placeholder with curly braces uses HTML entities to avoid Svelte template parser confusion
metrics:
  duration: 4 min
  completed: "2026-03-01"
  tasks_completed: 2
  files_created: 2
  files_modified: 4
---

# Quick Task 1: Developer Menu for Real-Time Game State Summary

**One-liner:** Backtick-toggled dev panel with round-end/game-end triggers and JSON state overrides via three new /dev/{id} server endpoints.

## What Was Built

### Server (Task 1)

Created `apps/server/Endpoints/DevEndpoints.cs` with three minimal API endpoints registered at `/dev`:

- **POST /dev/{sessionId}/trigger-round-end** — loads hooks via HookExecutor, runs `OnRoundEnd`, saves updated state, returns `GameStateResponse`
- **POST /dev/{sessionId}/trigger-game-end** — mutates `finished=true` and `winnerId` (player with highest score) via `JsonNode`, saves, returns `GameStateResponse`
- **POST /dev/{sessionId}/set-state** — shallow-merges a `JsonDocument` body onto the state root via `JsonNode`, saves, returns `GameStateResponse`

Added to `GameService`:
- `LoadSession(Guid sessionId)` — thin wrapper over `_db.GameSessions.FindAsync`
- `SaveSession(GameSession session)` — increments version, sets UpdatedAt, saves
- `ExtractPlayerAndRound` changed from `internal` to `public` so DevEndpoints can call it

Registered `app.MapDevEndpoints()` in `Program.cs` after `app.MapGameEndpoints()`.

### Client (Task 2)

Added three new async functions to `gameApi.ts`:
- `devTriggerRoundEnd(sessionId)` → POST /dev/{id}/trigger-round-end
- `devTriggerGameEnd(sessionId)` → POST /dev/{id}/trigger-game-end
- `devSetState(sessionId, overrides)` → POST /dev/{id}/set-state

Created `apps/client/src/lib/components/DevMenu.svelte` (Svelte 5 runes):
- Fixed bottom-right panel (320px wide, `rgba(15, 23, 42, 0.95)`, z-index 500)
- Backtick key toggles visibility (ignores keydown when focus is in input/textarea)
- State summary: round, phase, current player index / count, finished status
- "Trigger Round End" button — calls `devTriggerRoundEnd`, invokes `onStateUpdated` callback
- "Trigger Game End" button — calls `devTriggerGameEnd`, invokes `onStateUpdated` callback
- Set State textarea + Apply button — JSON parse validation, calls `devSetState`
- Busy/disabled state during API calls, error display on failure

Wired into `apps/client/src/routes/game/[id]/+page.svelte`:
- Import `DevMenu` and `GameStateResponse` type
- `handleDevStateUpdate(response)` — pushes fresh state into SceneManager, triggers reactive update, re-renders scene, sets `finishedGameState` if finished
- `<DevMenu>` component rendered at bottom of template (above score overlay)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created:
- apps/server/Endpoints/DevEndpoints.cs — EXISTS
- apps/client/src/lib/components/DevMenu.svelte — EXISTS

Commits:
- 5a3012f — feat(quick-1): add server dev endpoints for game state manipulation
- 1edfaa8 — feat(quick-1): add DevMenu component and wire into game page

Server build: 0 errors, 0 warnings.
Client check: 19 errors all pre-existing (svelte-check $lib alias resolution failure in Docker — same environment issue present in Phase 2 deliverables, non-blocking).

## Self-Check: PASSED
