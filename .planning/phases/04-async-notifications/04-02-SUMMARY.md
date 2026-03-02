---
phase: 04-async-notifications
plan: "02"
subsystem: notifications
tags: [hangfire, notifications, email, web-push, resend, async, deadline, gameservice]

# Dependency graph
requires:
  - phase: 04-async-notifications
    plan: "01"
    provides: Hangfire, PushSubscription, NotificationPreference, NotificationLog entities, GameTable async fields
provides:
  - NotificationService with NotifyYourTurn and SendDeadlineReminder (email + push, preference-aware, idempotent)
  - DeadlineService with ProcessExpiredDeadlines Hangfire recurring job (auto-skip + forfeit enforcement)
  - GameService.ValidateAndApplyMove extended with async notification block
  - PendingReminderJobId on GameTable for proper reminder cancellation
affects: [04-03-notification-channels, 04-04-my-games-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lib.Net.Http.WebPush: PushServiceClient.RequestPushMessageDeliveryAsync(sub, msg, vapidAuth) — pass VapidAuthentication per-call (not via DefaultAuthentication)"
    - "Hangfire reminder cancellation: store Hangfire job ID (BackgroundJob.Schedule returns string) on GameTable.PendingReminderJobId; cancel with BackgroundJob.Delete on next move"
    - "NotifyYourTurn enqueued via BackgroundJob.Enqueue after DB save — move response returns before notification completes"

key-files:
  created:
    - apps/server/Services/NotificationService.cs
    - apps/server/Services/DeadlineService.cs
  modified:
    - apps/server/Data/GameTable.cs
    - apps/server/Data/GameDbContext.cs
    - apps/server/Program.cs
    - apps/server/Services/GameService.cs

key-decisions:
  - "VapidAuthentication passed per-call to RequestPushMessageDeliveryAsync rather than setting DefaultAuthentication — thread-safe for concurrent notifications"
  - "PendingReminderJobId stored on GameTable (varchar 128) — enables proper Hangfire job cancellation using the job ID returned by BackgroundJob.Schedule"
  - "ExtractUserIdForPlayer matches by player.id string (e.g. player-0) then returns player.userId — consistent with existing ExtractPlayerResults pattern"
  - "All notification code in ValidateAndApplyMove wrapped in try/catch — notifications are best-effort, never block move response"

patterns-established:
  - "Graceful degradation: check RESEND_APITOKEN before email, check VAPID keys before push — log warning and skip if absent"
  - "Raw SQL for Better Auth user table: SqlQueryRaw<string> SELECT email FROM user WHERE id = {0}"

requirements-completed: [NOTF-01, NOTF-02]

# Metrics
duration: 7min
completed: 2026-03-02
---

# Phase 4 Plan 02: Notification Service and Deadline Service Summary

**Server-side notification pipeline: NotificationService (Resend email + VAPID push with idempotency), DeadlineService (Hangfire recurring job for expired deadlines), and notification triggers wired into GameService.ValidateAndApplyMove**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-02T17:20:08Z
- **Completed:** 2026-03-02T17:26:59Z
- **Tasks:** 2
- **Files modified:** 4 modified, 2 created

## Accomplishments

- NotificationService created with `NotifyYourTurn` and `SendDeadlineReminder` methods — checks per-user preferences (email/push toggles), checks NotificationLog for idempotency before sending, dispatches email via Resend and push via VAPID; gracefully degrades when credentials are absent
- DeadlineService created with `ProcessExpiredDeadlines` decorated with `[DisableConcurrentExecution(60)]` — queries async Playing tables with expired TurnDeadline every 5 minutes, increments ConsecutiveSkipsCurrentPlayer, enforces forfeit threshold, advances turn with new deadline, enqueues NotifyYourTurn for next player
- GameService.ValidateAndApplyMove extended with async notification block: looks up GameTable, sets new TurnDeadline, cancels previous reminder job (via PendingReminderJobId), enqueues NotifyYourTurn, schedules SendDeadlineReminder with user-preference-adjusted delay
- PendingReminderJobId added to GameTable for proper Hangfire job cancellation — BackgroundJob.Schedule returns a job ID that can be stored and later cancelled with BackgroundJob.Delete
- ExtractUserIdForPlayer helper added to GameService for looking up a player's userId by their game-scoped id
- Note: Program.cs DI registrations and RecurringJob.AddOrUpdate were already added by 04-03 (ran out of order); this plan's Task 1 logic verified they match spec exactly

## Task Commits

1. **Task 1: Create NotificationService and DeadlineService** - `78bd03e` (feat)
2. **Task 2: Wire notification triggers into GameService.ValidateAndApplyMove** - `8f293d8` (feat)

## Files Created/Modified

- `apps/server/Services/NotificationService.cs` - NEW: Dispatches email (Resend) + push (VAPID) with preference checking and NotificationLog idempotency
- `apps/server/Services/DeadlineService.cs` - NEW: Hangfire recurring job for deadline enforcement — auto-skip, forfeit check, turn advance
- `apps/server/Data/GameTable.cs` - Added PendingReminderJobId (nullable string) for Hangfire job ID storage
- `apps/server/Data/GameDbContext.cs` - Added EF Core config for PendingReminderJobId (max 128 chars)
- `apps/server/Program.cs` - Added ALTER TABLE for PendingReminderJobId column (safe ADD COLUMN IF NOT EXISTS)
- `apps/server/Services/GameService.cs` - Added Hangfire using, notification block after AppSync publish, ExtractUserIdForPlayer helper

## Decisions Made

- `VapidAuthentication` passed per-call to `RequestPushMessageDeliveryAsync(sub, msg, vapidAuth)` — thread-safe for concurrent Hangfire jobs vs. setting `DefaultAuthentication` which would be shared state
- `PendingReminderJobId` stored as string on `GameTable` — BackgroundJob.Schedule returns an opaque job ID string; we store it for cancellation via BackgroundJob.Delete when player moves
- All notification code in ValidateAndApplyMove wrapped in single try/catch — notifications are non-fatal best-effort (same pattern as AppSync publish)
- Raw SQL `SELECT email FROM "user" WHERE id = {0}` for Better Auth user table — not managed by EF Core, only accessible via SqlQueryRaw

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] VapidAuthentication namespace fix**
- **Found during:** Task 1 (build error)
- **Issue:** `VapidAuthentication` lives in `Lib.Net.Http.WebPush.Authentication` namespace, not the root namespace as initially coded
- **Fix:** Added `using Lib.Net.Http.WebPush.Authentication;` and used `PushEncryptionKeyName` enum with `SetKey()` method instead of dictionary initialization
- **Files modified:** `apps/server/Services/NotificationService.cs`
- **Commit:** `78bd03e`

