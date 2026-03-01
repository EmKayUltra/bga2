# Feature Research

**Domain:** Digital board game platform (BGA competitor)
**Researched:** 2026-02-28
**Confidence:** MEDIUM-HIGH (competitor features well-documented; player preference data partially from surveys)

---

## Research Methodology

Platform analysis based on: Board Game Arena (primary reference), Tabletopia, Tabletop Simulator, Yucata.
Sources: BGA official docs, BGG community threads, developer post-mortems, platform reviews, Stonemaier survey data.
Confidence note: BGA's internal feature details verified from official documentation. Player preference data from Stonemaier 2024 survey and market research.

---

## Platform Landscape Summary

| Platform | Model | Rule Enforcement | Async | Mobile | Creator Workflow |
|----------|-------|-----------------|-------|--------|-----------------|
| Board Game Arena | Freemium ($42/yr premium) | Full (server-side) | Yes | Native Android app + web | PHP framework, FTP deploy, volunteer devs |
| Tabletopia | Freemium ($14.99-$49.97/mo publisher) | None (sandbox) | No | Browser + limited mobile | Upload assets, drag/drop editor |
| Tabletop Simulator | One-time $20 | Scripted only (Lua) | No | Steam only, no mobile | Lua scripting, Steam Workshop |
| Yucata | Free, no ads | Full | Yes (only mode) | Browser | Volunteer dev team |

**Key insight:** BGA is the only platform combining rule enforcement + async play + large library + mobile. This is the gap to compete in — and the product spec already targets it.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Rule enforcement (server-side) | Players expect to focus on strategy, not remembering rules or catching cheaters. Illegal moves simply don't happen. | HIGH | Server-authoritative model. Client shows legal moves only. BGA's core strength. |
| Legal move highlighting | Without visual cues for valid moves, new players abandon games. Reduces cognitive load enormously. | MEDIUM | Show valid selections as player hovers/selects. Per-game logic, driven by game state. |
| Async (turn-based) play | Most adult players cannot commit to synchronous 45-min sessions. Async is the dominant play mode on BGA. | HIGH | Email + push notification on turn. Configurable timers (fast/normal/slow). Timeout = forfeit or auto-skip. |
| Real-time (synchronous) play | Players with scheduled game nights want live play. Both modes required for different audiences. | MEDIUM | WebSocket-based. Already more complex than async but expected by serious players. |
| Game log / move history | Players need to catch up after returning to an async game. Also used for dispute resolution. | MEDIUM | Scrollable in-game log. Timestamps on each action. BGA's replay feature lets players view from any position. |
| Player profiles | Needed for trust, reputation, and social features. Non-negotiable foundation for community. | LOW | Username, avatar, game stats, match history. |
| Match history | Players want to review results, track improvement, brag. | LOW | Per-game records with final scores, opponents, date. |
| Lobby / table creation | Entry point to play. Must be fast to get into a game. BGA offers both simple (auto-match) and manual lobby. | MEDIUM | Open tables, invite-only tables, quick-join by game. |
| Notifications (email + push) | Async play is useless without reliable "it's your turn" notifications. BGA's push notification is a core retention driver. | MEDIUM | Web push (PWA) + email. iOS Web Push now supported (iOS 16.4+). |
| Friend system | Playing with known people is the primary social motivation. Without friends, retention drops. | LOW | Friend list, invite to game, see when friends are online/in a game. |
| Private / invite-only games | Playing with friends requires the ability to lock a table. Critical for groups and families. | LOW | Table password or invite-link model. |
| Chat (in-game text) | Minimal social presence during and after games. Voice/video are v2+. | LOW | Per-table chat during game. Post-game brief exchange. |
| ELO / skill rating per game | Players need to know their skill level and be matched fairly. BGA has per-game ELO starting at 0. | MEDIUM | Separate rating per game. Affects matchmaking. Visible on profile. |
| Game rules / help reference | Players forget rules mid-game. "How to play" summary needs to be one click away during play. | LOW | Sidebar rules reference. Link to full rulebook PDF. |
| Zoom in/out | Board games have spatial layouts that don't fit all screens. Essential for mobile. Already in spec. | MEDIUM | Pinch-to-zoom on mobile, scroll-wheel on desktop. Pan/drag the viewport. |
| PWA installability | Players expect an "app-like" experience on mobile without going to an app store. | LOW | Manifest + service worker = installable. Already in spec. Push notifications require service worker. |
| Game library / discovery | Players need to browse what's available, find something new, or return to favorites. | LOW | Searchable catalog, genre tags, popularity sort, "recently played" section. |

