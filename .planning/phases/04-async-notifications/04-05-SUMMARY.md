---
phase: 04-async-notifications
plan: "05"
subsystem: api, ui
tags: [hangfire, async-games, notifications, digest, opt-out, unlimited-timer, escalating-reminders, csharp, svelte]

# Dependency graph
requires:
  - phase: 04-async-notifications/04-01
    provides: Async game foundation (GameTable fields, Hangfire, NotificationPreference entity)
  - phase: 04-async-notifications/04-02
    provides: DeadlineService, NotificationService, PendingReminderJobId
  - phase: 04-async-notifications/04-03
    provides: NotificationEndpoints, notificationApi.ts, service worker push
  - phase: 04-async-notifications/04-04
    provides: Settings UI, lobby My Games section

provides:
  - Unlimited timer mode ("unlimited") in LobbyService, lobby UI, and DeadlineService skip
  - Escalating reminders at 48h/24h/1h before deadline via PendingReminderJobIds JSON array
  - DeliveryMode (immediate/daily_digest) on NotificationPreference with digest deferral
  - Per-game notification opt-out via NotificationOptOut entity and endpoints
  - Daily digest email batch job (digest-sender, 09:00 UTC via Hangfire)
  - Client delivery mode toggle on settings page
  - Client per-game Mute/Unmute on lobby My Games cards

affects:
  - Phase 05 (production deployment needs RESEND_APITOKEN for digest emails)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PendingReminderJobIds as JSON array: multiple Hangfire job IDs stored in single jsonb column for batch cancellation"
    - "Escalating reminder pattern: schedule 48h/24h/1h reminders, only those within timer window"
    - "Digest deferral via email-pending-digest channel: NotificationLog reused as pending queue"
    - "Per-game opt-out checked at notification dispatch time in SendNotification"

key-files:
  created:
    - apps/server/Data/NotificationOptOut.cs
  modified:
    - apps/server/Data/GameTable.cs (PendingReminderJobId -> PendingReminderJobIds)
    - apps/server/Data/NotificationPreference.cs (DeliveryMode field)
    - apps/server/Data/GameDbContext.cs (NotificationOptOut entity + config, DeliveryMode config)
    - apps/server/Services/LobbyService.cs (unlimited timer mode validation + TurnDeadline skip)
    - apps/server/Services/GameService.cs (escalating 48h/24h/1h reminders, unlimited skip)
    - apps/server/Services/DeadlineService.cs (unlimited safety guard, escalating reminders on turn advance)
    - apps/server/Services/NotificationService.cs (opt-out check, delivery mode deferral, SendDigestBatch)
    - apps/server/Endpoints/NotificationEndpoints.cs (deliveryMode in prefs, opt-out/opt-in endpoints)
    - apps/server/Program.cs (digest-sender job, NotificationOptOuts DDL, new columns)
    - apps/client/src/lib/api/notificationApi.ts (deliveryMode, optOutGame, optInGame)
    - apps/client/src/lib/api/lobbyApi.ts (unlimited timer type comments)
    - apps/client/src/routes/settings/+page.svelte (delivery mode toggle)
    - apps/client/src/routes/lobby/+page.svelte (unlimited button, mute/unmute)

key-decisions:
  - "PendingReminderJobIds as jsonb array replaces single PendingReminderJobId -- supports multiple escalating reminder job IDs"
  - "Escalating reminders at 48h/24h/1h before deadline -- only offsets within timer window are scheduled (e.g. fast 12h only gets 1h reminder)"
  - "Digest deferral uses email-pending-digest channel in NotificationLog -- reuses existing idempotency infrastructure as pending queue"
  - "Push notifications always fire immediately even in digest mode -- push is inherently immediate, only email gets batched"
  - "Per-game opt-out state resets on page refresh -- v1 acceptable, future improvement loads state from server"

patterns-established:
  - "Escalating reminder scheduling: loop over offsets, only schedule if offset < timerHours"
  - "JSON array for multiple Hangfire job IDs: serialize/deserialize List<string> in jsonb column"
  - "Opt-out check at dispatch: table lookup + NotificationOptOuts.AnyAsync before sending"

requirements-completed: [MULT-02, NOTF-02, NOTF-04]

# Metrics
duration: 13min
completed: 2026-03-02
---

# Phase 04 Plan 05: Gap Closure Summary

