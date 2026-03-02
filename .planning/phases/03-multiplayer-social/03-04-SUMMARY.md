---
phase: 03-multiplayer-social
plan: "04"
subsystem: realtime-multiplayer
tags: [appsync, websocket, idempotency, real-time, optimistic-locking]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [real-time-game-sync, idempotent-moves, 409-conflict-handling]
  affects: [game-page, game-service, scene-manager]
tech_stack:
  added:
    - aws-amplify (npm): AppSync Events WebSocket subscription on client
  patterns:
    - AppSync Events HTTP pub/sub for real-time state broadcast
    - Client-generated UUID (crypto.randomUUID) for idempotent move deduplication
    - Version-gated AppSync event application (stale events silently ignored)
    - Graceful degradation when AppSync unconfigured (REST polling fallback)
key_files:
  created:
    - apps/server/Services/AppSyncPublisher.cs
    - apps/client/src/lib/appsync.ts
  modified:
    - apps/server/Services/GameService.cs
    - apps/server/Models/GameModels.cs
    - apps/server/Data/GameSession.cs
    - apps/server/Data/GameDbContext.cs
    - apps/server/Endpoints/GameEndpoints.cs
    - apps/server/Program.cs
    - apps/infra/docker-compose.yml
    - apps/client/src/lib/api/gameApi.ts
    - apps/client/src/lib/engine/SceneManager.ts
    - apps/client/src/routes/game/[id]/+page.svelte
    - libs/shared-types/src/moves.ts
decisions:
  - "AppSync publish is best-effort: errors are caught and logged, REST response already confirmed move success"
  - "PlayedMoveIds stored as JSONB array in GameSession, trimmed to 100 entries to prevent unbounded growth"
  - "409 Conflict returned for DbUpdateConcurrencyException (vs 400 BadRequest) to distinguish race conditions"
  - "Client guards handleSourceClick/handleDestinationClick via isLocalPlayerTurn() — enforces turn discipline without server round-trip"
  - "applyRemoteState uses version comparison to ignore stale AppSync events (out-of-order WebSocket delivery)"
  - "localPlayerIndex = null means hot-seat mode (all players local) — no move guards applied"
  - "aws-amplify installed in client container for AppSync Events WebSocket support"
  - "MoveResult extended with conflict? and version? in shared-types to carry idempotency metadata to callers"
metrics:
  duration: "7 minutes"
  completed: "2026-03-02"
  tasks_completed: 2
  files_modified: 12
---

# Phase 3 Plan 04: Real-Time Multiplayer via AppSync Events Summary

**One-liner:** AppSync Events WebSocket pub/sub for real-time game sync with idempotent moves (client UUID), 409 conflict handling, reconnection flow, and move control guards for non-current players.

## What Was Built

### Task 1: AppSync Events Publisher (C#) + Idempotent Move Protocol

**AppSyncPublisher.cs** — new service that publishes game state to AppSync Events after every successful move:
- POST to `{AppSync:HttpEndpoint}/event` with `channel=/game/{sessionId}/state`
- Requires `AppSync:HttpEndpoint` and `AppSync:ApiKey` configuration
- Gracefully degrades: if not configured, logs at Debug level and returns (no error)
- Errors during publish are caught and logged — never propagate to the REST response

**Idempotent move deduplication** in GameService:
- `MoveRequest.MoveId` (nullable string) carries client-generated UUID
- `GameSession.PlayedMoveIds` (JSONB array) stores processed move IDs
- On duplicate MoveId: return current state as successful no-op
- After successful save: append MoveId to PlayedMoveIds, trim to last 100

**409 Conflict for concurrent moves** in GameEndpoints:
- `DbUpdateConcurrencyException` → `MoveResult.IsConcurrencyConflict = true`
- Endpoint returns `Results.Conflict(response)` instead of `Results.BadRequest(response)`
- Client can distinguish "invalid move" (400) from "race condition" (409)

**Version in MoveResponse** — included for client state tracking and AppSync event ordering.

