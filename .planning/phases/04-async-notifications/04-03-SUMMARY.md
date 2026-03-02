---
phase: 04-async-notifications
plan: "03"
subsystem: ui, api
tags: [pwa, web-push, vapid, service-worker, workbox, sveltekit, csharp, notifications]

# Dependency graph
requires:
  - phase: 04-async-notifications/04-01
    provides: PushSubscription entity, NotificationPreference entity, GameDbContext with Phase 4 DbSets, VAPID env vars in docker-compose

provides:
  - Custom service worker (apps/client/src/service-worker.ts) with Workbox precaching + push + notificationclick handlers
  - pushSubscription.ts client helper for VAPID key conversion and PushManager.subscribe
  - notificationApi.ts API client for push subscribe/unsubscribe and notification preferences
  - NotificationEndpoints.cs server REST endpoints at /notifications/push/subscribe|unsubscribe and /notifications/preferences

affects:
  - 04-async-notifications/04-02 (NotificationService sends push using subscriptions stored by these endpoints)
  - 04-async-notifications/04-04 (notification settings UI uses getPreferences/updatePreferences from notificationApi.ts)

# Tech tracking
tech-stack:
  added:
    - workbox-precaching ^7.0.0 (Workbox precaching in custom service worker)
    - workbox-routing ^7.0.0 (registerRoute API in custom service worker)
    - workbox-strategies ^7.0.0 (NetworkFirst strategy)
    - workbox-expiration ^7.0.0 (ExpirationPlugin for cache limits)
  patterns:
    - injectManifest strategy: vite.config.ts points to src/service-worker.ts; vite-plugin-pwa injects __WB_MANIFEST at build
    - Self-contained service worker: push event + notificationclick + precaching + runtime caching all in one file
    - PushSubscription upsert: subscribe endpoint checks for existing endpoint before insert/update to handle re-registration
    - Notification preferences with defaults: server returns hardcoded defaults when no row exists (avoids forced insert on first GET)

key-files:
  created:
    - apps/client/src/service-worker.ts
    - apps/client/src/lib/pushSubscription.ts
    - apps/client/src/lib/api/notificationApi.ts
    - apps/server/Endpoints/NotificationEndpoints.cs
  modified:
    - apps/client/vite.config.ts (generateSW -> injectManifest, removed workbox block)
    - apps/client/package.json (added workbox-* devDeps)
    - apps/server/Program.cs (registered MapNotificationEndpoints)

key-decisions:
  - "injectManifest strategy: custom service-worker.ts replaces generateSW so push handlers can be added directly"
  - "workbox packages added as explicit devDeps even though @vite-pwa/sveltekit has transitive deps — direct imports need them in scope"
  - "notificationclick handler casts WindowClient to access .navigate() — the ServiceWorker lib types require the cast"
  - "GetPreferences returns JSON defaults (not DB row) for new users — avoids empty insert on first load"

patterns-established:
  - "Service worker push handler: parse JSON with try/catch fallback to text(), show notification with tag=bga2-turn + renotify=true to replace stacked notifications"
  - "notificationclick: matchAll({ type: window, includeUncontrolled: true }) then focus+navigate existing or openWindow"
  - "Push subscribe upsert: FirstOrDefaultAsync on (UserId, Endpoint) -> update keys or add new row"

requirements-completed: [NOTF-03]

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 04 Plan 03: Web Push Client Infrastructure Summary

**Custom service worker with Workbox + push/notificationclick handlers, VAPID push subscription helper, notification API client, and C# REST endpoints for subscription management and preferences**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-02T04:00:00Z
- **Completed:** 2026-03-02T04:15:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced `generateSW` with `injectManifest` strategy in vite.config.ts so a custom TypeScript service worker can be used
- Created `service-worker.ts` with Workbox precaching, API NetworkFirst caching (migrated from vite.config.ts), push event handler (JSON parse + native OS notification), and notificationclick handler (focus/navigate existing window or open new)
- Created `pushSubscription.ts` with `subscribeToPush` (VAPID urlBase64 conversion, PushManager.subscribe, existing subscription check), `isPushPermissionGranted`, and `isInstalledPWA` helpers
- Created `notificationApi.ts` with `subscribePush`, `unsubscribePush`, `getPreferences`, `updatePreferences` all using the established 30s JWT token cache pattern
- Created `NotificationEndpoints.cs` with POST /notifications/push/subscribe (upsert by endpoint), POST /notifications/push/unsubscribe (delete), GET /notifications/preferences (defaults for new users), PUT /notifications/preferences (upsert)

## Task Commits

Each task was committed atomically:

1. **Task 1: Switch PWA to injectManifest strategy with custom service worker** - `b77e09f` (feat)
2. **Task 2: Push subscription helper, notification API client, and server endpoints** - `01f8df5` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `apps/client/src/service-worker.ts` - Custom service worker with Workbox precaching, API caching, push event handler, notificationclick handler
- `apps/client/src/lib/pushSubscription.ts` - VAPID key conversion, PushManager.subscribe with existing-sub check, permission/PWA helpers
- `apps/client/src/lib/api/notificationApi.ts` - subscribePush, unsubscribePush, getPreferences, updatePreferences with 30s JWT cache
- `apps/server/Endpoints/NotificationEndpoints.cs` - REST endpoints for push subscription management and notification preferences
- `apps/client/vite.config.ts` - Migrated from generateSW to injectManifest strategy pointing to service-worker.ts
- `apps/client/package.json` - Added workbox-precaching/routing/strategies/expiration as devDeps
- `apps/server/Program.cs` - Registered MapNotificationEndpoints()

## Decisions Made

- `injectManifest` strategy chosen over `generateSW` so the service worker can include push/notificationclick event handlers that `generateSW` cannot add
- workbox packages added as explicit devDeps in package.json — direct TypeScript imports require them to be installed, even though `@vite-pwa/sveltekit` has transitive workbox deps
- `GetPreferences` returns JSON defaults inline (not a DB record) for users with no preference row — avoids forcing an insert on every first-time GET and keeps defaults in one place
- notificationclick casts `client as WindowClient` to call `.navigate()` — the `lib.webworker` TypeScript types require this cast since `clients.matchAll` returns `Client[]`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Docker is not running in this WSL environment, so `tsc --noEmit` and `dotnet build` verification could not run. Code was reviewed statically for correctness against existing patterns. All entities (PushSubscription, NotificationPreference), DbSets, and EF Core model configuration were confirmed present in GameDbContext from Plan 04-01.

## User Setup Required

None - push subscription endpoints use existing VAPID env vars established in Plan 04-01.

## Next Phase Readiness

- Plan 04-02 (DeadlineService + NotificationService): `NotificationEndpoints.cs` stores push subscriptions that `NotificationService.SendPushAsync` will load
- Plan 04-04 (Notification Settings UI): `notificationApi.ts` exports `getPreferences`/`updatePreferences`/`subscribePush` ready for the settings component
- The `bga2-turn` notification tag ensures turn notifications stack correctly — only one turn notification shown at a time, renotify=true ensures vibration/sound

---
*Phase: 04-async-notifications*
*Completed: 2026-03-02*