**Unlimited timer mode, escalating 48h/24h/1h reminders, daily digest delivery mode, and per-game notification opt-out closing three verification gaps (MULT-02, NOTF-02, NOTF-04)**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-03-02T21:51:26Z
- **Completed:** 2026-03-02T22:05:00Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Added "unlimited" timer mode: LobbyService accepts it, TurnDeadline stays null, DeadlineService skips unlimited games, lobby UI shows 4th preset button
- Replaced single reminder with escalating reminders at 48h, 24h, and 1h before deadline using PendingReminderJobIds JSON array on GameTable
- Added DeliveryMode (immediate/daily_digest) to NotificationPreference with digest deferral in NotificationService and daily batch job
- Added per-game notification opt-out via NotificationOptOut entity, opt-out/opt-in API endpoints, and Mute/Unmute buttons on My Games cards
- Verified end-to-end: server builds (0 errors), DB schema has all new columns/tables, Hangfire has both recurring jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side gap closure -- unlimited timer, escalating reminders, digest/opt-out** - `432ee60` (feat)
2. **Task 2: Client-side gap closure -- unlimited preset, delivery mode, per-game opt-out UI** - `003fdaf` (feat)
3. **Task 3: Integration verification** - no file changes (verification only)

**Plan metadata:** (pending)

## Files Created/Modified

- `apps/server/Data/NotificationOptOut.cs` - Per-game notification opt-out entity (UserId + TableId)
- `apps/server/Data/GameTable.cs` - Replaced PendingReminderJobId with PendingReminderJobIds (jsonb array)
- `apps/server/Data/NotificationPreference.cs` - Added DeliveryMode field (immediate/daily_digest)
- `apps/server/Data/GameDbContext.cs` - NotificationOptOut entity config, DeliveryMode column config, PendingReminderJobIds jsonb
- `apps/server/Services/LobbyService.cs` - Unlimited timer mode in validModes, TurnDeadline skip for unlimited
- `apps/server/Services/GameService.cs` - Escalating 48h/24h/1h reminders, unlimited game skip, batch job ID cancellation
- `apps/server/Services/DeadlineService.cs` - Unlimited safety guard, escalating reminders on turn advance
- `apps/server/Services/NotificationService.cs` - Opt-out check, delivery mode deferral, SendDigestBatch method
- `apps/server/Endpoints/NotificationEndpoints.cs` - deliveryMode in prefs GET/PUT, opt-out/opt-in endpoints
- `apps/server/Program.cs` - digest-sender Hangfire recurring job, NotificationOptOuts DDL, PendingReminderJobIds + DeliveryMode columns
- `apps/client/src/lib/api/notificationApi.ts` - deliveryMode in interface, optOutGame/optInGame functions
- `apps/client/src/lib/api/lobbyApi.ts` - Updated type comments for unlimited timer mode
- `apps/client/src/routes/settings/+page.svelte` - Delivery mode toggle (Immediate/Daily Digest)
- `apps/client/src/routes/lobby/+page.svelte` - Unlimited timer button, Mute/Unmute per-game opt-out

## Decisions Made

- PendingReminderJobIds as jsonb replaces PendingReminderJobId -- supports batch cancellation of multiple escalating reminder jobs
- Escalating reminders only schedule offsets within timer window (e.g., fast 12h game only gets 1h reminder, not 48h/24h)
- Digest deferral reuses NotificationLog as pending queue with "email-pending-digest" channel
- Push notifications always immediate even in digest mode -- push is inherently real-time
- Per-game opt-out state resets on lobby page refresh (v1 acceptable -- no server round-trip to load initial state)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added System.Text.Json import to DeadlineService**
- **Found during:** Task 1 (escalating reminders in DeadlineService)
- **Issue:** DeadlineService needed JsonSerializer.Deserialize/Serialize for PendingReminderJobIds but lacked the import
- **Fix:** Added `using System.Text.Json;` to DeadlineService.cs
- **Files modified:** apps/server/Services/DeadlineService.cs
- **Verification:** Server build passes
- **Committed in:** 432ee60 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial missing import. No scope creep.

## Issues Encountered

- Server `dotnet build` fails with MSB3027 "Text file busy" when server process is running -- used alternate output directory (`-o /tmp/bga2-build`) to verify build without stopping the server
- Pre-existing svelte-check module resolution errors (54 total) across the project -- none in modified files, all from existing `$lib` path resolution issues

## User Setup Required

None - all changes use existing infrastructure (Hangfire, Resend, VAPID keys).

## Next Phase Readiness

- All three Phase 04 verification gaps are now closed:
  - MULT-02: Unlimited timer mode fully implemented
  - NOTF-02: Escalating reminders replace single configurable reminder
  - NOTF-04: Delivery mode + per-game opt-out with digest batch job
- Phase 04 can be marked complete after final verification run

## Self-Check: PASSED

- All 14 modified/created files verified present on disk
- Task 1 commit `432ee60` verified in git log
- Task 2 commit `003fdaf` verified in git log
- Server build: 0 errors, 0 warnings
- Database schema: DeliveryMode, PendingReminderJobIds, NotificationOptOuts all confirmed
- Hangfire: deadline-checker and digest-sender recurring jobs confirmed

---
*Phase: 04-async-notifications*
*Completed: 2026-03-02*
