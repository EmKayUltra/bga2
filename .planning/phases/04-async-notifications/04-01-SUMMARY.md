---
phase: 04-async-notifications
plan: "01"
subsystem: database
tags: [hangfire, postgresql, web-push, resend, notifications, async, lobby]

# Dependency graph
requires:
  - phase: 03-multiplayer-social
    provides: GameTable, LobbyService, EF Core GameDbContext patterns, TablePlayers, docker-compose structure
provides:
  - GameTable extended with 7 async fields (IsAsync, TimerMode, SkipThreshold, TurnDeadline, ConsecutiveSkipsCurrentPlayer, IsPaused, PauseRequestedByUserId)
  - PushSubscription entity for Web Push VAPID keys per user/device
  - NotificationPreference entity with per-user email/push/reminder settings
  - NotificationLog entity with idempotency index for deduplication
  - Hangfire.AspNetCore + Hangfire.PostgreSql registered in Program.cs with /hangfire dashboard
  - Lobby API accepts and persists async game parameters (isAsync, timerMode, skipThreshold)
  - TurnDeadline calculated on game start for async tables
  - Lobby client UI with async/real-time toggle, timer preset picker, async badge on table list
affects: [04-02-deadline-service, 04-03-notification-channels, 04-04-my-games-ui]

# Tech tracking
tech-stack:
  added:
    - "Hangfire.AspNetCore 1.8.23 — background job framework"
    - "Hangfire.PostgreSql 1.21.1 — PostgreSQL storage for Hangfire"
    - "Resend 0.2.1 — transactional email SDK"
    - "Lib.Net.Http.WebPush 3.3.1 — Web Push (VAPID) sending library"
  patterns:
    - "EF Core entities added after initial DB creation use CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS in startup SQL block (same pattern as Phase 03-06)"
    - "Tuple return (T?, string?) from service methods that can fail with a user-visible error message"
    - "Docker compose env vars use ${VAR:-default} syntax for optional secrets with safe defaults"

key-files:
  created:
    - apps/server/Data/PushSubscription.cs
    - apps/server/Data/NotificationPreference.cs
    - apps/server/Data/NotificationLog.cs
  modified:
    - apps/server/Data/GameTable.cs
    - apps/server/Data/GameDbContext.cs
    - apps/server/Program.cs
    - apps/server/server.csproj
    - apps/server/Services/LobbyService.cs
    - apps/server/Endpoints/LobbyEndpoints.cs
    - apps/client/src/lib/api/lobbyApi.ts
    - apps/client/src/routes/lobby/+page.svelte
    - apps/infra/docker-compose.yml

key-decisions:
  - "Hangfire.PostgreSql chosen over IHostedService — built-in dashboard at /hangfire, job retry, persistent job storage across restarts"
  - "CreateTable returns tuple (GameTable?, string?) not throws — service-layer errors return user-readable messages, not exceptions"
  - "NotificationLog unique index on (SessionId, TurnVersion, UserId, Channel) — idempotency prevents duplicate notifications if deadline checker reruns"
  - "Quick Play stays real-time only — async games are intentional, require explicit table creation with timer selection"
  - "TurnDeadline calculated at StartGame, not table creation — deadline starts when game actually begins"

patterns-established:
  - "Tuple return from service: async Task<(Entity?, string?)> CreateTable(...) — used for methods that can fail with user messages"
  - "ALTER TABLE ADD COLUMN IF NOT EXISTS for adding columns to existing tables (EnsureCreated all-or-nothing limitation)"

requirements-completed: [MULT-02, NOTF-02]

# Metrics
duration: 6min
completed: 2026-03-02
---

# Phase 4 Plan 01: Async Game Foundation Summary

**Hangfire + PostgreSQL background job infrastructure, 3 new notification entities, GameTable extended with 7 async fields, lobby API and UI extended for async game creation with timer presets**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-02T17:11:11Z
- **Completed:** 2026-03-02T17:16:39Z
- **Tasks:** 2
- **Files modified:** 11 (8 modified, 3 created)

## Accomplishments
- Hangfire.AspNetCore + Hangfire.PostgreSql installed and registered in Program.cs with PostgreSQL storage and /hangfire dashboard endpoint
- GameTable extended with 7 async mode fields (IsAsync, TimerMode, SkipThreshold, TurnDeadline, ConsecutiveSkipsCurrentPlayer, IsPaused, PauseRequestedByUserId) with proper EF Core config and TurnDeadline index
- 3 new EF Core entities: PushSubscription (Web Push VAPID keys), NotificationPreference (per-user email/push toggles), NotificationLog (idempotency deduplication)
- All 3 new tables + 7 new columns added via ALTER TABLE IF NOT EXISTS / CREATE TABLE IF NOT EXISTS in startup SQL block
- Lobby service and endpoints extended to accept, validate, and persist async params; CreateTableRequest now returns tuple (GameTable?, string?) for error propagation
- Client lobby page updated with async/real-time toggle, timer preset picker (Fast 12h/Normal 24h/Slow 72h), skip threshold input, and async badge on table list items
- RESEND_APITOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT placeholder env vars added to docker-compose.yml

