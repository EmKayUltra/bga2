---
phase: 04-async-notifications
verified: 2026-03-02T23:30:00Z
status: passed
score: 8/8 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/8
  gaps_closed:
    - "A player can start an async game with a chosen timer preset (fast / normal / slow / unlimited)"
    - "Escalating reminders fire at 48h, 24h, and final hour before a deadline"
    - "A player can configure notification preferences (immediate vs. daily digest, per-game opt-out)"
  gaps_remaining: []
  regressions: []
---

# Phase 4: Async + Notifications Verification Report

**Phase Goal:** Players can start a game and take turns over days or weeks -- the platform supports the dominant adult play pattern (async) with notifications that keep games moving without causing fatigue
**Verified:** 2026-03-02T23:30:00Z
**Status:** passed
**Re-verification:** Yes -- after gap closure (Plan 04-05)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A player can start an async game with a chosen timer preset (fast/normal/slow/unlimited) | VERIFIED | LobbyService.cs line 111: `validModes = ["fast", "normal", "slow", "unlimited"]`; StartGame line 345: `if (table.TimerMode != "unlimited")` sets deadline, else TurnDeadline stays null; ResumeGame line 603: same pattern; lobby UI line 477-484: 4th "Unlimited / No timer" button |
| 2 | The game advances only when the active player submits a move or the deadline expires | VERIFIED | GameService.ValidateAndApplyMove (line 287-345) updates TurnDeadline on move; DeadlineService.ProcessExpiredDeadlines auto-skips on expiry every 5 min; unlimited games have no deadline |
| 3 | When it becomes a player's turn in an async game, they receive an email notification | VERIFIED | NotificationService.NotifyYourTurn sends email via Resend; wired via BackgroundJob.Enqueue in GameService (line 323) and DeadlineService (line 140) |
| 4 | Escalating reminders fire at 48h, 24h, and final hour before a deadline | VERIFIED | GameService.cs lines 327-341: `reminderOffsets = new[] { 48, 24, 1 }` loop schedules BackgroundJob.Schedule for each offset within timer window; DeadlineService.cs lines 143-158: same 48h/24h/1h pattern on turn advance; PendingReminderJobIds (jsonb array) stores multiple job IDs; old jobs cancelled before scheduling new ones |
| 5 | A player who has installed the PWA receives a Web Push notification when it is their turn | VERIFIED | service-worker.ts line 23: `addEventListener('push', ...)` with showNotification; server sends push via PushServiceClient in NotificationService.TrySendPush; VAPID subscription flow wired |
| 6 | Clicking a push notification opens the app to the correct game page | VERIFIED | service-worker.ts line 46: notificationclick handler navigates to event.notification.data.url; payload includes /game/{sessionId} |
| 7 | A player can configure notification preferences (immediate vs. daily digest, per-game opt-out) | VERIFIED | NotificationPreference.cs line 13: `DeliveryMode = "immediate"` field; NotificationOptOut.cs: entity with UserId + TableId; settings page lines 334-353: Immediate/Daily Digest toggle wired to deliveryMode state; lobby page lines 241-255: Mute/Unmute button per game card calling optOutGame/optInGame |
| 8 | Those preferences are respected by all notification channels | VERIFIED | NotificationService.SendNotification: line 161-169 checks NotificationOptOuts.AnyAsync (per-game opt-out); line 181 checks DeliveryMode == "daily_digest" and defers to email-pending-digest channel; line 230 checks pushEnabled; push always fires immediately even in digest mode; SendDigestBatch (lines 84-143) processes daily_digest users at 09:00 UTC via Hangfire |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/server/Data/GameTable.cs` | Extended with async fields + PendingReminderJobIds | VERIFIED | IsAsync, TimerMode, SkipThreshold, TurnDeadline, ConsecutiveSkipsCurrentPlayer, IsPaused, PauseRequestedByUserId, PendingReminderJobIds (line 30, jsonb array) |
| `apps/server/Data/PushSubscription.cs` | Web Push subscription entity | VERIFIED | Regression check: exists with Id, UserId, Endpoint, P256dh, Auth, CreatedAt |
| `apps/server/Data/NotificationPreference.cs` | Per-user notification settings + DeliveryMode | VERIFIED | UserId PK, EmailEnabled, PushEnabled, ReminderHoursBeforeDeadline, DeliveryMode (line 13, default "immediate") |
| `apps/server/Data/NotificationOptOut.cs` | Per-game notification opt-out entity | VERIFIED | New file: Id, UserId, TableId, CreatedAt (13 lines) |
| `apps/server/Data/NotificationLog.cs` | Idempotency log | VERIFIED | Regression check: SessionId + TurnVersion + UserId + Channel composite uniqueness |
| `apps/server/Data/GameDbContext.cs` | EF config for new entities | VERIFIED | NotificationOptOut DbSet (line 30), entity config with unique (UserId, TableId) index and cascade FK (lines 288-307), DeliveryMode config with HasMaxLength(16) and HasDefaultValue("immediate") (lines 279-281), PendingReminderJobIds HasColumnType("jsonb") (line 103) |
| `apps/server/Services/NotificationService.cs` | Email + push dispatch + digest + opt-out | VERIFIED | 435 lines; SendDigestBatch (lines 84-143) processes daily_digest pending entries; SendNotification checks opt-out (lines 161-169) and delivery mode (line 181); digest deferral uses "email-pending-digest" channel in NotificationLog |
| `apps/server/Services/DeadlineService.cs` | Hangfire deadline checker + escalating reminders | VERIFIED | 277 lines; unlimited safety guard (line 68); PendingReminderJobIds batch cancel (lines 120-126); escalating 48h/24h/1h reminders on turn advance (lines 143-158) |
| `apps/server/Services/GameService.cs` | Extended with escalating reminders + unlimited | VERIFIED | Lines 293-300: cancel all PendingReminderJobIds; line 306: unlimited => TurnDeadline=null, no reminders; lines 327-341: schedule 48h/24h/1h escalating reminders |
| `apps/server/Services/LobbyService.cs` | Unlimited timer mode validation | VERIFIED | Line 111: `validModes = ["fast", "normal", "slow", "unlimited"]`; line 345: `TimerMode != "unlimited"` guard; line 603: same in ResumeGame |
| `apps/server/Program.cs` | Hangfire + DI + recurring jobs + DDL | VERIFIED | Line 199: PendingReminderJobIds jsonb column DDL; line 238: DeliveryMode column DDL; lines 241-248: NotificationOptOuts table DDL; lines 269-271: digest-sender recurring job at "0 9 * * *" |
| `apps/server/Endpoints/NotificationEndpoints.cs` | REST endpoints for push + prefs + opt-out | VERIFIED | 248 lines; 6 endpoints total: push subscribe/unsubscribe, preferences GET/PUT (includes deliveryMode in both), opt-out POST /opt-out/{tableId}, opt-in DELETE /opt-out/{tableId}; UpdatePreferencesRequest includes DeliveryMode (line 247) |
| `apps/client/src/service-worker.ts` | Custom SW with push handler | VERIFIED | Regression check: push handler (line 23), notificationclick handler (line 46) |
| `apps/client/src/lib/pushSubscription.ts` | VAPID push subscription helper | VERIFIED | Regression check: subscribeToPush (line 26), isPushPermissionGranted (line 52) |
| `apps/client/src/lib/api/notificationApi.ts` | API client for notifications + opt-out | VERIFIED | 118 lines; NotificationPreferences interface includes deliveryMode (line 77); optOutGame (line 101) and optInGame (line 110) exported; getPreferences/updatePreferences include deliveryMode |
| `apps/client/src/lib/api/lobbyApi.ts` | Extended with async types + APIs | VERIFIED | Regression check: CreateTableRequest, MyGameItem, getMyGames, pause APIs all present |
| `apps/client/vite.config.ts` | injectManifest strategy | VERIFIED | Regression check: strategies: 'injectManifest' |
| `apps/client/src/routes/settings/+page.svelte` | Notifications preferences + delivery mode | VERIFIED | 765 lines; deliveryMode state (line 44); loaded from prefs on mount (line 80); sent in handleSaveNotifications (line 116); Immediate/Daily Digest toggle UI (lines 334-353); mode-toggle CSS styles (lines 664-691) |
| `apps/client/src/routes/lobby/+page.svelte` | Async filter + My Games + unlimited + opt-out | VERIFIED | 1153 lines; createTimerMode type includes 'unlimited' (line 41); 4th Unlimited button (lines 477-484); Mute/Unmute button on each game card (lines 241-255); optOutGame/optInGame imported (line 14); gameOptOuts state (line 31); unlimited time display (lines 225-226, 234-235, 308, 316) |
| `apps/client/src/routes/game/[id]/+page.svelte` | Timer countdown + pause flow | VERIFIED | Regression check: still present and functional |
| `apps/client/src/routes/+layout.svelte` | In-app notification badge | VERIFIED | Regression check: getMyGames (line 5, 26), isMyTurn filter for badge count |
| `apps/infra/docker-compose.yml` | VAPID + Resend env vars | VERIFIED | Regression check: RESEND_APITOKEN, VAPID keys all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| GameService.cs | NotificationService.cs | BackgroundJob.Enqueue after move save | WIRED | Line 323: `BackgroundJob.Enqueue<NotificationService>(svc => svc.NotifyYourTurn(...))` |
| GameService.cs | GameTable.PendingReminderJobIds | JSON serialize/deserialize for escalating reminder job IDs | WIRED | Lines 294-300: deserialize + delete old; line 341: serialize new job IDs |
| GameService.cs | NotificationService.cs | BackgroundJob.Schedule for 48h/24h/1h reminders | WIRED | Lines 334-337: `BackgroundJob.Schedule<NotificationService>(svc => svc.SendDeadlineReminder(...), delay)` in loop |
| DeadlineService.cs | GameTable (TurnDeadline) | Query expired deadlines | WIRED | Lines 40-47: `Where(t => t.IsAsync && !t.IsPaused && t.TurnDeadline <= now && t.Status == Playing)` |
| DeadlineService.cs | GameTable.PendingReminderJobIds | Cancel old + schedule new on turn advance | WIRED | Lines 120-126: cancel; lines 143-158: schedule 48h/24h/1h |
| DeadlineService.cs | NotificationService.cs | Enqueue NotifyYourTurn + Schedule reminders | WIRED | Line 140: `BackgroundJob.Enqueue<NotificationService>(svc => svc.NotifyYourTurn(...))` |
| DeadlineService.cs | Unlimited guard | Skip unlimited games | WIRED | Line 68: `if (table.TimerMode == "unlimited") return;` |
| NotificationService.cs | NotificationOptOut | Check opt-out before sending | WIRED | Lines 161-169: `_db.NotificationOptOuts.AnyAsync(o => o.UserId == userId && o.TableId == table.Id)` |
| NotificationService.cs | NotificationPreference.DeliveryMode | Defer email for digest users | WIRED | Line 181: `if (prefs?.DeliveryMode == "daily_digest")` stores pending digest entry instead of sending |
| NotificationService.cs | SendDigestBatch | Process daily digest | WIRED | Lines 84-143: queries digest users, loads pending entries, sends batch email, removes pending records |
| NotificationService.cs | NotificationLog | Idempotency check before send | WIRED | AnyAsync check on SessionId+TurnVersion+UserId+Channel (both email and push) |
| NotificationService.cs | PushSubscription | Load subscriptions for push send | WIRED | Line 363: `_db.PushSubscriptions.Where(s => s.UserId == userId)` |
| LobbyService.cs | GameTable.IsAsync | CreateTable sets async fields + unlimited | WIRED | Line 111: validModes includes "unlimited"; line 345: unlimited guard on StartGame |
| NotificationEndpoints.cs | NotificationOptOut | Opt-out/opt-in endpoints | WIRED | Lines 41-49: MapPost/MapDelete for /opt-out/{tableId}; handlers create/remove NotificationOptOut records |
| NotificationEndpoints.cs | NotificationPreference.DeliveryMode | GET/PUT preferences include deliveryMode | WIRED | Line 127/135: deliveryMode in response; line 159/169: DeliveryMode set from request |
| Program.cs | NotificationService.SendDigestBatch | digest-sender recurring Hangfire job | WIRED | Lines 269-271: `RecurringJob.AddOrUpdate<NotificationService>("digest-sender", svc => svc.SendDigestBatch(), "0 9 * * *")` |
| Program.cs | DeadlineService | deadline-checker recurring job | WIRED | Lines 264-265: `RecurringJob.AddOrUpdate<DeadlineService>("deadline-checker", ...)` |
| lobbyApi.ts | LobbyEndpoints.cs | createTable sends async params | WIRED | CreateTableRequest includes isAsync, timerMode (with unlimited), skipThreshold |
| notificationApi.ts | NotificationEndpoints | deliveryMode + opt-out APIs | WIRED | Lines 89-97: updatePreferences sends deliveryMode; lines 101-117: optOutGame/optInGame fetch /opt-out/{tableId} |
| settings/+page.svelte | notificationApi.ts | deliveryMode in load + save | WIRED | Line 80: reads prefs.deliveryMode; line 116: sends deliveryMode in updatePreferences |
| lobby/+page.svelte | notificationApi.ts | optOutGame/optInGame | WIRED | Line 14: import; lines 244-251: calls optOutGame/optInGame on Mute/Unmute click |
| lobby/+page.svelte | /tables/my-games | getMyGames() API call | WIRED | Line 77: `myGames = await getMyGames()` with 30s poll |
| service-worker.ts | Push events | addEventListener('push') | WIRED | Line 23: push handler with showNotification |
| +layout.svelte | lobbyApi.ts | getMyGames for badge count | WIRED | Lines 5, 26: imports and calls getMyGames, filters isMyTurn |
| vite.config.ts | service-worker.ts | injectManifest strategy | WIRED | Regression check: strategies: 'injectManifest' |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MULT-02 | 04-01, 04-04, 04-05 | Async turn-based play with configurable timer presets (fast/normal/slow/unlimited) | SATISFIED | All four timer modes accepted by LobbyService; unlimited sets TurnDeadline=null and skips deadline enforcement; lobby UI shows all four preset buttons |
| NOTF-01 | 04-02 | User receives email notification when it's their turn (async games) | SATISFIED | NotificationService.NotifyYourTurn sends email via Resend with idempotency; wired from GameService and DeadlineService |
| NOTF-02 | 04-01, 04-02, 04-05 | Turn timer enforces deadlines with escalating reminders (48h, 24h, final hour) | SATISFIED | DeadlineService auto-skips expired deadlines; GameService and DeadlineService both schedule 48h/24h/1h escalating reminders via Hangfire; PendingReminderJobIds stores multiple job IDs for batch cancellation |
| NOTF-03 | 04-03 | User receives Web Push notification via PWA service worker | SATISFIED | Custom service worker with push handler, VAPID subscription, server-side push dispatch via PushServiceClient |
| NOTF-04 | 04-04, 04-05 | User can configure notification preferences (immediate vs digest, per-game) | SATISFIED | DeliveryMode field (immediate/daily_digest) on NotificationPreference; NotificationOptOut entity for per-game opt-out; digest deferral in NotificationService; SendDigestBatch daily at 09:00 UTC; settings page has delivery mode toggle; lobby page has Mute/Unmute per game |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | - | - | No TODO/FIXME/PLACEHOLDER/stub patterns detected in any Phase 4 files |

### Human Verification Required

### 1. Timer Countdown Color Shifts

**Test:** Open an active async game, observe the timer countdown display in the info bar. Wait or use DevMenu to set a deadline close to expiry.
**Expected:** Timer text shifts from green (>50% remaining) to yellow (25-50%) to red (<25%) with a pulsing animation in red state.
**Why human:** CSS animation and color transitions require visual inspection; cannot verify color rendering programmatically.

### 2. Push Notification End-to-End

**Test:** Install the PWA on a device, subscribe to push notifications, then trigger a move in an async game as the other player.
**Expected:** A native OS push notification appears with "Your Turn!" title and a link to the game page. Clicking it navigates to the correct game.
**Why human:** Requires a real browser with push permission, VAPID keys configured, and an actual installed PWA. Cannot test push delivery programmatically.

### 3. Pause Request Flow

**Test:** In an async game between two accounts, one player clicks "Request Pause". The other player should see Accept/Decline buttons.
**Expected:** Accept stops the timer, shows "Game Paused" banner. Resume restarts the timer with a fresh deadline. Decline clears the request.
**Why human:** Requires two authenticated sessions interacting in the same game. Timing and state transitions need real-time observation.

### 4. In-App Badge Accuracy

**Test:** Create multiple async games, make moves so some are "Your Turn". Check the nav bar badge count.
**Expected:** Red badge next to "Lobby" link shows the exact count of games where it's your turn. Disappears when count is 0.
**Why human:** Requires multiple active async games and real authentication to verify polling accuracy.

### 5. Unlimited Timer Mode End-to-End (NEW)

**Test:** Create an async game with the "Unlimited" timer preset. Start the game and play a turn.
**Expected:** No timer countdown is displayed. No deadline-related badges or time-remaining text. Game remains playable indefinitely. DeadlineService does not skip or forfeit.
**Why human:** Requires creating a game via the lobby UI and verifying the absence of timer elements.

### 6. Delivery Mode Toggle (NEW)

**Test:** On the settings page, toggle between "Immediate" and "Daily Digest" delivery modes. Save. Reload the page.
**Expected:** The selected mode persists across reload. When set to Daily Digest, the description changes to "Turn notifications are batched into a single daily email at 9:00 AM UTC."
**Why human:** Requires authenticated session and visual inspection of the toggle state persistence.

### 7. Per-Game Mute/Unmute (NEW)

**Test:** In the lobby My Games section, click "Mute" on a game card. Verify the button changes to "Unmute".
**Expected:** Button text toggles. After muting, notifications for that specific game should be suppressed (verifiable by checking the NotificationOptOuts table or observing no notification on next turn).
**Why human:** Requires active async games and observation of notification suppression behavior.

### Gap Closure Summary

All three gaps identified in the initial verification have been closed by Plan 04-05:

1. **Unlimited timer preset (CLOSED):** LobbyService now accepts "unlimited" in the validModes array (line 111). StartGame and ResumeGame both guard with `TimerMode != "unlimited"` to keep TurnDeadline null. DeadlineService has a safety guard (line 68) that skips unlimited games. The lobby UI has a 4th "Unlimited / No timer" button. The `createTimerMode` type includes 'unlimited'. Table list and My Games display "No limit" for unlimited games.

2. **Escalating reminders (CLOSED):** Both GameService (lines 327-341) and DeadlineService (lines 143-158) now schedule reminders at 48h, 24h, and 1h before deadline using `reminderOffsets = new[] { 48, 24, 1 }`. Only offsets within the timer window are scheduled (e.g., a 12h "fast" game only gets the 1h reminder). PendingReminderJobIds (jsonb array on GameTable, line 30) stores multiple Hangfire job IDs for batch cancellation. Old reminder jobs are cancelled via JSON deserialization + loop before scheduling new ones.

3. **Digest mode and per-game opt-out (CLOSED):** NotificationPreference.DeliveryMode (line 13) supports "immediate" and "daily_digest". NotificationOptOut entity (new file) links UserId + TableId. NotificationService.SendNotification checks opt-out (lines 161-169) and delivery mode (line 181) before sending. Digest users get "email-pending-digest" entries in NotificationLog instead of immediate email. SendDigestBatch (lines 84-143) processes these daily at 09:00 UTC via Hangfire recurring job. NotificationEndpoints includes deliveryMode in preferences GET/PUT and exposes /opt-out/{tableId} POST/DELETE endpoints. Settings page has Immediate/Daily Digest toggle. Lobby page has Mute/Unmute button per game.

**No regressions detected.** All 5 previously-verified truths remain verified with their original artifacts and wiring intact.

---

_Verified: 2026-03-02T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
