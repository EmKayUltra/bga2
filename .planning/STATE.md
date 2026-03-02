---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-02T04:20:00.000Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 22
  completed_plans: 21
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Any board game can be faithfully digitized and played online — the engine handles the hard parts so creators focus on what makes their game unique.
**Current focus:** Phase 4 IN PROGRESS — Plan 04-03 complete (Web Push client infrastructure)

## Current Position

Phase: 4 of 6 — IN PROGRESS (Async + Notifications)
Plans: 3/4 complete (04-01: async foundation, 04-02: deadline/email service, 04-03: Web Push client infrastructure)
Status: Phase 4 in progress. Plans 04-01, 04-02, 04-03 executed.
Last activity: 2026-03-02 — Completed 04-03: injectManifest service worker, push subscription helper, notificationApi client, NotificationEndpoints server

Progress: [█████░░░░░] 63% (3.75 of 6 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: ~7 min
- Total execution time: ~80 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-engine-foundation | 7/7 | ~45 min | 6.4 min |
| 02-azul-first-playable | 4/4 | ~35 min | 8.75 min |
| 03-multiplayer-social | 6/6 | ~62 min | 10.3 min |
| Phase 03-multiplayer-social P07 | 6 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Stack confirmed — SvelteKit 2 + Svelte 5, PixiJS 8 behind IRenderer, C# Lambda .NET 8 Native AOT, PostgreSQL (changed from DynamoDB), AWS CDK
- [Phase 1]: Docker Compose with 4 services (SvelteKit, C# API, PostgreSQL, LocalStack), NX monorepo (apps/ + libs/), watch mode
- [Phase 1]: Database changed from DynamoDB to PostgreSQL — relational model fits naturally, game state as JSONB
- [Phase 1]: C# API targets Lambda (not persistent server) — stateless per-request, Docker container for dev only
- [Phase 1]: Real-time relay layer undecided — AppSync Events vs Cloudflare Workers vs API Gateway WebSockets (research before Phase 3)
- [Phase 1]: Renderer abstraction proven — AzulScene has zero PixiJS imports, swap test passes with StubRenderer
- [Phase 2-01]: Azul hooks: first-player token holder must be saved before floor-clearing step or detection is lost
- [Phase 2-01]: Azul hooks: center-pick leftover tiles must be put back into center.pieces after zone clear
- [Phase 2-01]: Azul hooks: vitest.config.ts + project.json configFile required for NX @nx/vite:test executor to find test files
- [Phase 02]: BuildHookContextScript returns JS string not JsValue — context must be in same Jint engine scope as hook functions
- [Phase 02]: TypeScript param annotation stripping restricted to PascalCase types + known primitives to avoid mangling object literals
- [Phase 02]: tile defId uses plain color name (blue not tile-blue) to match WALL_PATTERN constants in hooks.ts
- [Phase 02]: JSON.stringify inside Jint engine for valid moves — JsValue.ToString() returns JS .toString() not JSON
- [Phase 02-azul-first-playable]: createGame signature updated to (gameId, playerNames[]) — server POST /games body includes playerNames; CreateGameResponse changed to {sessionId, gameId, version}
- [Phase 02-azul-first-playable]: localStorage key bga2-recent-games holds RecentGame array (prepended, max 20); game list page fetches status in parallel via Promise.all
- [Phase 02-03]: SceneManagerState uses currentPlayerIndex/playerNames/playerScores arrays (not single playerId) — derived from server GameState
- [Phase 02-03]: AzulScene two-step interaction: onSourceClick(zoneId, color) → selectSource with blue glow + green destination highlights, onDestinationClick(zoneId) → submit move
- [Phase 02-03]: Server zone IDs are 1-indexed: player-{n}-pattern-line-{row} where n = playerIndex + 1
- [Phase 02-03]: Score summary reads player.data.wallScore/rowBonus/colBonus/colorBonus/floorPenalty from server hooks — display only, no client-side scoring
- [Quick-1]: DevEndpoints uses JsonNode.Parse for state mutation — avoids full deserialization into typed models for ad-hoc dev mutations
- [Quick-2]: Client VITE_APPSYNC_HTTP_ENDPOINT defaults to http://localhost:4006 (browser) and server AppSync__HttpEndpoint defaults to http://appsync-mock:4006 (Docker network) — separate env var APPSYNC_HTTP_ENDPOINT_SERVER for server-side AWS override
- [Quick-2]: package-lock.json committed alongside package.json so npm ci works inside Docker build (reproducible installs)
- [Phase 03-01]: better-auth 1.5.0 type declarations have internal errors — added skipLibCheck: true to client tsconfig.json to allow builds
- [Phase 03-01]: hooks.server.ts uses relative import (./lib/auth.js) instead of $lib alias because tsconfig.base.json paths override .svelte-kit/tsconfig.json paths
- [Phase 03-01]: Better Auth CLI: use @better-auth/cli@1.5.0-beta.13 with --yes --config flags; @latest (1.4.x) is incompatible with better-auth 1.5.0
- [Phase 03-01]: JWT Bearer uses Authority=client:5173/api/auth, RequireHttpsMetadata=false, ValidateIssuer=false, ValidateAudience=false in dev
- [Phase 03-02]: SHA-256 for table passwords (not BCrypt) — table join guards are low-stakes, BCrypt overkill
- [Phase 03-02]: JWT token cached 30s in lobbyApi.ts to avoid per-poll /api/auth/token requests
- [Phase 03-02]: idempotent JoinTable — already-joined user returns success (prevents duplicate constraint on TableId+UserId index)
- [Phase 03-03]: UserProfile stored as extension entity (not Better Auth user table) — avatar/isPublic/usernameChangedAt stored in C# entity; Better Auth owns user/username/id
- [Phase 03-03]: Username updates use raw SQL against Better Auth's user table directly (no Better Auth admin API for username changes)
- [Phase 03-03]: Match results currently recorded with game-scoped player IDs ("player-0" etc.) — real userId mapping needs lobby plan integration
- [Phase 03-03]: Username cooldown → 429 with retryAfterDays in JSON body; username taken → 409 Conflict
- [Phase 03]: AppSync publish is best-effort: errors caught/logged, REST response already confirmed move
- [Phase 03]: 409 Conflict for DbUpdateConcurrencyException (vs 400) so client can distinguish race conditions from invalid moves
- [Phase 03]: localPlayerIndex=null is hot-seat mode — all players local, no move control guards applied
- [Phase 03-05]: In-memory ConcurrentDictionary for online presence (60s threshold) — production would use Redis/DynamoDB TTL
- [Phase 03-05]: HMAC invite token splits from the right (lastIndexOf) to handle ISO 8601 expiry dates that contain colons
- [Phase 03-05]: Post-game friend prompt matches by player.name — game state in hot-seat mode does not carry Better Auth userIds
- [Phase 03-multiplayer-social]: Chat filtered server-side in C# before AppSync publish — server controls broadcast, client cannot bypass filter
- [Phase 03-multiplayer-social]: PWA devOptions.enabled=false in dev — avoids service worker caching conflicts in Docker with HMR
- [Phase 03-06]: Chat is ephemeral — AppSync Events only, not persisted; PlayerReport entity logs reports for moderation audit only
- [Phase 03-06]: EnsureCreated() is all-or-nothing — explicit CREATE TABLE IF NOT EXISTS needed for Phase 3 entities when DB already existed from Phase 2
- [Phase 03-06]: onDestroy browser guard required for document.removeEventListener — onDestroy runs during SSR in SvelteKit
- [Phase 03-06]: PWA devOptions.enabled=false in dev — avoids service worker caching conflicts in Docker with HMR
- [Phase 03-multiplayer-social]: userId stored on player objects alongside id (not replacing it) — id stays as game-scoped 'player-{i}' for hooks.ts/FSM compatibility; ExtractPlayerResults uses TryGetProperty userId with ValueKind == String check to handle JSON null vs absent property
- [Phase 04-01]: Hangfire.PostgreSql chosen over IHostedService — built-in /hangfire dashboard, job retry, persistent storage across restarts
- [Phase 04-01]: CreateTable returns tuple (GameTable?, string?) for service-layer error propagation without exception overhead
- [Phase 04-01]: NotificationLog unique index on (SessionId, TurnVersion, UserId, Channel) ensures deadline checker idempotency
- [Phase 04-01]: TurnDeadline calculated at StartGame (not table creation) — deadline starts when game begins, not when table is created
- [Phase 04-01]: Quick Play stays real-time only — async games require explicit table creation with timer selection (locked decision)
- [Phase 04-03]: injectManifest strategy replaces generateSW so service worker can include push/notificationclick handlers
- [Phase 04-03]: workbox packages added as explicit devDeps even though @vite-pwa/sveltekit has transitive deps — direct TS imports require them in scope
- [Phase 04-03]: GetPreferences returns inline defaults (not DB row) for new users — avoids forced insert on first GET
- [Phase 04-03]: notification tag bga2-turn with renotify=true collapses duplicate turn notifications, still vibrates/sounds

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 3]: Real-time relay layer undecided — AppSync Events vs Cloudflare Workers vs API Gateway WebSockets. Also: validate C# Lambda Native AOT with Jint (JS hook execution cold-start). Research before Phase 3 planning.
- [Pre-Phase 4]: iOS Web Push in PWA context requires home screen install and has background sync limits — validate on real device before committing Phase 4 implementation approach
- [Pre-Phase 5]: LLM hook generation accuracy is MEDIUM confidence — run a pilot with Azul hooks before building the full toolkit pipeline

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Developer menu for real-time game state manipulation (trigger round end, game end) | 2026-03-02 | 99e32ef | [1-developer-menu-for-real-time-game-state-](./quick/1-developer-menu-for-real-time-game-state-/) |
| 2 | AppSync Events local mock server — Docker Compose drop-in, zero .env required | 2026-03-02 | fcefaca | [2-appsync-events-local-mock-server-drop-in](./quick/2-appsync-events-local-mock-server-drop-in/) |

## Phase 1 Accepted Gaps (deferred to Phase 2)

- FSM Stage states: typed in StageConfig but not wired into XState machine — Phase 2 will wire when Azul needs stages
- Move validation: hooks return [] so server accepts all moves — Phase 2 implements real Azul hook logic
- Viewport/touch: code exists, needs human verification on real devices

## Phase 2 Status — COMPLETE

- Plan 01 (hooks.ts): COMPLETE — 32 tests passing, tsc clean
- Plan 02 (server integration): COMPLETE — CreateGame with proper state, HookExecutor ctx.players, onRoundEnd auto-trigger, 84+ valid moves
- Plan 03 (client scene): COMPLETE — SceneManager multi-player state, AzulScene 2-4 player boards, turn banner, score summary overlay
- Plan 04 (game creation routes): COMPLETE — landing page, game list, createGame API wired (executed out-of-order before 02-03)
- Verification: Puppeteer 4/4 moves pass. Bug fixes: TS stripper SCREAMING_SNAKE, white color, z-order animation (bringToFront), floor slot visibility (slotFill/slotStroke contrast)
- Non-blocking warnings carried: PixiJS `color -7306` on re-render, FSM `SUBMIT_MOVE to stopped actor`

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 04-03-PLAN.md — injectManifest service worker with push/notificationclick handlers, pushSubscription.ts helper, notificationApi.ts client, NotificationEndpoints server
Resume file: none — 04-03 complete, ready for 04-04 (notification settings UI)
