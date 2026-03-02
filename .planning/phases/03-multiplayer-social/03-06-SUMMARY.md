---
phase: 03-multiplayer-social
plan: "06"
subsystem: ui, api, infra
tags: [chat, appsync, pwa, svelte, csharp, profanity-filter, websocket, service-worker, workbox]

# Dependency graph
requires:
  - phase: 03-04
    provides: AppSync Events infrastructure (configureAppSync, subscribeToGame, appsync.ts module)
  - phase: 03-02
    provides: Waiting room (table/[id]/+page.svelte) with chat placeholder
provides:
  - Real-time in-game text chat via AppSync Events WebSocket
  - Server-side profanity filter (C# ChatFilter) with l33t-speak normalization
  - Player report functionality (PlayerReport entity + POST /chat/{channelId}/report endpoint)
  - ChatPanel Svelte component (reusable, works in game and waiting room)
  - PWA manifest with name, icons, standalone display via @vite-pwa/sveltekit
  - Workbox service worker with NetworkFirst caching for /api/ routes
affects: [04-notifications, phase-4]

# Tech tracking
tech-stack:
  added:
    - leo-profanity 1.9.0 (npm, client — installed but profanity filtered server-side in C#)
    - "@vite-pwa/sveltekit 1.1.0 (npm dev — PWA manifest + workbox service worker)"
  patterns:
    - Chat goes through server (POST /chat/{channelId}/send) before AppSync publish — ensures profanity filtering
    - ChatPanel subscribes to /game/{channelId}/chat AppSync channel via subscribeToChatChannel
    - PWA devOptions.enabled=false to avoid SW cache conflicts in Docker dev environment
    - Report button on other users' messages only; immutable Set for reported state tracking

key-files:
  created:
    - apps/client/src/lib/components/ChatPanel.svelte
    - apps/server/Services/ChatFilter.cs
    - apps/server/Endpoints/ChatEndpoints.cs
    - apps/server/Data/PlayerReport.cs
    - apps/client/static/icons/icon-192.png
    - apps/client/static/icons/icon-512.png
  modified:
    - apps/client/src/lib/appsync.ts (added subscribeToChatChannel + ChatMessage interface)
    - apps/client/src/routes/game/[id]/+page.svelte (ChatPanel wired as collapsible side panel)
    - apps/client/src/routes/table/[id]/+page.svelte (ChatPanel replaces placeholder)
    - apps/client/src/routes/+layout.svelte (pwaInfo web manifest link injection)
    - apps/client/vite.config.ts (SvelteKitPWA plugin added)
    - apps/client/svelte.config.js (serviceWorker.register: false)
    - apps/server/Data/GameDbContext.cs (PlayerReports DbSet + entity config)
    - apps/server/Program.cs (ChatFilter singleton, MapChatEndpoints)
    - apps/client/package.json (leo-profanity, @vite-pwa/sveltekit)

key-decisions:
  - "Chat filtered server-side in C# (not client-side leo-profanity) — server controls what gets published to AppSync, ensures integrity"
  - "Chat is ephemeral — no DB persistence, AppSync Events only; PlayerReport entity logs reports for moderation, not messages"
  - "POST /chat/{channelId}/send rate-limited to 500 chars; report rate-limited to 10/hour per user via DB count"
  - "PWA devOptions.enabled=false — service worker disabled in dev to prevent caching issues in Docker"
  - "ChatPanel in game page: collapsible side panel (280px wide) with toggle button, default visible"
  - "Placeholder PNG icons (192x192, 512x512) generated via Node.js Buffer/zlib — navy #1a1a2e solid color"

patterns-established:
  - "Chat channel IDs are sessionId (game) or tableId (waiting room) — same channelId used for /chat/{channelId}/send and subscribeToChatChannel"
  - "Report button shows only on messages from other users, tracks reported state via immutable Set replacement for Svelte reactivity"

requirements-completed: [SOCL-06, PLAT-02]

# Metrics
duration: 7min
completed: 2026-03-01
---

# Phase 03 Plan 06: Chat + PWA Summary

**Server-filtered real-time text chat via AppSync Events with ChatPanel component, player reporting with DB audit log, and PWA manifest + workbox service worker for home-screen install**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-01T21:00:42Z
- **Completed:** 2026-03-01T21:07:16Z
- **Tasks:** 2 of 3 complete (Task 3 is human-verify checkpoint)
- **Files modified:** 14

## Accomplishments
- Chat messages flow through C# ChatFilter (profanity + l33t-speak), then published to AppSync /game/{channelId}/chat channel for all subscribers
- ChatPanel component handles subscribe/unsubscribe lifecycle, own/other message alignment, report button with confirmation, Enter-to-send
- PlayerReport entity logged to DB on report (rate-limited 10/hour per user) for future moderation review
- PWA: SvelteKitPWA plugin adds manifest (name "BGA2 — Board Games Online", standalone display), workbox service worker auto-registers on install

## Task Commits

Each task was committed atomically:

1. **Task 1: In-game chat via AppSync Events with server-side word filter** - `d7a776f` (feat)
2. **Task 2: PWA setup with @vite-pwa/sveltekit** - `1685424` (feat)
3. **Task 3: Visual and functional verification** - awaiting human verification (checkpoint)

## Files Created/Modified
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/lib/components/ChatPanel.svelte` - Reusable chat panel: message list, report button, input bar
- `/var/home/emkayultra/code/personal/bga2/apps/server/Services/ChatFilter.cs` - Profanity filter with l33t-speak normalization (~40-word blocked list)
- `/var/home/emkayultra/code/personal/bga2/apps/server/Endpoints/ChatEndpoints.cs` - POST /chat/{id}/send and /report, AppSync publish, rate limiting
- `/var/home/emkayultra/code/personal/bga2/apps/server/Data/PlayerReport.cs` - PlayerReport entity (reporter, reported, channel, message, reason)
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/lib/appsync.ts` - Added subscribeToChatChannel + ChatMessage interface
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/routes/game/[id]/+page.svelte` - ChatPanel as collapsible right-side panel (280px)
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/routes/table/[id]/+page.svelte` - ChatPanel replaces chat placeholder (320px height)
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/routes/+layout.svelte` - pwaInfo web manifest link injection via svelte:head
- `/var/home/emkayultra/code/personal/bga2/apps/client/vite.config.ts` - SvelteKitPWA plugin with manifest + workbox config
- `/var/home/emkayultra/code/personal/bga2/apps/client/svelte.config.js` - serviceWorker.register: false (vite-pwa handles it)
- `/var/home/emkayultra/code/personal/bga2/apps/server/Data/GameDbContext.cs` - PlayerReports DbSet + entity config with indexes
- `/var/home/emkayultra/code/personal/bga2/apps/server/Program.cs` - ChatFilter singleton, MapChatEndpoints
- `/var/home/emkayultra/code/personal/bga2/apps/client/static/icons/icon-192.png` - Placeholder 192x192 PWA icon
- `/var/home/emkayultra/code/personal/bga2/apps/client/static/icons/icon-512.png` - Placeholder 512x512 PWA icon

## Decisions Made
- Chat filtered server-side in C# before AppSync publish — server controls what gets broadcast, client cannot bypass filter
- Chat is ephemeral (not persisted) — AppSync Events only; PlayerReport table for moderation audit log only
- POST /chat/{channelId}/send publishes to `/game/{channelId}/chat` AppSync channel (consistent with game state channel pattern)
- PWA devOptions.enabled=false in dev — avoids service worker caching conflicts when running under Docker with HMR
- Placeholder PNG icons generated via Node.js Buffer/zlib — solid navy #1a1a2e squares, to be replaced with real art in Phase 4

## Deviations from Plan

None - plan executed exactly as written. leo-profanity was installed as a client dependency per the plan spec, though the actual profanity filtering is done server-side in C# (as specified). The package remains available for potential future client-side use.

## Issues Encountered

None - C# server compiled cleanly, TypeScript check passed with zero errors on both tasks.

## User Setup Required

None - no external service configuration required for this plan. AppSync credentials are already configured from Plan 03-04.

## Next Phase Readiness

- Chat system is functional — Task 3 checkpoint requires human verification of real-time chat, profanity filter, report button, and PWA install
- PWA enables Phase 4 Web Push notifications (service worker is registered, home screen install prompt will appear in Chrome)
- iOS Web Push in PWA context requires home screen install and background sync validation on real device before Phase 4 commit

---
*Phase: 03-multiplayer-social*
*Completed: 2026-03-01*
