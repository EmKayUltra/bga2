# Requirements: BGA2

**Defined:** 2026-02-28
**Core Value:** Any board game can be faithfully digitized and played online — the engine handles the hard parts so creators focus on what makes their game unique.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Game Engine

- [x] **ENG-01**: Game engine provides zone/board primitives (grids, freeform areas, hands, decks, discard piles)
- [x] **ENG-02**: Game engine provides piece primitives (cards, tokens, tiles, dice) with properties and state
- [x] **ENG-03**: Game engine provides hierarchical FSM runtime (Game > Phase > Turn > Stage) with parallel regions
- [x] **ENG-04**: Server validates every move against state machine + game hooks; client never enforces rules
- [x] **ENG-05**: Client receives validMoves[] from server for legal move highlighting
- [x] **ENG-06**: IRenderer interface abstracts rendering; game logic never imports renderer directly
- [x] **ENG-07**: PixiJS 8 WebGL adapter implements IRenderer as primary renderer
- [x] **ENG-08**: Zoom/pan works on all devices — pinch-to-zoom mobile, scroll-wheel desktop, drag to pan
- [x] **ENG-09**: Touch targets minimum 44px; no hover-dependent interactions
- [x] **ENG-10**: Games defined as data (game.json) + script hooks (hooks.ts) on shared engine

### Azul

- [x] **AZUL-01**: Azul drafting phase — select tiles from shared factories
- [x] **AZUL-02**: Azul tiling phase — place tiles on pattern lines and wall
- [x] **AZUL-03**: Azul scoring — per-round and end-game scoring with all rules
- [x] **AZUL-04**: Azul supports 2-4 players with correct component counts
- [x] **AZUL-05**: All Azul edge cases handled (floor line overflow, factory exhaustion, first player token)

### Multiplayer

- [x] **MULT-01**: Real-time synchronous play via AppSync Events WebSocket
- [x] **MULT-02**: Async turn-based play with configurable timer presets (fast/normal/slow/unlimited)
- [x] **MULT-03**: Lobby with open and invite-only table creation
- [x] **MULT-04**: Reconnection re-fetches server state before enabling interaction
- [x] **MULT-05**: Idempotent move protocol with client-generated UUIDs
- [x] **MULT-06**: Optimistic locking with state versioning prevents concurrent update corruption

### Social

- [x] **SOCL-01**: User can create profile with username and avatar
- [x] **SOCL-02**: User can view match history with results, opponents, dates
- [x] **SOCL-03**: User can add/remove friends
- [x] **SOCL-04**: User can invite friends to a game
- [x] **SOCL-05**: User can create private invite-only tables
- [x] **SOCL-06**: User can send text chat messages during and after games

### Notifications

- [x] **NOTF-01**: User receives email notification when it's their turn (async games)
- [x] **NOTF-02**: Turn timer enforces deadlines with escalating reminders (48h, 24h, final hour)
- [x] **NOTF-03**: User receives Web Push notification via PWA service worker
- [x] **NOTF-04**: User can configure notification preferences (immediate vs digest, per-game)

### Player Experience

- [ ] **PEXP-01**: Game log shows full move history with timestamps
- [ ] **PEXP-02**: Game library page with browse, search, genre tags, recently played
- [ ] **PEXP-03**: Spectator can watch a live game in read-only mode
- [ ] **PEXP-04**: Game replay with step forward/back, jump to any turn, pause

### AI Game Creation

- [ ] **AIGC-01**: Local C# tool ingests rulebook (PDF/text) and art assets
- [ ] **AIGC-02**: LLM generates human-reviewable game spec (structured JSON) from source materials
- [ ] **AIGC-03**: LLM generates game.json + hooks.ts from approved spec
- [ ] **AIGC-04**: Hot-reload test harness with file watcher and local engine
- [ ] **AIGC-05**: Game state manipulation for testing specific scenarios (jump to any state)
- [x] **AIGC-06**: Human review gate with structured checklist and discrepancy report
- [ ] **AIGC-07**: Package and deploy game bundle to S3

### Infrastructure

- [x] **INFR-01**: All services build and run via Docker containers — no local tool dependencies beyond Docker
- [x] **INFR-02**: Docker Compose orchestrates the full local development stack (frontend, API, database, etc.)