---

### Differentiators (Competitive Advantage)

Features that set the product apart. These are where the project competes. Align with the "two pillars" of engine + AI creation toolkit.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-powered game creation from rulebooks | No other platform lets a creator describe a game + feed source materials and get a playable implementation. BGA requires PHP expertise + months of manual work. Tabletopia requires manual asset upload. | VERY HIGH | Core differentiator. LLM pipeline: ingest rulebook → codified spec → game data + script hooks → hot-reload testing. Local-first, git-based. |
| Hot-reload game iteration | Game creators can change rules/layout and see changes instantly without a full deploy cycle. BGA devs complain about painful FTP-based deploy workflows. | HIGH | Local dev server. State manipulation for testing specific scenarios. |
| Games as data + script hooks (shared engine) | Consistent player UX across all games. All engine improvements benefit all games instantly. BGA games vary wildly in quality. | HIGH | Shared engine primitives: zones, pieces, turn structure, scoring, animations. Per-game data + hook overrides. |
| Modern mobile-first design | BGA's mobile experience is described as poor — hover events don't translate, game UIs not designed for small screens. A platform where every game works well on mobile is a genuine gap. | HIGH | Zoom/pan viewport as first-class feature. Touch targets sized appropriately. No hover-dependent interactions. |
| Renderer abstraction layer | Allows swapping from Canvas 2D to WebGL or Godot WASM without rewriting games. Future-proofing invisible to players but critical for platform longevity. | HIGH | Clean interface boundary. Enables visual upgrades across all games simultaneously. |
| Game state manipulation for testing | Creators can set up specific game states (end of round, near-win, specific tile layout) to test edge cases. BGA has no such feature; testing requires playing full games. | MEDIUM | Local dev tool feature. Jump to any game state. Useful for AI training data too. |
| Faster async turn clock options | BGA offers "fast turn-based" with configurable playing hours. A better UX around this (visual countdown, richer notification with board state preview) would be genuinely better. | MEDIUM | Show a mini-preview of the board state in the email/push notification. "Your turn — here's where things stand." |
| Release notes per game version | Creators can document what changed in each version. BGA has no formal per-game changelog visible to players. | LOW | Appears in game lobby/details. Players know when rules or UI changed. |
| Tutorial creation tools | BGA tutorials are created from game replays and are notoriously buggy and inconsistent. A proper scenario-based tutorial builder would be a differentiator. | HIGH | Scenario scripting. Forced sequences. Tooltip highlights. Creator-controlled. |
| Spectator mode with replay controls | BGA spectating exists but replay controls are poor — no "step back one move", replays auto-play too fast. Better replay UX is a genuine gap. | MEDIUM | Scrubber timeline. Step forward/back by move. Jump to any turn. Pause anywhere. |
| Creator analytics dashboard | Game creators can see play counts, average game duration, drop-off points, common mistake patterns. BGA shows none of this to game developers. | MEDIUM | Platform-internal. Helps creators improve their implementations. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build, with alternatives.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| AI opponents (solo play) | Stonemaier survey found majority of digital board game players prefer playing against AI. High demand. | AI opponents for each game require massive per-game ML work or look obviously stupid. Poisons the "human multiplayer only" brand. Version 1 will have too few humans online for good matchmaking if AI fills tables. | Defer to v2+. Focus on async so players don't need simultaneous opponents. Even one week per move is fine with async. |
| Real-time voice/video chat | Players want to replicate the in-person experience. | Adds WebRTC complexity, TURN server costs, moderation burden. Most players already use Discord/Zoom alongside games. | Text chat in-game. Link players to "start a Discord call." |
| Community game submissions (v1) | Publishers want to list their game; hobbyists want to digitize favorites. | QA burden, rulebook licensing, wildly varying implementation quality. BGA suffers from inconsistent game quality due to volunteer dev model. | Team-only library for v1. AI creation tools lower the team's own cost enough to build a compelling catalog. |
| Full physics sandbox (Tabletop Simulator model) | Some power users want to play any game, even without digital rules. | Eliminates the main value proposition (rule enforcement). Doubles scope — you'd be building both a sandbox AND a platform. | Build the rule-enforced platform well. Sandbox is a different product for a different audience. |
| Native mobile apps (iOS/Android) | Users expect apps in app stores. | Native apps require rewriting game UIs that were built for browser. BGA explicitly notes this problem. Doubles maintenance burden. | PWA with iOS Web Push. Install from browser. Add to home screen. Ship to app stores later using PWA wrapper if needed. |
| Complex guild/clan system | Community requests social groups beyond friends. | High social feature complexity, moderation overhead. Premature before platform has critical mass. | v1: friend lists + private game invites. v2: groups/clubs if player data shows demand. |
| Integrated marketplace / game purchase | "Buy this game's physical version" links. | Licensing, affiliate arrangements, legal complexity. Distracts from platform focus. | Partner links later. Not v1. |
| Global text chat / open lobby chat | Players want to find games and chat across the platform. | Moderation nightmare. BGA's "keyword-based moderation is infuriating" per community complaints — overzealous automod, trolls. | Per-table chat only. Friend messaging. No global chat channel in v1. |
| Reputation thumbs (green/red) | BGA has this; players like rating other players. | Creates harassment vectors. Reputation systems require careful design to not punish slow players. | Use objective metrics: games completed without abandoning, average turn time, games played. Show these transparently. |

