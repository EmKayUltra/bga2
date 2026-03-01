# Roadmap: BGA2

## Overview

BGA2 is built in six phases, each leaving the system in a demonstrable state. The engine and its renderer abstraction come first — nothing else can be built without them. Azul ships as the engine's integration test, proving end-to-end rule enforcement before any multiplayer infrastructure is layered on. Multiplayer and social features land together because friends, lobbies, and real-time play are a single coherent experience. Async play and the notification system form their own phase — they depend on multiplayer being stable and have their own complex timer/notification pipeline. The AI game creation toolkit runs as a focused capability that consumes the stable game package format established by Phase 2. Player platform polish (game library, spectator, replay, subscriptions) closes the loop in Phase 6.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Engine Foundation** - Game engine primitives, renderer abstraction, FSM runtime, game hook contract, and Dockerized dev environment — the shared foundation everything else builds on
- [ ] **Phase 2: Azul + First Playable** - Full Azul game implementation proving the engine end-to-end: server-authoritative rules, PostgreSQL persistence, REST API, and SvelteKit game view
- [ ] **Phase 3: Multiplayer + Social** - Real-time play via AppSync Events, lobby system, player profiles, friend system, and PWA installability
- [ ] **Phase 4: Async + Notifications** - Async turn-based game mode with configurable timers, email notifications, Web Push, and player notification preferences
- [ ] **Phase 5: AI Game Creation Toolkit** - Local-first C# tool for ingesting rulebooks and generating deployable game packages via LLM pipeline with mandatory human review gate
- [ ] **Phase 6: Player Platform** - Game library, spectator mode, game replay, Stripe subscription integration, and PWA polish

## Phase Details

### Phase 1: Engine Foundation
**Goal**: A playable Azul scene runs locally in the browser via a fully abstracted renderer, backed by a running FSM — proving the engine's architecture is sound before any real game logic or networking is added
**Depends on**: Nothing (first phase)
**Requirements**: ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, ENG-06, ENG-07, ENG-08, ENG-09, ENG-10, INFR-01, INFR-02
**Success Criteria** (what must be TRUE):
  1. A game scene renders in the browser using the PixiJS adapter with no direct PixiJS imports in game logic code — swapping the adapter to a stub/no-op renderer runs the same game without errors
  2. The FSM runtime transitions through Game > Phase > Turn > Stage states and handles a parallel region (two players acting simultaneously) without entering an invalid state
  3. Pieces, zones, and boards can be defined in game.json and loaded by the engine; a hook function (hooks.ts) can mutate game state in response to an engine event
  4. Zoom with pinch (mobile) and scroll-wheel (desktop) works; drag-to-pan works; all interactive elements meet the 44px touch target minimum
  5. The server validates a move against a hook function and returns a validMoves[] array — the client highlights legal moves without re-implementing any rule logic
  6. `docker compose up` starts the full local development stack (frontend, API, local PostgreSQL) — no local tool installs required beyond Docker
**Plans:** 7/7 auto-tasks executed (01-07 awaiting checkpoint:human-verify)

Plans:
- [x] 01-01-PLAN.md -- NX monorepo scaffold + Docker Compose dev environment
- [x] 01-02-PLAN.md -- Engine type contracts (IRenderer, GameConfig, hooks) + Azul game.json
- [x] 01-03-PLAN.md -- Hierarchical FSM runtime with parallel regions (TDD)
- [x] 01-04-PLAN.md -- Game loader + zone/piece primitives
- [x] 01-05-PLAN.md -- PixiJS renderer adapter + viewport + touch targets
- [x] 01-06-PLAN.md -- C# API server + server-side move validation via Jint
- [ ] 01-07-PLAN.md -- Azul scene integration + end-to-end wiring + visual polish (checkpoint pending)

### Phase 2: Azul + First Playable
**Goal**: A complete game of Azul can be played locally (single browser, hot-seat style) with all rules enforced by the server, state persisted to PostgreSQL, and a working SvelteKit UI — the engine is proven by a real game
**Depends on**: Phase 1
**Requirements**: AZUL-01, AZUL-02, AZUL-03, AZUL-04, AZUL-05, PLAT-01
**Success Criteria** (what must be TRUE):
  1. A 2-4 player Azul game runs to completion with correct drafting, tiling, per-round scoring, end-game scoring, and all edge cases (floor line overflow, factory exhaustion, first player token) enforced server-side
  2. Attempting an illegal move (placing on a full pattern line, drafting from an empty factory) is rejected by the server with an error; the client shows the move as invalid and does not update state
  3. A user can sign up, log in, and return to a game-in-progress after closing and reopening the browser — session persists across refresh
  4. Game state survives a server restart — PostgreSQL holds authoritative state with versioned conditional writes; the client re-fetches on reconnect
