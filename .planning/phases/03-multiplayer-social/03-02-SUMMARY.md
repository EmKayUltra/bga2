---
phase: 03-multiplayer-social
plan: "02"
subsystem: lobby
tags: [csharp, svelte5, svelte, efcore, postgresql, jwt, lobby, multiplayer]

# Dependency graph
requires:
  - phase: 03-multiplayer-social
    plan: "01"
    provides: GameTable + TablePlayer EF Core entities, JWT Bearer middleware, Better Auth JWT token endpoint

provides:
  - LobbyService: CreateTable, ListTables, GetTable, JoinTable, LeaveTable, StartGame, QuickPlay business logic
  - LobbyEndpoints: /tables REST API (GET/POST + join/leave/start/quick-play)
  - lobbyApi.ts: typed TypeScript client with JWT auth token caching
  - /lobby page: public table list with 5s polling + create table dialog + Quick Play
  - /table/[id] waiting room: player list + 3s polling + host start button + auto-redirect

affects:
  - 03-04-realtime (can subscribe to table state changes for real-time updates)
  - 03-05-friends (can show friend invites to private tables)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - LobbyService depends on GameService.CreateGame to create a game session when host starts
    - SHA-256 hash for table passwords (not BCrypt — table entry guard, not user credential)
    - JWT cached in lobbyApi.ts for 30s to avoid hammering /api/auth/token during polling
    - setInterval polling (5s lobby, 3s waiting room) with onDestroy clearInterval for cleanup
    - Auto-redirect in waiting room when table status transitions to Playing

key-files:
  created:
    - apps/server/Services/LobbyService.cs
    - apps/server/Endpoints/LobbyEndpoints.cs
    - apps/client/src/lib/api/lobbyApi.ts
    - apps/client/src/routes/lobby/+page.svelte
    - apps/client/src/routes/table/[id]/+page.svelte
  modified:
    - apps/server/Program.cs (registered LobbyService + mapped lobby endpoints)
    - apps/client/src/routes/+page.svelte (added Lobby CTA for logged-in users, auth CTA for guests)

key-decisions:
  - "SHA-256 password hashing for private tables (not BCrypt) — table passwords are low-stakes join guards, not user credentials"
  - "JWT token cached 30s in lobbyApi.ts — avoids per-fetch /api/auth/token round trips during 3-5s polling intervals"
  - "QuickPlay uses linear scan of available tables — acceptable for Phase 3 scale, can add index optimization later"
  - "Waiting room polls every 3s (vs 5s for lobby list) — faster feedback when waiting for host to start"

patterns-established:
  - "Lobby service always returns LobbyService types; endpoint handlers are thin — no business logic in LobbyEndpoints.cs"
  - "Public table listing excludes private tables — private tables are join-by-link/invite only, never appear in browse list"
  - "Host transfer on leave: if host leaves and players remain, first remaining player (lowest seatIndex) becomes host"
  - "idempotent JoinTable: if user is already in table, returns success without error (safe for retries)"

requirements-completed: [MULT-03, SOCL-05]

# Metrics
duration: 10min
completed: 2026-03-02
---

# Phase 3 Plan 02: Lobby System Summary

**Table-based matchmaking with REST API (create/join/leave/start/Quick Play), 5s-polling lobby page, 3s-polling waiting room, and game-start redirect flow using existing GameService**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-02T01:35:05Z
- **Completed:** 2026-03-02T01:44:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Complete lobby REST API in C# with 7 endpoints covering the full table lifecycle (create, list, get, join, leave, start, Quick Play)
- LobbyService integrates with GameService.CreateGame — starting a table creates a real game session and records SessionId on the table
- SvelteKit lobby page at /lobby with 5-second polling, create-table dialog (public/private/password), and Quick Play button
- Waiting room at /table/[id] with 3-second polling, player list with host badge, auto-redirect when game starts
- Landing page updated with Lobby CTA for authenticated users and auth CTA for guests

## Task Commits

Each task was committed atomically:

1. **Task 1: C# lobby service and endpoints** - `3d0d51b` (feat)
2. **Task 2: Lobby page, waiting room, and landing page updates** - `56113db` (feat)

## Files Created/Modified

- `apps/server/Services/LobbyService.cs` - Lobby business logic (7 methods: CreateTable, ListTables, GetTable, JoinTable, LeaveTable, StartGame, QuickPlay) + request/response records
- `apps/server/Endpoints/LobbyEndpoints.cs` - REST endpoints at /tables MapGroup, auth guards on write operations
- `apps/server/Program.cs` - Added `AddScoped<LobbyService>()` and `MapLobbyEndpoints()` calls
- `apps/client/src/lib/api/lobbyApi.ts` - TypeScript API client with 30s JWT token cache, all 7 lobby functions
- `apps/client/src/routes/lobby/+page.svelte` - Lobby page: polling table list, create dialog, Quick Play, auth guard
- `apps/client/src/routes/table/[id]/+page.svelte` - Waiting room: player list, start button (host-only), auto-redirect, leave button
- `apps/client/src/routes/+page.svelte` - Added Lobby CTA section (conditional on auth state), local game section preserved

## Decisions Made

- **SHA-256 for table passwords:** BCrypt is overkill for table join guards — SHA-256 is fast and adequate for this low-stakes access control. User credentials still use Better Auth's bcrypt.
- **JWT token caching at 30s:** Each poll (every 3-5 seconds) would otherwise hit `/api/auth/token`. Caching avoids 10-20 extra auth requests per minute while keeping the token reasonably fresh.
- **QuickPlay linear scan:** Iterates Waiting tables to find one with open seats. Works fine at Phase 3 scale; add an EF Core query with COUNT join if needed at scale.
- **idempotent join:** If a user is already in a table (e.g. rejoining after a page reload), JoinTable returns success without creating a duplicate TablePlayer. Prevents unique constraint violations on the TableId+UserId index.

## Deviations from Plan

None - plan executed exactly as written. All types, endpoints, service methods, and UI components match the plan specification.

## Issues Encountered

None — C# build passed on first attempt, TypeScript check clean with 0 errors.

## User Setup Required

None - no external service configuration required. The lobby system uses the existing PostgreSQL database and JWT auth stack from Plan 01.

## Next Phase Readiness

- Full table lifecycle working end-to-end: create → join → wait → start → game
- Private tables exclude from public listing — invite/link flow uses /table/{id} directly
- GameTable.SessionId populated when game starts — enables match history recording (Plan 03)
- Lobby works without real-time — polling is functional. Plan 04 (WebSockets) can replace polling with push updates.
- No dependency on Plan 03 (match history) or Plan 05 (friends) — those can land in any order

---
*Phase: 03-multiplayer-social*
*Completed: 2026-03-02*