---

## Feature Dependencies

```
[Push Notifications]
    └──requires──> [PWA Service Worker]
                       └──requires──> [HTTPS + Web Manifest]

[Async Play]
    └──requires──> [Push Notifications]
    └──requires──> [Turn Timer System]
    └──requires──> [Game State Persistence]

[Real-time Play]
    └──requires──> [WebSocket Connection]
    └──requires──> [Game State Persistence]
    └──requires──> [Reconnection Logic]

[ELO / Matchmaking]
    └──requires──> [Player Profiles]
    └──requires──> [Match History]

[Spectating]
    └──requires──> [Game Log]
    └──requires──> [Read-only game state access]

[Game Replay]
    └──requires──> [Game Log] (full action history, not just summary)

[Tutorial System]
    └──requires──> [Game Engine]
    └──requires──> [Scenario Scripting]
    └──requires──> [Legal Move Highlighting]

[AI Game Creation]
    └──requires──> [Game Engine with stable API]
    └──requires──> [Data + Script Hook model]
    └──requires──> [Hot-reload dev server]
    └──enhances──> [Tutorial System] (AI can generate tutorial scenarios)

[Tournaments]
    └──requires──> [ELO System]
    └──requires──> [Player Profiles]
    └──requires──> [Match History]
    └──requires──> [Reputation / ban system]

[Mobile Zoom/Pan]
    └──requires──> [Renderer abstraction layer]
    └──conflicts──> [Hover-dependent interactions] (must avoid hover for mobile parity)
```

### Dependency Notes

