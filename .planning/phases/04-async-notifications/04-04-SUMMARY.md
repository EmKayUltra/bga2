---
phase: 04-async-notifications
plan: "04"
subsystem: ui
tags: [settings, lobby, timer, pause, badge, push-prompt, async, sveltekit, csharp]

# Dependency graph
requires:
  - phase: 04-async-notifications/04-01
    provides: GameTable async fields, Hangfire, NotificationPreference entity, lobby async support
  - phase: 04-async-notifications/04-02
    provides: NotificationService, DeadlineService, GameService notification triggers
  - phase: 04-async-notifications/04-03
    provides: pushSubscription.ts helpers, notificationApi.ts client, NotificationEndpoints.cs

provides:
  - Notification preferences section on settings page (email/push toggles, reminder timing dropdown)
  - My Games endpoint returning active async games with turn status
  - Lobby async/RT filter toggle and My Games section with turn badges
  - Game page timer countdown with green/yellow/red color shifting
  - Pause request/accept/decline/resume flow for async games
  - In-app notification badge on nav layout
  - Push permission auto-prompt on first async game

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "My Games endpoint joins GameTable + TablePlayers + session state to derive isMyTurn from currentPlayerIndex"
    - "Timer countdown uses setInterval(1s) with onDestroy cleanup — color shifts at 50%/25% thresholds"
    - "Pause flow: 4 endpoints (request/accept/decline/resume) mutating GameTable.IsPaused and PauseRequestedByUserId"
    - "In-app badge polls getMyGames() every 60s, counts isMyTurn===true items"
    - "Push auto-prompt uses sessionStorage flag bga2-push-prompted to avoid re-prompting within a browser session"

key-files:
  created: []
  modified:
    - apps/client/src/routes/settings/+page.svelte
    - apps/client/src/routes/lobby/+page.svelte
    - apps/client/src/routes/game/[id]/+page.svelte
    - apps/client/src/routes/+layout.svelte
    - apps/client/src/lib/api/lobbyApi.ts
    - apps/server/Endpoints/LobbyEndpoints.cs
    - apps/server/Services/LobbyService.cs

key-decisions:
  - "My Games sorted: isMyTurn games first, then by deadline urgency — most actionable items surface to top"
  - "Timer color thresholds: green >50%, yellow 25-50%, red <25% with CSS pulsing animation"
  - "Pause is mutual: request->accept flow, either player can resume — no unilateral pause"
  - "Push auto-prompt gated by sessionStorage to avoid nagging — prompts once per browser session"

patterns-established:
  - "Async game lifecycle UI: create (lobby) -> play (timer + pause) -> manage (My Games + badge) -> configure (settings)"

requirements-completed: [NOTF-04, MULT-02]

# Metrics
duration: 18min
completed: 2026-03-02
---

# Phase 04 Plan 04: Async Game Mode UI Integration Summary

**Notification preferences on settings, lobby async filter + My Games, game page timer with color-shifting countdown, mutual pause flow, in-app badge, and push auto-prompt**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-02
- **Completed:** 2026-03-02
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 8

## Accomplishments

- Extended settings page with Notifications section: email toggle, push toggle (with permission flow and denied-state messaging), reminder timing dropdown (Off/1h/2h/4h/8h/12h). Preferences loaded via `getPreferences()` on mount and saved alongside profile.
- Added `GetMyGames` endpoint in LobbyEndpoints/LobbyService — returns active async tables where user is a player, with isMyTurn derived from session state currentPlayerIndex vs seat index. Limit 20, sorted by urgency.
- Added `getMyGames()` and `MyGameItem` interface to lobbyApi.ts client.
- Extended lobby page with filter bar (All / Real-time / Async) and My Games section above public tables — shows opponent names, timer mode badge, time remaining, Your Turn/Waiting/Paused badges. Polls every 30s.
- Added game page timer countdown with green/yellow/red color shifting at 50%/25% thresholds. Updates every second via setInterval with onDestroy cleanup. Red state has CSS pulsing animation.
- Implemented 4-endpoint pause flow: pause-request, pause-accept, pause-decline, resume — all with auth and player validation. UI shows contextual banners and buttons.
- Added in-app notification badge to +layout.svelte nav — polls getMyGames() every 60s, shows count of isMyTurn games as red badge.
- Added push permission auto-prompt on first async game mount — gated by sessionStorage `bga2-push-prompted` flag and iOS `isInstalledPWA()` check.

## Verification

- Phase 4 UAT: 10/10 tests passed (6 Puppeteer, 4 code-verified)
- Auth fixes applied during verification: removed hardcoded baseURL from better-auth config, TypeScript type cast fixes
- Known environment-only issues: Puppeteer Docker VITE_API_URL resolution (not a code bug — works in real browser)

## Task Commits

1. **Task 1: Notification preferences UI + My Games endpoint** — `6c2bd26` (feat)
2. **Task 2: Lobby filter, My Games section, timer, pause, badge, push prompt** — `047fd1e` (feat)
3. **Task 3: Human verification checkpoint** — UAT 10/10 pass (no separate commit)

**Verification fixes:**
- `cced0f5` — fix: TypeScript type casts in pushSubscription.ts and service-worker.ts
- `efdc4d1` — fix: remove hardcoded baseURL from better-auth config

## Files Modified

- `apps/client/src/routes/settings/+page.svelte` — Notifications section with email/push toggles and reminder dropdown
- `apps/client/src/routes/lobby/+page.svelte` — Async/RT filter toggle + My Games section with turn badges
- `apps/client/src/routes/game/[id]/+page.svelte` — Timer countdown with color shifting + pause request/accept UI
- `apps/client/src/routes/+layout.svelte` — In-app notification badge on nav
- `apps/client/src/lib/api/lobbyApi.ts` — getMyGames() + MyGameItem interface + pause/resume API functions
- `apps/server/Endpoints/LobbyEndpoints.cs` — My Games + pause-request/accept/decline/resume + by-session endpoints
- `apps/server/Services/LobbyService.cs` — GetMyGames, RequestPause, AcceptPause, DeclinePause, ResumeGame methods

## Decisions Made

- My Games sorted by urgency: isMyTurn first, then nearest deadline — most actionable items always at top
- Timer color uses CSS custom properties for green (#22c55e) / yellow (#eab308) / red (#ef4444) with pulsing @keyframes for final 25%
- Pause is mutual consent: one player requests, the other accepts or declines; either can resume
- Push auto-prompt uses sessionStorage (not localStorage) to prompt once per browser session without persisting across sessions

## Deviations from Plan

None — plan executed as written.

## Issues Encountered

- Better Auth `baseURL: 'http://localhost:5173'` was hardcoded in auth.ts, causing 404 on all /api/auth/* endpoints inside Docker. Fixed by removing it — better-auth infers origin from the request.
- TypeScript strict mode flagged `applicationServerKey` as needing `BufferSource` cast and notification options needing `NotificationOptions` cast. Fixed with explicit type assertions.

---
*Phase: 04-async-notifications*
*Completed: 2026-03-02*
