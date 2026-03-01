# Project Research Summary

**Project:** BGA2 — Digital Board Game Platform (BGA Competitor)
**Domain:** Multiplayer online board game platform with AI-powered game creation
**Researched:** 2026-02-28
**Confidence:** MEDIUM

## Executive Summary

BGA2 is a full-stack serverless multiplayer board game platform targeting the same market as Board Game Arena, differentiated by two pillars: a modern mobile-first engine with a clean renderer abstraction, and an AI-powered game creation toolkit that dramatically reduces the time to digitize a physical game. Research confirms that the recommended approach is a SvelteKit PWA frontend rendering via PixiJS (behind a swappable `IRenderer` interface), a C# Lambda backend handling all authoritative game logic, AWS AppSync Events for real-time pub/sub, and DynamoDB as the persistence layer. This stack is well-documented, cost-efficient at early scale, and avoids the known architectural traps — most critically, it keeps game logic on the server where cheating cannot occur and the renderer decoupled from game rules so future renderer swaps are non-breaking.

The recommended approach centers on a "games as data + script hooks" model borrowed from validated precedents (boardgame.io, BGA's state machine pattern) and extended with an LLM pipeline that ingests physical rulebooks and produces deployable game packages. The engine itself uses a hierarchical finite state machine (Game → Phase → Turn → Stage) with parallel regions for simultaneous player actions. The build order is strictly dependency-driven: engine primitives and the `IRenderer` interface must land first, Azul is built in lock-step as the engine's integration test, multiplayer infrastructure layers on top, and the AI creation toolkit is built in parallel once the game package format is stable.

The dominant risks are: over-engineering the engine before proving it with a real game (resist the urge to build hypothetical primitives), state serialization problems that surface only under concurrent load (design DynamoDB conditional writes and schema versioning from day one), and mobile UX failures baked into the game layout at the wrong abstraction level (zoom and touch targets are engine-level constraints, not per-game decisions). Lambda cold starts are a real concern for synchronous play and must be addressed with SnapStart from the first infrastructure deployment. AI-generated game rules require a mandatory human review gate — LLMs confidently produce plausible but wrong edge-case rule implementations, especially when tests are also AI-generated.

---

## Key Findings

### Recommended Stack

SvelteKit 2 + Svelte 5 is the clear frontend choice: compiler-based reactivity with no virtual DOM overhead (47KB bundle vs React's 156KB), first-class PWA support via `@vite-pwa/sveltekit`, and `$effect` runes that map cleanly to game loop patterns. For rendering, PixiJS 8.16+ provides WebGL-primary with automatic Canvas 2D fallback — the abstraction layer sits at the `IRenderer` TypeScript interface boundary, never at the PixiJS API itself. The backend is C# Lambda on .NET 8 with Native AOT (940ms cold start vs 6,680ms interpreted; .NET 10 has a known startup regression and should be avoided for now). AWS AppSync Events replaces API Gateway WebSocket for real-time pub/sub: 3x cheaper, no manual connection-ID fan-out code, and native channel namespace support that maps directly to game rooms. DynamoDB holds all game state with single-table design and mandatory conditional writes to prevent concurrent update corruption.

**Core technologies:**
- **SvelteKit 2 / Svelte 5:** Frontend framework + PWA shell — smallest bundle, compiler reactivity, best fit for canvas-heavy app where most UI is PixiJS
- **PixiJS 8.16+:** 2D WebGL renderer — GPU-accelerated, 100K+ sprites at 60fps, Canvas 2D fallback, behind `IRenderer` interface
- **AWS AppSync Events:** Real-time WebSocket pub/sub — $0.08/M connection-minutes, native fan-out, maps directly to game rooms; eliminates manual connection tracking
- **AWS Lambda / .NET 8 Native AOT:** Server-authoritative game logic — 940ms cold start, 52% less memory vs JIT, runs all rule validation
- **Amazon DynamoDB:** Game state, sessions, event log — single-table design, conditional writes for optimistic locking, 400KB item limit must be respected
- **Amazon S3 + CloudFront:** Game packages (JSON + compiled hooks) and static assets — CDN-delivered PWA shell, versioned game bundles per game/version prefix
- **AWS CDK (C#):** Infrastructure as code — keeps the entire stack in one language

**Critical version note:** Do not use .NET 10 on Lambda. Use .NET 8 Native AOT. PixiJS must be 8.x (v7 has a different renderer model). SvelteKit 2 requires Svelte 5 — do not mix with Svelte 4.

**Definitively ruled out:** React (bundle overhead, no benefit for canvas-heavy app), Blazor WASM (every canvas draw call crosses WASM-JS boundary), Godot WASM as renderer (C# web export is draft-only as of Feb 2026, 72MB package), SignalR on Lambda (architecturally incompatible), API Gateway WebSocket (manual connection fan-out, 3x more expensive), client-side prediction (turn-based games don't need it).

### Expected Features

The platform's core value proposition — server-enforced rules — is table stakes that must not be compromised. BGA is the only competitor offering rule enforcement + async + large library + mobile, and their mobile experience is widely criticized as poor. That gap is the primary competitive opportunity.

**Must have (table stakes for v1):**
- **Server-authoritative rule enforcement** — the product's raison d'etre; client sends intent, server validates and applies
- **Legal move highlighting** — players must see what they can do; required for Azul's tile selection mechanic
- **Async play with email notifications** — dominant play mode for adult players; requires turn timer system + timeout handling
- **Real-time (WebSocket) play** — required for completeness; same state model as async, different notification path
- **Game log / move history** — essential for async players catching up; enables dispute resolution
- **Player profiles, match history, friend system** — foundational social layer; ELO requires these
- **Private + public table creation** — invite-only games for friend groups; open tables for matchmaking
- **PWA installability + in-game zoom/pan** — mobile parity; zoom is an engine-level constraint, not per-game
- **Azul fully implemented end-to-end** — proves the engine; first product to ship

**Should have (competitive differentiators, v1.x):**
- **ELO per-game rating** — drives engagement; add after match volume justifies it (~50+ games per player)
- **Spectator mode + game replay with scrubber** — BGA's replay is poor; this is a genuine UX gap to win on
- **Web push notifications** — layer on after email is stable; iOS requires PWA installed to home screen
- **Second game on engine** — proves genre-agnosticism of engine; validates AI creation workflow internally
- **AI game creation tool (internal use)** — use to build second game faster; validates pipeline before external release

**Defer (v2+):**
- AI opponents — high demand but per-game ML complexity is enormous; poisons async-only positioning
- Community game submissions — QA burden, licensing; team-only library validates quality model first
- Tournaments — requires ELO, reputation gating, bracket management
- Native mobile apps — PWA-first is correct; wrap in PWABuilder or Capacitor later if needed
- Voice/video chat — players use Discord; add complexity without meaningful retention improvement

**Anti-features to explicitly reject:** Full physics sandbox (eliminates rule-enforcement value prop), reputation thumbs (harassment vector; use objective metrics), global chat (moderation nightmare at scale).

### Architecture Approach

The architecture is a serverless event-driven system with four clean boundaries: client game logic talks only to the `IRenderer` interface (never the renderer directly), the client submits commands to the server via HTTP/WebSocket (never state), the Game Service Lambda loads game packages dynamically from S3 (engine is host, game is plugin), and the AI creation tool communicates with the runtime only via the versioned game package schema (JSON + compiled hooks). This prevents the two most costly long-term mistakes: game logic coupled to the renderer (makes renderer swaps impossible) and AI creation tool coupled to engine internals (makes both unmaintainable).

**Major components:**
1. **Game Engine (shared, pure logic)** — FSM runtime, rules runner, primitive types (Zone, Piece, Deck, Player); runs in Lambda for validation and could run in browser for legal move hints; no renderer imports ever
2. **IRenderer Interface + PixiJS Adapter** — TypeScript interface boundary; PixiJS is the first implementation; Canvas 2D and Godot WASM adapters can be added later without touching game code
3. **Game Service Lambda (C#)** — authoritative move validation, state machine execution, DynamoDB writes with conditional locking, AppSync Events publication
4. **Game Package (S3 versioned bundle)** — `game.json` (board layout, zones, piece types, FSM definition) + `hooks.js` (compiled hook functions: setup, validateMove, onMoveApplied, onTurnEnd, endCondition)
5. **AppSync Events / Broadcaster** — channel per game session (`games/{sessionId}`); publishes state deltas; all subscribers receive updates without manual fan-out
6. **Notification Service** — AppSync Events push for connected players, Web Push for offline PWA users, SES for email; EventBridge-triggered on game state change
7. **Lobby / Match Service** — room lifecycle, matchmaking, async game state model (status, turnDeadline, currentPlayerId)
8. **AI Creation Tool (local-first C#)** — ingestion → spec generation → code generation → hot-reload test → package deploy pipeline; runs on developer machine, not in production path
9. **Player UI Shell (SvelteKit)** — lobby, profiles, match history, subscription management; talks to REST API
10. **CDN Layer (CloudFront + S3)** — PWA shell, game packages, sprite assets; aggressive cache headers for hashed assets

**Key patterns:**
- Hierarchical FSM with parallel regions for simultaneous player phases (avoid state explosion)
- Event log stores commands + metadata, not full state snapshots (respects DynamoDB 400KB limit)
- Client receives `validMoves[]` from server in state snapshot — legal move hints without re-implementing rules in browser
- DynamoDB GSI on `playerId + gameStatus` from day one — required for "find active games for player X" queries
- AppSync Events channel namespaces replace manual DynamoDB connection tables

### Critical Pitfalls

1. **Over-engineering the engine before proving it with Azul** — enforce the co-development rule: no engine primitive lands without Azul using it in the same phase. Azul is the engine's integration test suite. If the engine has 10 primitives but nothing renders, stop adding primitives.

2. **State serialization that doesn't survive real conditions** — include `{ version: N }` in game state schema from commit one. All DynamoDB writes use `ConditionExpression` with version number. Test deserialization of every schema version on every deploy. Monitor item size; split history into a separate item before hitting 200KB.

3. **Multiplayer edge cases invisible in solo testing** — move endpoints must be idempotent (client-generated UUID per move, server ignores duplicates). Reconnection always re-fetches server state. Sequence numbers in WebSocket messages enable gap detection. Implement these before multiplayer goes live, not after reports of "my move disappeared."

4. **Leaky renderer abstraction** — validate with two concrete implementations from the start (PixiJS + a stub/no-op renderer). No renderer-specific types cross the `IRenderer` boundary. Run an integration test that exercises the same game scene through both implementations. If a developer writes "just use the Canvas context directly here for performance," that is the leak starting.

5. **Lambda cold starts degrading synchronous play** — enable Lambda SnapStart for all game-facing functions from the first infrastructure deployment. Provision at least 1 Provisioned Concurrency instance for the WebSocket authorizer Lambda. Measure p99 cold start latency as an acceptance criterion in staging. The client must show a visible "Connecting..." state so the blank period is not mysterious.

6. **AI-generated rules with silent misimplementations** — the AI pipeline requires a mandatory human review gate before any generated game is published. Golden edge-case test suites (deck exhaustion, tiebreakers, last-round triggers) must be authored by humans independently of the AI-generated output. Never let AI generate both rules and tests in the same session.

7. **State machine complexity explosion** — model simultaneous player phases using parallel statechart regions, not enumerated state combinations. A "pending players" set transitions the parent state when the set empties. A flat FSM with per-player states grows exponentially.

---

## Implications for Roadmap

Architecture research defines a mandatory dependency-driven build order. The suggested phases below follow those dependencies and incorporate pitfall prevention as first-class acceptance criteria.

### Phase 1: Engine Foundation

**Rationale:** Everything else depends on this. The `IRenderer` interface, FSM runtime, game hook contract, and primitive types (Zone, Piece, Board, GameState) must exist before a single line of Azul or multiplayer code can be written. The renderer abstraction must be validated with two concrete implementations before Azul builds on top of it. Azul must co-evolve with the engine from the first commit — no engine primitive lands without Azul using it.

**Delivers:**
- Engine primitives (Zone, Piece, Deck, Player, GameState types)
- Hierarchical FSM runtime with parallel region support
- `IRenderer` TypeScript interface + PixiJS adapter (primary) + stub adapter (validation)
- Game hook contract (TypeScript interface + JSON schema for game.json)
- Local rendering of Azul board state (no networking yet — offline single-player proof)

**Addresses (from FEATURES.md):** Rule enforcement foundation, legal move highlighting architecture, zoom/pan as engine-level constraint (touch targets at 44px minimum enforced by engine)

**Avoids (from PITFALLS.md):**
- Over-engineering: Azul co-evolves; no hypothetical primitives
- Leaky renderer: two implementations validate the boundary before Azul builds on it
- State machine explosion: parallel statecharts modeled from the start
- Mobile UX failures: in-game zoom and touch targets are engine-level, not per-game

**Research flag:** Standard patterns — FSM, Strategy pattern, game hook model are well-documented in boardgame.io and BGA Studio references. No additional research needed.

---

### Phase 2: First Playable (Azul End-to-End)

**Rationale:** Proves the engine works for a real game before any multiplayer infrastructure is built. Establishes DynamoDB schemas, REST API move submission, server-authoritative validation in C# Lambda, and the game package format (game.json + hooks.js). This phase must complete with Azul fully playable (all rules enforced, all phases implemented) before declaring the engine done. State schema versioning and conditional writes must be established here because they cannot be retrofitted after multiplayer launches.

**Delivers:**
- Azul game package (game.json + hooks.ts covering all phases: drafting, tiling, scoring)
- Game Service Lambda (C#): load package from S3, validate move, apply hooks, write to DynamoDB
- DynamoDB schemas: GameState table with versioning + conditional writes; EventLog table
- REST API: POST /games/{id}/moves, GET /games/{id}/state
- SvelteKit game view: mounts PixiJS renderer, submits moves, displays legal move highlights
- Progressive asset loading (time-to-first-render under 2s on simulated 4G)
- Basic auth (Cognito or JWT)

**Addresses (from FEATURES.md):** Full Azul implementation as engine proof; legal move highlighting; game log (action history)

**Avoids (from PITFALLS.md):**
- State serialization: schema version field, conditional writes, item size monitoring from commit one
- Asset loading blocking game start: progressive loading with placeholder graphics
- Renderer abstraction: enforced by existing interface boundary from Phase 1

**Research flag:** Standard patterns — C# Lambda with DynamoDB, game package loading pattern. SnapStart configuration should be validated against current .NET 8 Native AOT compatibility.

---

### Phase 3: Multiplayer Infrastructure

**Rationale:** Can only be built after a working game exists to multiplex over it. AppSync Events channels replace API Gateway WebSocket, eliminating manual connection fan-out. The lobby service creates the room lifecycle. This phase is where multiplayer edge cases must be designed in proactively — idempotent moves, sequence numbers, reconnection re-fetch — not discovered from player reports.

**Delivers:**
- AppSync Events integration: channel per game session, state delta publication from Lambda
- WebSocket client in SvelteKit: subscribe to game channel, apply state updates with sequence tracking
- Lobby Service Lambda: create game, join game, open/invite-only tables, player matchmaking
- Player profiles: username, avatar, basic stats
- Friend system: add friends, invite to game, online presence
- Idempotent move protocol: client-generated move UUID, server deduplication
- Reconnection flow: client re-fetches server state on reconnect/tab-visible before enabling interaction
- Lambda SnapStart enabled, p99 cold start measured as acceptance criterion
- DynamoDB GSI: playerId + gameStatus for active game queries

**Addresses (from FEATURES.md):** Real-time play, lobby/table creation, friend system, private + public tables, player profiles

**Avoids (from PITFALLS.md):**
- Multiplayer edge cases: idempotent moves, sequence numbers, reconnection re-fetch designed in at the start
- Cold start degradation: SnapStart and Provisioned Concurrency for authorizer from first deployment
- Client-server desync: sequence numbers + gap detection + state re-fetch on rejected move

**Research flag:** AppSync Events C# Lambda integration (Amazon.Lambda.AppSyncEvents NuGet) is relatively new (April 2025 data source integrations). Verify handler patterns against current Powertools for AWS Lambda (.NET) docs before implementation.

---

### Phase 4: Async Play + Notifications

**Rationale:** The most important retention driver for adult players. Requires the multiplayer foundation from Phase 3. Turn timer enforcement needs EventBridge scheduled Lambdas. Notification preferences must ship with async play MVP — not as a polish item — to prevent notification fatigue causing early abandonment.

**Delivers:**
- Async game state model: status field, turnDeadline, currentPlayerId tracking
- Turn timer system: configurable presets (fast/normal/slow/unlimited), EventBridge deadline scheduler
- Email notifications via SES (default: daily digest, not per-action)
- Web Push notifications via service worker for PWA users
- Notification preferences: immediate vs daily digest, per-game unsubscribe
- Vacation/pause mode (deferred to v1.x if scope is tight, but design it in)
- In-app "your turns" badge across all active games
- Escalating deadline reminders (48h, 24h, final hour)

**Addresses (from FEATURES.md):** Async play, turn timer, notifications (email + push), PWA installability (service worker required)

**Avoids (from PITFALLS.md):**
- Notification fatigue: daily digest default, preference settings ship with async MVP
- iOS PWA push: test on real device with PWA installed to home screen (not Safari open tab)
- Async timeout firing while player is mid-action: heartbeat resets timer when game is open

**Research flag:** iOS Web Push behavior (iOS 16.4+ only, requires home screen install, background sync unreliable) should be validated against a real device test before committing to push as the primary async notification path.

---

### Phase 5: AI Game Creation Toolkit

**Rationale:** Can parallel-track with Phases 3-4 once the game package format is stable (end of Phase 2). The engine API is the contract the AI tool must target; it must not change out from under generated games. The toolkit is internal-only for v1: use it to build the second game, validate the workflow, measure time savings, then decide whether to expose it to creators.

**Delivers:**
- Ingestion module: PDF/text rulebook parser + vision LLM for card image descriptions
- Spec generator: LLM call (Claude / GPT-4o) producing human-reviewable game-spec.json
- Code generator: LLM call producing game.json + hooks.ts from spec + hook interface contract + examples
- Hot-reload test harness: file watcher, local engine, automated scenario runner
- Human review gate: structured review checklist, rules discrepancy report output, golden test suite for edge cases
- Packager + S3 deploy: TypeScript compile, bundle, upload to versioned S3 prefix
- Second game implemented using the pipeline (proves the workflow)

**Addresses (from FEATURES.md):** AI-powered game creation differentiator; hot-reload iteration; games as data + script hooks

**Avoids (from PITFALLS.md):**
- AI rule misimplementation: mandatory human review gate before publish; golden edge-case test suite authored independently of AI output; AI generates discrepancy report listing ambiguous rules
- Engine scope creep: creation tool consumes only the public game package schema, never engine internals

**Research flag:** LLM code generation for game hook functions is newer territory (Boardwalk arXiv paper from 2025 validates the approach but edge-case accuracy is MEDIUM confidence). Plan for human iteration on hooks to be significant — AI gets the structure right but edge cases require expert review.

---

### Phase 6: Player Platform + PWA Polish

**Rationale:** The infrastructure exists; this phase makes the platform feel like a product. Game library/discovery, ELO ratings, match history, subscription/payment, and PWA polish (service worker caching, install prompt UX). Can begin in parallel with Phase 5 for the UI components.

**Delivers:**
- Game library page: browse catalog, genre tags, popularity sort, recently played
- ELO per-game rating: computed from match history; displayed on profile
- Post-game statistics: win rates, scoring trends (requires match history volume)
- Subscription + payment integration (Stripe or similar)
- PWA manifest, service worker cache strategies, install prompt UX
- Spectator mode: read-only game state access, full replay with scrubber controls
- Game replay: step forward/back by move, jump to any turn, pause

**Addresses (from FEATURES.md):** Game library/discovery, ELO, match history, spectator + replay, PWA installability, subscription model

**Avoids (from PITFALLS.md):** None unique to this phase; pitfall prevention from earlier phases carries forward

**Research flag:** Stripe integration is standard. Spectator/replay architecture builds directly on the event log from Phase 2 — no additional research needed.

---

### Phase 7: Second Renderer (WebGL / Godot)

**Rationale:** This can only happen after the `IRenderer` interface has been stress-tested by two games. It validates that the abstraction is genuinely renderer-agnostic. The renderer swap applies to all games simultaneously — this is the "platform longevity" payoff of the Phase 1 abstraction work. Godot C# web export should only be reconsidered when it exits draft status (PR #106125 is unmerged as of Feb 2026).

**Delivers:**
- Upgraded WebGL renderer (PixiJS is already WebGL; this phase may be about Godot WASM when/if it becomes stable) or direct PixiJS WebGPU renderer (available in PixiJS 8.x)
- Renderer swap validation: same game packages run through new renderer, output compared to baseline
- Visual upgrades (particle effects, richer animations) benefiting all games simultaneously

**Research flag:** Godot C# web export status must be re-evaluated at the time this phase is planned. As of Feb 2026, it is a prototype and cannot be relied upon. If Godot is still not production-ready, this phase becomes a PixiJS WebGPU renderer upgrade instead.

---

### Phase Ordering Rationale

- **Phases 1-2 are strictly sequential:** The engine interface must exist before Azul can be built, and Azul must be playable before multiplayer infrastructure is layered on.
- **Phase 3 (Multiplayer) must precede Phase 4 (Async):** Async is built on the same game state model as synchronous play; the WebSocket foundation enables the notification delivery path.
- **Phase 5 (AI Toolkit) can parallel-track starting from Phase 3:** The game package format is stable after Phase 2. The toolkit does not depend on multiplayer infrastructure.
- **Phase 6 (Player Platform) can begin partially in Phase 3:** Profile and lobby UI can be built as Phase 3 delivers the underlying services. ELO and replay require data volume from later phases.
- **Phase 7 (Renderer Upgrade) is last by design:** It proves the abstraction from Phase 1 but requires two shipped games to be a meaningful test.

The build order is driven by a clear rule: each phase must leave the system in a deployable, demonstrable state. No phase should be "invisible infrastructure" that doesn't result in something a player or creator can interact with.

### Research Flags

**Needs deeper research before planning:**
- **Phase 3 (AppSync Events C# integration):** The `Amazon.Lambda.AppSyncEvents` NuGet + Powertools integration is relatively new (April 2025). Verify handler patterns and channel management against current docs before writing technical tasks.
- **Phase 4 (iOS Web Push in PWA context):** iOS 16.4+ Web Push behavior (home screen install required, background sync unreliable, 7-day IndexedDB eviction) must be validated on real devices before committing to implementation approach.
- **Phase 5 (LLM hook generation quality):** Evaluate current LLM accuracy on board game rule edge cases with a small pilot (run one game's hooks through the pipeline before building the full toolkit). Hook accuracy will determine how much human iteration budget to allocate.

**Standard patterns (skip research-phase):**
- **Phase 1 (Engine Foundation):** FSM patterns, Strategy pattern for renderer abstraction, game hook model — well-documented in boardgame.io, BGA Studio, and Game Programming Patterns.
- **Phase 2 (Azul + DynamoDB + Lambda):** C# Lambda, DynamoDB single-table design, conditional writes — all covered by official AWS docs and the DynamoDB board game tutorial.
- **Phase 6 (Player Platform / PWA):** SvelteKit PWA, ELO calculation, Stripe integration — standard documented patterns.
- **Phase 7 (Renderer Upgrade):** Godot status must be re-evaluated, but PixiJS WebGPU renderer is documented in PixiJS 8.x release notes.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core choices (SvelteKit, PixiJS, Lambda .NET 8, DynamoDB) verified via official docs and multiple sources. AppSync Events C# integration is MEDIUM — NuGet package exists, Powertools support confirmed, but specific handler patterns are new (April 2025) and need hands-on validation. Svelte 5 bundle size comparison is MEDIUM (community benchmarks, not official). |
| Features | MEDIUM-HIGH | Competitor feature set well-documented from official BGA docs and community sources. Player preference data from Stonemaier survey is first-party but survey methodology not fully disclosed. Anti-features rationale is well-reasoned from competitor failure modes. |
| Architecture | MEDIUM | Patterns (FSM, server-authoritative, event log, renderer abstraction) are well-established and cross-validated against boardgame.io source, BGA Studio docs, and AWS Well-Architected games lens. BGA internals are inferred from public docs, not source. AppSync Events fan-out replacing API Gateway WebSocket is newer territory — pricing and architecture confirmed, operational behavior at scale is MEDIUM. |
| Pitfalls | MEDIUM | Critical pitfalls (engine over-engineering, state serialization, multiplayer edge cases, renderer leakage) are well-supported by multiple sources. AI rule misimplementation pitfall is supported by recent literature but is a newer domain. iOS PWA limitations are documented from multiple sources but behavior can change with iOS updates. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **AppSync Events at scale:** Pricing and architecture are documented. Behavior under sustained load (many concurrent game rooms, high message frequency) has limited public data. Plan to load-test AppSync Events pub/sub throughput before relying on it for synchronous game sessions.

- **LLM hook generation accuracy:** Boardwalk (arXiv 2025) validates LLM board game code generation but does not report per-edge-case accuracy rates. Run a pilot with Azul hooks before committing to the AI toolkit's human-review-gate design — the gate intensity depends on observed error rate.

- **Godot C# web export readiness:** PR #106125 is a draft as of Feb 2026 with no committed timeline. Phase 7 must re-evaluate this before planning. Do not plan around Godot for Phase 7 without checking current PR status.

- **DynamoDB item size for complex game states:** Azul state is small. The 400KB limit will likely not be hit for Azul but could be for games with larger state (many cards, long action logs). Design the split-storage pattern (current state in primary item, action log in separate items) before it's needed, not after hitting the limit in production.

- **Turn timer enforcement at scale:** EventBridge cron for deadline enforcement is correct for low volume. At higher game counts, consider Step Functions for per-game deadline orchestration. The threshold for switching is not researched — flag for re-evaluation when active game count exceeds ~1,000 simultaneous games.

---

## Sources

### Primary (HIGH confidence)
- AWS AppSync Events announcement + architecture: https://aws.amazon.com/blogs/mobile/announcing-aws-appsync-events-serverless-websocket-apis/
- AWS Powertools for Lambda (.NET) — AppSync Events: https://docs.aws.amazon.com/powertools/dotnet/core/event_handler/appsync_events/
- SignalR incompatibility with Lambda (official GitHub issue): https://github.com/dotnet/aspnetcore/issues/36575
- AWS Lambda cold starts and SnapStart: https://aws.amazon.com/blogs/compute/understanding-and-remediating-cold-starts-an-aws-lambda-perspective/
- AWS API Gateway WebSocket limits: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html
- DynamoDB 400KB limit (AWS official): https://dynobase.dev/dynamodb-use-cases/ + AWS DynamoDB docs
- boardgame.io framework architecture: https://boardgame.io/documentation/
- Game Programming Patterns — State pattern: https://gameprogrammingpatterns.com/state.html
- Gabriel Gambetta client-server architecture: https://www.gabrielgambetta.com/client-server-game-architecture.html
- AWS Well-Architected games lens — serverless backend: https://docs.aws.amazon.com/wellarchitected/latest/games-industry-lens/serverless-based-game-backend-architecture.html
- PixiJS v8.16.0 release + Canvas fallback: https://github.com/pixijs/pixijs/releases
- SvelteKit PWA (@vite-pwa/sveltekit): https://github.com/vite-pwa/sveltekit
- .NET 10 Lambda regression: https://github.com/dotnet/runtime/issues/120288

### Secondary (MEDIUM confidence)
- BGA Studio documentation (state machine, game structure): https://en.boardgamearena.com/doc/Studio
- BGA feature docs (async, ELO, undo, karma): https://en.boardgamearena.com/doc/
- AppSync Events data source integrations (April 2025): https://aws.amazon.com/about-aws/whats-new/2025/04/aws-appsync-events-data-source-integrations-channel-namespaces/
- Lambda Native AOT .NET performance: https://dev.to/whitewaw/net-nativeaot-on-aws-lambda-7x-faster-cold-starts-73-lower-costs-np3
- Godot C# web prototype (May 2025): https://godotengine.org/article/live-from-godotcon-boston-web-dotnet-prototype/
- Boardwalk LLM board game code generation (arXiv 2025): https://arxiv.org/html/2508.16447v1
- Stonemaier digital board game survey: https://stonemaiergames.com/5-surprises-and-insights-from-a-digital-board-game-survey/
- iOS PWA limitations guide: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- Statecharts.dev on state explosion: https://statecharts.dev/state-machine-state-explosion.html
- Renderer abstraction pattern references: https://logantharvell.github.io/rendering-abstraction-dev-diary-6/ + https://alextardif.com/RenderingAbstractionLayers.html

### Tertiary (LOW confidence)
- BGA player reviews / mobile UX criticism: BGG community threads — player experience anecdotes
- Svelte 5 bundle size vs React benchmark: https://dev.to/krish_kakadiya_5f0eaf6342/ — community benchmark, not Svelte official
- Async multiplayer design best practices: https://www.wayline.io/blog/asynchronous-multiplayer-reclaiming-time-mobile-gaming — single editorial source
- Platform comparison feature matrices: Hicreate Games, Meeple Mountain — editorial, not first-party

---

*Research completed: 2026-02-28*
*Ready for roadmap: yes*