**Plans**: TBD

### Phase 3: Multiplayer + Social
**Goal**: Two or more players on different devices can play Azul in real time, find each other through the lobby, and play with friends via invite — the platform becomes multiplayer
**Depends on**: Phase 2
**Requirements**: MULT-01, MULT-03, MULT-04, MULT-05, MULT-06, SOCL-01, SOCL-02, SOCL-03, SOCL-04, SOCL-05, SOCL-06, PLAT-02
**Success Criteria** (what must be TRUE):
  1. Two players on separate browsers play Azul in real time — moves appear on the opponent's screen within one second; neither player can take an action on another's turn
  2. A player can create a public or invite-only table, invite a friend by username, and the friend joins and starts a game without any URL sharing
  3. A player who closes their tab mid-game and reopens it sees the current board state and can continue playing — reconnection re-fetches server state before enabling moves
  4. A player has a profile with username and avatar; their match history shows completed games with results, opponents, and dates
  5. The PWA installs to the home screen from the browser install prompt and launches as a standalone app
**Plans**: TBD

### Phase 4: Async + Notifications
**Goal**: Players can start a game and take turns over days or weeks — the platform supports the dominant adult play pattern (async) with notifications that keep games moving without causing fatigue
**Depends on**: Phase 3
**Requirements**: MULT-02, NOTF-01, NOTF-02, NOTF-03, NOTF-04
**Success Criteria** (what must be TRUE):
  1. A player can start an async game with a chosen timer preset (fast / normal / slow / unlimited); the game advances only when the active player submits a move or the deadline expires
  2. When it becomes a player's turn in an async game, they receive an email notification; escalating reminders fire at 48h, 24h, and final hour before a deadline
  3. A player who has installed the PWA receives a Web Push notification when it is their turn, even when the browser is closed
  4. A player can configure their notification preferences (immediate vs. daily digest, per-game opt-out) and those preferences are respected by all notification channels
**Plans**: TBD

### Phase 5: AI Game Creation Toolkit
**Goal**: A game designer can feed a rulebook and art assets into a local C# tool and receive a deployable game package that runs on the BGA2 engine — validated by using it to ship a second game
**Depends on**: Phase 2
**Requirements**: AIGC-01, AIGC-02, AIGC-03, AIGC-04, AIGC-05, AIGC-06, AIGC-07
**Success Criteria** (what must be TRUE):
  1. The tool ingests a PDF rulebook and produces a human-reviewable game-spec.json that correctly captures the game's zones, pieces, turn structure, and win condition — a human reviewer can read it without referring to the original rulebook
  2. After spec approval, the tool generates a game.json + hooks.ts that load and run in the engine's local test harness with no manual edits required for the happy path
  3. The hot-reload test harness detects file changes and restarts the local engine within three seconds; a developer can jump to any game state and test a specific scenario without replaying preceding moves
  4. The human review gate produces a structured checklist and discrepancy report listing rules the AI flagged as ambiguous or unresolved; a second game ships to production using this pipeline
**Plans**: TBD

### Phase 6: Player Platform
**Goal**: The platform has a front door — players can discover games, watch live matches, replay completed games, and subscribe to unlock content — it feels like a product, not a prototype
**Depends on**: Phase 3
**Requirements**: PEXP-01, PEXP-02, PEXP-03, PEXP-04, PLAT-03
**Success Criteria** (what must be TRUE):
  1. A player can browse the game library, filter by genre tags, see recently played games, and click through to start a new game — discovery to first move takes under three clicks
  2. The game log shows every move in a completed or in-progress game with timestamps; an async player returning after a day can read what happened without asking opponents
  3. A spectator can open a live game in read-only mode and see moves applied in real time without any player action required
  4. A player can step through a completed game replay move-by-move, jump to any turn, and pause — using the event log as the source of truth
  5. A player can subscribe to a premium tier via Stripe, receive confirmation, and immediately access locked games or features
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 (can parallel-track from Phase 3) → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Engine Foundation | 7/7 auto (checkpoint pending) | Checkpoint | - |
| 2. Azul + First Playable | TBD | Not started | - |
| 3. Multiplayer + Social | TBD | Not started | - |
| 4. Async + Notifications | TBD | Not started | - |
| 5. AI Game Creation Toolkit | TBD | Not started | - |
| 6. Player Platform | TBD | Not started | - |

---
*Roadmap created: 2026-02-28*
*Last updated: 2026-03-01 — Plan 01-07 auto-tasks complete; checkpoint:human-verify pending*