**2. [Context - Out-of-order execution] Program.cs DI already configured by 04-03**
- **Found during:** Task 1
- **Issue:** Plan 04-03 ran before 04-02 and already added PushServiceClient HttpClient, Resend services, NotificationService/DeadlineService DI, RecurringJob registration, and MapNotificationEndpoints() to Program.cs
- **Action:** My edits to Program.cs were no-ops (content already present). Verified all registrations match the 04-02 spec exactly. No rework needed.

## Issues Encountered

- Docker Desktop WSL integration not active — used local `dotnet` CLI for build verification (same constraint as 04-01)
- Plan 04-03 ran before 04-02 (out-of-order execution) — Program.cs DI already set up; treated as a non-issue since content matched spec

## Self-Check: PASSED

- `apps/server/Services/NotificationService.cs` — FOUND
- `apps/server/Services/DeadlineService.cs` — FOUND
- `apps/server/Data/GameTable.cs` contains `PendingReminderJobId` — FOUND
- `apps/server/Services/GameService.cs` contains `BackgroundJob.Enqueue.*NotifyYourTurn` — FOUND
- Commit `78bd03e` — FOUND
- Commit `8f293d8` — FOUND
- Server builds with 0 errors, 0 warnings (dotnet build)

---
*Phase: 04-async-notifications*
*Completed: 2026-03-02*