### Platform

- [x] **PLAT-01**: User can sign up, log in, and maintain session across browser refresh
- [x] **PLAT-02**: PWA installable from browser with service worker
- [ ] **PLAT-03**: Freemium subscription with premium game/feature access (Stripe)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Ratings & Matchmaking

- **RATE-01**: ELO per-game skill rating computed from match history
- **RATE-02**: Matchmaking considers ELO for balanced games

### Community

- **COMM-01**: Community game submissions with QA pipeline
- **COMM-02**: Creator analytics dashboard (play counts, drop-off, duration)
- **COMM-03**: Tournament system with brackets and ELO gating

### Advanced Features

- **ADVN-01**: AI opponents for solo play
- **ADVN-02**: Tutorial creation tools (scenario-based, creator-authored)
- **ADVN-03**: Vacation/pause mode for async players
- **ADVN-04**: Post-game statistics (win rates, scoring trends)
- **ADVN-05**: Board state preview in email/push notifications

### Platform Growth

- **GROW-01**: Second renderer implementation (WebGPU or Godot WASM when stable)
- **GROW-02**: Native mobile apps via PWA wrapper (Capacitor/PWABuilder)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| AI opponents | Per-game ML complexity enormous; human multiplayer base needs to exist first |
| Full physics sandbox | Eliminates rule-enforcement value proposition |
| Voice/video chat | WebRTC complexity + cost; players use Discord |
| Native mobile apps | PWA-first; wrap later if needed |
| Global chat / open lobby chat | Moderation nightmare at scale |
| Reputation thumbs (green/red) | Harassment vector; use objective metrics instead |
| Real-time guild/clan system | Premature before critical mass; friends suffice |
| Integrated marketplace | Licensing/affiliate complexity; not core |
| Publisher licensing deals | Business development complexity; defer |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 1 | Complete |
| ENG-02 | Phase 1 | Complete |
| ENG-03 | Phase 1 | Complete |
| ENG-04 | Phase 1 | Complete |
| ENG-05 | Phase 1 | Complete |
| ENG-06 | Phase 1 | Complete |
| ENG-07 | Phase 1 | Complete |
| ENG-08 | Phase 1 | Complete |
| ENG-09 | Phase 1 | Complete |
| ENG-10 | Phase 1 | Complete |
| INFR-01 | Phase 1 | Complete |
| INFR-02 | Phase 1 | Complete |
| AZUL-01 | Phase 2 | Complete |
| AZUL-02 | Phase 2 | Complete |
| AZUL-03 | Phase 2 | Complete |
| AZUL-04 | Phase 2 | Complete |
| AZUL-05 | Phase 2 | Complete |
| PLAT-01 | Phase 2 | Complete |
| MULT-01 | Phase 3 | Complete |
| MULT-03 | Phase 3 | Complete |
| MULT-04 | Phase 3 | Complete |
| MULT-05 | Phase 3 | Complete |
| MULT-06 | Phase 3 | Complete |
| SOCL-01 | Phase 3 | Complete |
| SOCL-02 | Phase 3 | Complete |
| SOCL-03 | Phase 3 | Complete |
| SOCL-04 | Phase 3 | Complete |
| SOCL-05 | Phase 3 | Complete |
| SOCL-06 | Phase 3 | Complete |
| PLAT-02 | Phase 3 | Complete |
| MULT-02 | Phase 4 | Complete |
| NOTF-01 | Phase 4 | Complete |
| NOTF-02 | Phase 4 | Complete |
| NOTF-03 | Phase 4 | Complete |
| NOTF-04 | Phase 4 | Complete |
| AIGC-01 | Phase 5 | Pending |
| AIGC-02 | Phase 5 | Pending |
| AIGC-03 | Phase 5 | Pending |
| AIGC-04 | Phase 5 | Pending |
| AIGC-05 | Phase 5 | Pending |
| AIGC-06 | Phase 5 | Complete |
| AIGC-07 | Phase 5 | Pending |
| PEXP-01 | Phase 6 | Pending |
| PEXP-02 | Phase 6 | Pending |
| PEXP-03 | Phase 6 | Pending |
| PEXP-04 | Phase 6 | Pending |
| PLAT-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation — traceability complete*