### Task 2: Client AppSync Subscription + Reconnection + Multiplayer Game Page

**appsync.ts** — Amplify Events helpers (browser-only, SSR-safe):
- `configureAppSync()` — idempotent; reads `VITE_APPSYNC_HTTP_ENDPOINT` + `VITE_APPSYNC_API_KEY`
- `subscribeToGame(sessionId, onStateUpdate)` — returns cleanup fn or null (no config)
- Event payload parsed from `data.event` (string or object)

**gameApi.ts updates:**
- `submitMove` generates `crypto.randomUUID()` as `moveId` — appended to body
- Auth header via `getApiToken()` (30s cache, same pattern as lobbyApi.ts)
- 409 response: returns `{ valid: false, conflict: true, errors: [...] }`
- `MoveResponse` interface includes `conflict?` and `version?`

**SceneManager.ts updates:**
- `ConnectionState` type: `'connected' | 'reconnecting' | 'disconnected'`
- `localPlayerIndex` — null for hot-seat, set to player index for multiplayer
- `version` — tracks server state version for AppSync event ordering
- `applyRemoteState(stateJson, version)` — version-gated; ignores stale events; re-renders scene
- `handleAppSyncError(resubscribeFn)` — reconnection flow: re-fetch state → re-subscribe → enable controls
- `isLocalPlayerTurn()` — returns false when reconnecting or not the local player's turn
- `handleSourceClick` / `handleDestinationClick` — guarded by `isLocalPlayerTurn()`
- 409 in `submitPlayerMove` → `refreshValidMoves()` (re-fetch state, no animation)

**+page.svelte updates:**
- `configureAppSync()` + `subscribeToGame()` called on mount (browser guard via `$app/environment`)
- Subscription cleanup in `onDestroy` via `sceneManager.setAppSyncUnsubscribe()`
- `onConnectionStateChange` callback wired to update `connectionState` reactive var
- Connection banners: yellow "Reconnecting..." + red "Connection lost" with Refresh button
- Turn display: "Your Turn" (local player) vs "Waiting for {name}" (opponent's turn)
- `turnStatus()` derived function — hot-seat shows "{player}'s Turn", multiplayer shows status

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added getApiToken() + authHeaders() to gameApi.ts**
- **Found during:** Task 2 implementation
- **Issue:** submitMove had no auth header — move endpoint requires Bearer JWT. The plan mentioned adding getApiToken() but the existing submitMove had no auth at all.
- **Fix:** Added TokenCache, getApiToken() (30s cache, reads /api/auth/token), and authHeaders() directly in gameApi.ts — mirrors lobbyApi.ts pattern.
- **Files modified:** apps/client/src/lib/api/gameApi.ts

**2. [Rule 2 - Missing type] Extended MoveResult in shared-types with conflict? and version?**
- **Found during:** Task 2 — TypeScript error when returning `{ conflict: true }` from submitMove
- **Issue:** `MoveResult` in shared-types had no `conflict` or `version` fields, causing TS2353 error
- **Fix:** Added `conflict?: boolean` and `version?: number` to `MoveResult` interface in libs/shared-types/src/moves.ts
- **Files modified:** libs/shared-types/src/moves.ts

**3. [Rule 1 - Bug] Used import.meta.env for API_BASE in gameApi.ts**
- **Found during:** Task 2
- **Issue:** gameApi.ts hardcoded `API_BASE = 'http://localhost:8080'` instead of reading from VITE_API_URL like lobbyApi.ts
- **Fix:** Changed to `import.meta.env.VITE_API_URL || 'http://localhost:8080'`
- **Files modified:** apps/client/src/lib/api/gameApi.ts

## Self-Check: PASSED

- apps/server/Services/AppSyncPublisher.cs — FOUND
- apps/client/src/lib/appsync.ts — FOUND
- .planning/phases/03-multiplayer-social/03-04-SUMMARY.md — FOUND
- d44a00f (Task 1 commit) — FOUND
- 54a84f7 (Task 2 commit) — FOUND
