# Phase 4: Async + Notifications - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Async turn-based game mode with configurable timers, multi-channel notifications (email, Web Push, in-app), and player notification preferences. Players can start a game and take turns over days or weeks. The platform supports the dominant adult play pattern (async) with notifications that keep games moving without causing fatigue.

</domain>

<decisions>
## Implementation Decisions

### Turn timers & deadlines
- 3 timer presets: Fast (12h/turn), Normal (24h/turn), Slow (72h/turn)
- Timeout behavior: skip + stack penalty with configurable threshold (host sets at table creation, default 3 consecutive skips = forfeit, setting 0 disables auto-forfeit)
- Mutual pause: either player can request a pause, other player must accept; timer freezes until resumed
- Timer display: compact countdown next to current player's name in the existing toolbar; color shifts green → yellow → red as deadline approaches

### Notification channels & triggers
- All three channels supported: email, Web Push, in-app badge/indicator
- Single configurable reminder before deadline (player chooses how far in advance)
- "Your turn" notification fires immediately when opponent submits their move
- Transactional email via Resend

### Player preferences UI
- Notification preferences added as a new section on the existing /settings page (alongside avatar, username, privacy)
- Global preferences only — no per-game overrides in v1
- No quiet hours in v1 — players use device Do Not Disturb
- Push notification opt-in: auto-prompt the browser permission dialog on first async game start

### Async lobby experience
- Unified lobby with filter/toggle for "Real-time" vs "Async" — icon or badge distinguishes game type
- Table creation: explicit "Game mode: Real-time / Async" toggle; selecting Async reveals timer preset picker (Fast/Normal/Slow) and skip threshold setting
- Quick Play stays real-time only — async games are intentional (create a table, set timer)
- Dedicated "My Games" section showing all active async games with turn status, timer remaining, and opponent

### Claude's Discretion
- Background job framework choice (Quartz vs Hangfire vs IHostedService)
- Email template design and content
- Web Push VAPID key management approach
- "My Games" section placement (lobby page vs separate /games route)
- In-app badge placement and design
- Pause request/accept UI flow details

</decisions>

<specifics>
## Specific Ideas

- Timer presets mirror BGA's async model — familiar to board gamers
- Skip threshold is configurable per-table so casual friend groups can be lenient while competitive games stay strict
- "My Games" serves as the async player's hub — shows at a glance which games need attention

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- AppSyncPublisher: already publishes game state after each move — can extend to publish deadline/timer info on same channel
- @vite-pwa/sveltekit: PWA foundation configured with Workbox, manifest, icons — ready for Web Push subscription
- /settings page: existing avatar + username + privacy controls — notification section slots in naturally
- SceneManager: tracks currentPlayerIndex, playerNames, connectionState — timer state can layer alongside
- LobbyService.CreateTable: entry point for table creation — add mode/timer/skip fields

### Established Patterns
- JSONB state in GameSession: game state stored as JSON in PostgreSQL — timer/deadline fields fit this pattern
- Optimistic locking via RowVersion (xmin): prevents concurrent move collisions — same pattern protects timer state
- Idempotent moves via PlayedMoveIds: deduplication already handles replays — timeout actions need similar idempotency
- Better Auth JWT: all endpoints use RequireAuthorization — notification endpoints follow same pattern
- AppSync Events channels: /game/{sessionId}/state and /game/{channelId}/chat — timer events use same infrastructure

### Integration Points
- GameService.ValidateAndApplyMove(): after persisting move, calculate next deadline and trigger "your turn" notification
- GameService.CreateGame(): accept timer mode and skip threshold, store in state JSON
- LobbyService.CreateTable(): add isAsync, timerMode, skipThreshold fields to GameTable entity
- /settings page: add notification preferences section with email/push toggles and reminder timing
- Lobby /+page.svelte: add async/real-time filter toggle and "My Games" section

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-async-notifications*
*Context gathered: 2026-03-02*