- **Async play requires push notifications:** Without reliable "it's your turn" delivery, async games die. Players don't return. This is BGA's biggest weakness on iOS historically (Apple didn't support Web Push until iOS 16.4).
- **AI creation requires stable engine API:** The AI creation tool generates code/data against the engine's API. If the engine API changes, generated games break. Stabilize engine interfaces before AI tooling.
- **Mobile parity conflicts with hover:** BGA explicitly documents that hover events don't translate to mobile. Every game feature must work without hover. Design mobile-first, enhance for desktop.
- **Tutorials require full game engine:** Tutorials are scripted game sequences. The engine must be feature-complete enough to support forced move sequences and tooltips before tutorials make sense.
- **ELO requires match history:** Can't compute skill ratings without game outcome data. Profile and history come first.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to ship Azul and validate the platform concept.

- [ ] **Server-authoritative game engine** — Rule enforcement is the core value proposition. Without it, you're Tabletopia (no differentiation).
- [ ] **Azul fully implemented** — End-to-end proof the engine works. Tile drafting, pattern building, scoring, all rules enforced.
- [ ] **Legal move highlighting** — Players must see what they can do. Required for Azul's tile selection mechanic.
- [ ] **Async play with email notifications** — Enables play without scheduling. Most important retention driver for adult players.
- [ ] **Real-time play (WebSocket)** — For players who want live games. Required for completeness.
- [ ] **Turn timer system** — Multiple speed presets (fast/normal/slow). Timeout handling (warn, then forfeit or auto-skip).
- [ ] **Game log / move history** — Essential for async players returning after hours. Also dispute resolution.
- [ ] **Player profiles** — Username, avatar, basic stats. Foundation for everything social.
- [ ] **Match history** — Win/loss record per game. Basic stats.
- [ ] **Friend system** — Add friends, invite to private game. Core social loop.
- [ ] **Private + public table creation** — Both invite-only and open-join. Table options: player count, speed, real-time vs async.
- [ ] **In-game text chat** — Minimal social presence. Post-game chat.
- [ ] **PWA installability** — Home screen install on mobile. Push notification support.
- [ ] **Zoom/pan on all devices** — Mobile parity. Non-negotiable per spec.
- [ ] **Game library page** — Browse available games. For v1: just one game (Azul), but the structure must be there.
- [ ] **Basic player reputation** — Objective: games completed, abandonment rate. Use to gate competitive play.

### Add After Validation (v1.x)

Features to add once core is working and players are using it.

- [ ] **ELO per-game rating** — Add once match volume justifies skill ratings. Requires ~50+ games played per player to be meaningful.
- [ ] **Spectator mode** — Add after player base established. Valuable for teaching and community.
- [ ] **Push notifications (web push)** — Layer on after email notifications are working and reliable.
- [ ] **Game replay with controls** — High value for learning, add once game log is proven stable.
- [ ] **Second game on engine** — Proves the engine is actually genre-agnostic, not Azul-specific.
- [ ] **AI game creation tool (internal)** — Use internally to create the second game faster. Validate the workflow before any community-facing release.
- [ ] **Tutorial system** — Valuable but complex. Add after at least 2-3 games are in the library.
- [ ] **Post-game statistics** — Win rates, tile efficiency, scoring trends. Requires match history volume.
- [ ] **Vacation / pause mode** — For async players who need to pause all games (travel, etc.). Chess.com model.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Community game submissions** — Opens platform to external creators. Requires QA pipeline, licensing framework, creator docs.
- [ ] **AI opponents** — High demand but very high per-game complexity. Defer until library is established.
- [ ] **Tournaments** — Requires ELO, reputation gating, bracket management. Complex but high engagement.
- [ ] **Integrated voice chat** — WebRTC complexity and cost. Players use Discord anyway.
- [ ] **Creator analytics dashboard** — Useful once creators are external. Internal team can use database queries.
- [ ] **Native mobile apps** — PWA-first is right. Native only if PWA falls short on specific platforms.
- [ ] **Publisher licensing / official editions** — Business development complexity. Defer.
- [ ] **BGG collection import** — Useful integration for enthusiasts. Low priority.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Server-authoritative rule enforcement | HIGH | HIGH | P1 |
| Legal move highlighting | HIGH | MEDIUM | P1 |
| Async play | HIGH | HIGH | P1 |
| Turn timer system | HIGH | MEDIUM | P1 |
| Game log | HIGH | MEDIUM | P1 |
| PWA installability + zoom/pan | HIGH | MEDIUM | P1 |
| Push notifications (email) | HIGH | LOW | P1 |
| Player profiles | HIGH | LOW | P1 |
| Friend system + private tables | HIGH | LOW | P1 |
| Real-time play | HIGH | HIGH | P1 |
| ELO / matchmaking | MEDIUM | MEDIUM | P2 |
| Spectator mode | MEDIUM | MEDIUM | P2 |
| Game replay | MEDIUM | MEDIUM | P2 |
| Web push notifications | MEDIUM | MEDIUM | P2 |
| Tutorial system | HIGH | HIGH | P2 |
| AI game creation tool (internal) | HIGH (creator value) | VERY HIGH | P2 |
| Post-game statistics | LOW | LOW | P2 |
| Vacation / pause mode | MEDIUM | LOW | P2 |
| Tournaments | HIGH | HIGH | P3 |
| AI opponents | HIGH (demand) | VERY HIGH | P3 |
| Community game submissions | HIGH (growth) | VERY HIGH | P3 |
| Creator analytics dashboard | MEDIUM | MEDIUM | P3 |
| Voice/video chat | LOW (Discord exists) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

### Player UX Features

| Feature | BGA | Tabletopia | Tabletop Simulator | Yucata | Our Approach |
|---------|-----|------------|-------------------|--------|--------------|
| Rule enforcement | Full (server-side) | None (sandbox) | None unless scripted | Full | Full (server-authoritative, spec requirement) |
| Legal move hints | Yes, per-game | No | No | Yes, per-game | Yes — required by engine contract |
| Undo | Per-game policy, limited | Manual (drag piece back) | Manual | Per-game | Per-game policy; never undoes across players |
| Game log | Yes, with replay | No | Limited | Yes | Full action log with replay scrubber |
| Async play | Yes | No | No | Yes (only mode) | Yes — both real-time and async |
| Tutorial system | Community-made, inconsistent quality | No | No | Inconsistent | Scenario-based, creator-authored |
| Spectating | Yes (limited chat) | Limited | Yes | Yes | Yes — full read-only with replay |
| Mobile | Android native app + web (iOS web) | Browser only | No (Steam only) | Browser only | PWA with first-class mobile support |
| Zoom/pan | Per-game, inconsistent | Yes (3D camera) | Yes (3D camera) | Limited | First-class viewport control on all devices |

### Game Creation Workflow

| Aspect | BGA | Tabletopia | Tabletop Simulator | Our Approach |
|--------|-----|------------|-------------------|--------------|
| Workflow | PHP framework + FTP deploy | Asset upload + drag/drop editor | Lua scripting + Steam Workshop | AI generation from rulebook + hot-reload |
| Rule encoding | Manual PHP code per game | No rules (sandbox) | Manual Lua scripting | AI-generated from spec, editable |
| Time to first game | Months for experienced dev | Hours for simple game (no rules) | Days for scripted game | Goal: hours/days with AI assistance |
| Testing workflow | Deploy, play through, FTP back | Manual play | Manual play | State manipulation, any scenario |
| Quality consistency | Variable (volunteer devs) | N/A (sandbox) | Variable (modders) | Enforced by shared engine |
| Creator monetization | Revenue share after approval | Publisher subscription fee | Steam Workshop | TBD — game approval + revenue share model |

### Monetization Models

| Platform | Model | Price | What Unlocks |
|----------|-------|-------|-------------|
| BGA | Freemium | $42/yr premium | 65+ premium games, hotseat, voice chat, advanced stats |
| Tabletopia | Freemium + publisher fee | Free player / $14.99-$49.97/mo publisher | More game setups, publisher tools |
| Tabletop Simulator | One-time purchase | $20 | Everything; DLC packs extra |
| Yucata | Completely free | $0 | N/A |
| Our approach | Freemium subscription | ~$36-50/yr (match BGA) | Premium games, advanced features |

**Monetization finding:** BGA raised prices from $36 to $42/yr in July 2025, suggesting the market supports this range. Premium unlocks are primarily game access (not pay-to-win). This model has player acceptance. Our v1 should mirror it.

---

## Specific BGA UX Deep-Dive

### What BGA Does Well (Preserve/Match)
- **Rule enforcement is invisible magic** — Players just play. No rule-lawyering, no cheating, no mistakes from forgetting rules.
- **Async at scale** — Turn-based with configurable timers works. Email notification on turn is the minimum; push is preferred.
- **ELO per game** — Players care about their rating. Even a simple implementation drives engagement.
- **Speed presets** — Fast/Normal/Slow with clear per-turn and total time. "No time limit" for friends games.
- **Reputation system** — Karma score based on game completions vs abandonments. Objective, abuse-resistant enough.
- **Lobby flexibility** — Both simple (auto-match) and manual (open tables). Critical for different player types.

### What BGA Does Poorly (Our Opportunity)
- **Developer experience** — PHP framework, FTP deploy, volunteer devs, months per game. Our AI toolkit is the answer.
- **Mobile UX** — Hover-dependent interactions that break on iOS. Games not designed for touch. Inconsistent zoom.
- **Tutorial quality** — Tutorials are recorded game replays, play on their own, frequently buggy, confusing for new players.
- **Replay controls** — Auto-play too fast, no step-back-one-move, no pause. Replay is there but hard to use for learning.
- **Game quality consistency** — Because any volunteer can implement a game, quality varies wildly. Players never know what to expect.
- **Moderation** — Keyword-based automod generates false positives ("damn, I screwed up" triggers moderation). Global chat is troll-heavy.
- **iOS push notifications** — Historically missing on iOS. Only resolved when Apple added Web Push support (iOS 16.4, 2023). BGA was slow to implement.

---

## Sources

- [Board Game Arena FAQ](https://en.boardgamearena.com/faq) — Platform features overview (MEDIUM confidence, official)
- [BGA Turn-Based FAQ](https://en.boardgamearena.com/doc/Turn_based_FAQ) — Async play mechanics (MEDIUM confidence, official)
- [BGA Rating Docs](https://en.boardgamearena.com/doc/Rating) — ELO system specifics (MEDIUM confidence, official)
- [BGA Undo Policy](https://en.boardgamearena.com/doc/BGA_Undo_policy) — Undo mechanics (MEDIUM confidence, official)
- [BGA Studio Overview](https://en.boardgamearena.com/doc/Studio) — Developer workflow (MEDIUM confidence, official)
- [Meeple Mountain: BGA 2025 Game of the Year](https://www.meeplemountain.com/articles/board-game-arena-is-my-2025-game-of-the-year/) — Player experience review (LOW confidence, editorial)
- [Shipping a Game on BGA: Developer's Tale](https://medium.com/@nicolas_matt/shipping-a-game-on-board-game-arena-a-developpers-tale-0962403176d5) — Developer experience (MEDIUM confidence, practitioner account)
- [Tabletopia Help: How to Create a Game](https://help.tabletopia.com/knowledge-base/how-to-create-a-game/) — Creator workflow (MEDIUM confidence, official)
- [Yucata Platform Features](https://gamertagguru.com/blog/exploring-yucata-a-platform-for-board-game-enthusiasts) — Feature overview (LOW confidence, editorial)
- [Stonemaier Digital Board Game Survey](https://stonemaiergames.com/5-surprises-and-insights-from-a-digital-board-game-survey/) — Player preferences (MEDIUM confidence, first-party survey)
- [BGG: Tabletop Simulator vs Tabletopia vs BGA](https://boardgamegeek.com/thread/2491575/tabletop-simulator-vs-tabletopia-vs-board-game-are) — Community comparison (LOW confidence, community)
- [Hicreate Games: Platform Comparison](https://www.hicreategames.com/tabletopia-vs-tabletop-simulator-vs-board-game-arena/) — Feature matrix (LOW confidence, editorial)
- [BGA Premium Benefits](https://en.boardgamearena.com/premium) — Subscription model (MEDIUM confidence, official)
- [BGA Karma/Reputation System](https://en.boardgamearena.com/news?id=304) — Reputation mechanics (MEDIUM confidence, official announcement)
- [BGA Mobile Weaknesses (BGG thread)](https://boardgamegeek.com/thread/2912438/boardgamearena-on-iphone) — Mobile UX criticism (LOW confidence, community)
- [Asynchronous Multiplayer Design](https://www.wayline.io/blog/asynchronous-multiplayer-reclaiming-time-mobile-gaming) — Async UX best practices (LOW confidence, editorial)
- [Online Board Games Market 2024](https://www.mordorintelligence.com/industry-reports/global-online-board-games-market) — Market data (LOW confidence, market research)

---

*Feature research for: Digital board game platform (BGA competitor)*
*Researched: 2026-02-28*