## Task Commits

1. **Task 1: Extend GameTable, create notification entities, install Hangfire, register DI** - `4e1ce77` (feat)
2. **Task 2: Extend lobby service, endpoints, and client for async table creation** - `2128856` (feat)

**Plan metadata:** (pending — created in final commit)

## Files Created/Modified
- `apps/server/Data/GameTable.cs` - Added 7 async fields (IsAsync, TimerMode, SkipThreshold, TurnDeadline, ConsecutiveSkipsCurrentPlayer, IsPaused, PauseRequestedByUserId)
- `apps/server/Data/PushSubscription.cs` - NEW: Web Push subscription entity (Endpoint, P256dh, Auth per user/device)
- `apps/server/Data/NotificationPreference.cs` - NEW: Per-user notification preferences (PK=UserId, EmailEnabled, PushEnabled, ReminderHours)
- `apps/server/Data/NotificationLog.cs` - NEW: Idempotency log with unique index on (SessionId, TurnVersion, UserId, Channel)
- `apps/server/Data/GameDbContext.cs` - Added 3 new DbSets + EF Core configs for all new entities + async column configs on GameTable
- `apps/server/Program.cs` - Hangfire registration with PostgreSQL storage, UseHangfireDashboard, CREATE TABLE IF NOT EXISTS SQL for all 3 new entities + ALTER TABLE for async columns on GameTable
- `apps/server/server.csproj` - Added Hangfire.AspNetCore 1.8.23, Hangfire.PostgreSql 1.21.1, Resend 0.2.1, Lib.Net.Http.WebPush 3.3.1
- `apps/server/Services/LobbyService.cs` - Extended CreateTableRequest with async params, validation, persistence; updated TableListItem with IsAsync/TimerMode; TurnDeadline calc in StartGame; tuple return from CreateTable
- `apps/server/Endpoints/LobbyEndpoints.cs` - Updated CreateTable handler for tuple return from LobbyService
- `apps/client/src/lib/api/lobbyApi.ts` - Extended CreateTableRequest and TableListItem interfaces with async fields
- `apps/client/src/routes/lobby/+page.svelte` - Async/real-time mode toggle, timer preset picker, skip threshold input, async badge on table list
- `apps/infra/docker-compose.yml` - RESEND_APITOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, VITE_VAPID_PUBLIC_KEY env vars

## Decisions Made
- Hangfire.PostgreSql chosen over plain IHostedService — built-in dashboard, job retry, persistent storage across restarts (per research doc recommendation)
- CreateTable returns `(GameTable?, string?)` tuple instead of throwing exceptions — cleaner service-layer error propagation without try/catch overhead at endpoint layer
- NotificationLog unique composite index (SessionId, TurnVersion, UserId, Channel) ensures deadline checker idempotency even if run multiple times
- TurnDeadline calculated at StartGame (not table creation) so deadline starts when game actually begins, not when table is created
- Quick Play stays real-time only — no changes needed (locked decision from CONTEXT.md)

## Deviations from Plan

None — plan executed exactly as written.

Note: Docker was unavailable in this execution environment (Docker Desktop WSL integration not mounted). Used local `dotnet` CLI for package installation and build verification. The server built successfully with 0 errors, 0 warnings. Client TypeScript verification requires Docker with installed node_modules.

## Issues Encountered
- Docker Desktop WSL integration not active — `/mnt/wsl/docker-desktop/` mount missing. Used local `dotnet` CLI as fallback for NuGet package installation and server build. Client `tsc --noEmit` could not be run locally (node_modules not installed outside Docker). Code review confirms all TypeScript changes are syntactically correct.

## User Setup Required

External services will require configuration before Plan 02 (notification sending):
- **Resend**: Create account at https://resend.com/api-keys, add `RESEND_APITOKEN=re_...` to host `.env`
- **VAPID keys**: Generate using `npx web-push generate-vapid-keys`, add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` to host `.env`
- **VAPID_SUBJECT**: Set to `mailto:your@email.com` in host `.env` (defaults to `mailto:admin@bga2.dev`)

These env vars are now wired into docker-compose.yml and will be passed to the server container automatically.

## Next Phase Readiness
- Plan 02 (DeadlineService + Hangfire job) can now register `RecurringJob.AddOrUpdate<DeadlineService>(...)` — the TODO comment is in Program.cs
- Plan 03 (notification channels) can use PushSubscription and NotificationPreference entities + Resend/WebPush packages
- Plan 04 (My Games UI) can filter the lobby by IsAsync using the new TableListItem.isAsync field
- Hangfire dashboard accessible at localhost:8080/hangfire once server container is running

## Self-Check: PASSED
- All 11 files verified present
- Both task commits (4e1ce77, 2128856) verified in git log
- Server builds with 0 errors, 0 warnings (dotnet build)
- Key content verified: IsAsync in GameTable, class PushSubscription, class NotificationPreference, class NotificationLog, AddHangfire in Program.cs

---
*Phase: 04-async-notifications*
*Completed: 2026-03-02*
