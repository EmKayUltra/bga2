# Pitfalls Research

**Domain:** Digital board game platform (BGA competitor) with AI-powered game creation
**Researched:** 2026-02-28
**Confidence:** MEDIUM — Most findings verified across multiple sources; AI-generation quality issues are newer territory with less established literature.

---

## Critical Pitfalls

### Pitfall 1: Over-Engineering the Game Engine Before Proving It With a Real Game

**What goes wrong:**
The engine grows a comprehensive feature set — zones, piece hierarchies, animation systems, spectator modes, undo/redo, replay — before a single complete game ships. The team spends 6-18 months on infrastructure and never validates that the abstractions actually work for Azul's specific mechanics. When Azul is finally implemented, it reveals that half the abstractions are wrong or missing critical affordances, requiring rewrites.

**Why it happens:**
Building an engine feels productive. The fear of "painting yourself into a corner" tempts developers to solve imagined future problems. The engine API is designed by reasoning about hypothetical games rather than implementing a real one. Every new primitive added without a concrete user (a game) is speculative work.

**How to avoid:**
Implement Azul in parallel with the engine from day one. The engine and the first game must co-evolve: Azul is the engine's integration test suite. Adopt the rule: no engine primitive lands without Azul using it within the same phase. Resist adding primitives that Azul doesn't need. Defer "generic" solutions to game 2 or game 3, when patterns actually emerge.

**Warning signs:**
- Engine has 10+ primitives but no game renders anything on screen
- Engine design discussions reference hypothetical "chess" or "Pandemic" scenarios without Azul context
- Sprint tasks are engine-only with no game-facing deliverable
- Any discussion of "before we can implement Azul, we first need to build X"

**Phase to address:** Engine Foundation phase (Phase 1). Enforce the co-development rule from the first commit. Ship Azul end-to-end before declaring the engine "done."

---

### Pitfall 2: Game State Serialization That Doesn't Survive Real Conditions

**What goes wrong:**
Game state is serialized as a monolithic JSON blob representing the entire game at a point in time. This works fine in testing but fails in production when: (a) DynamoDB's 400 KB item limit is exceeded for complex game states, (b) schema changes during development break deserialization of in-progress games, (c) the state contains non-serializable references that corrupt silently, (d) concurrent writes from multiple players corrupt state due to missing optimistic locking. A game halfway through cannot be resumed after a deploy.

**Why it happens:**
Early serialization is written for the happy path. JSON.stringify works, tests pass, it ships. The DynamoDB 400 KB limit is not discovered until real game data accumulates. Schema versioning is not designed in because "we'll deal with migration later." Race conditions in writes are not encountered in single-player testing.

**How to avoid:**
Design state with explicit versioning from day one: `{ version: 1, state: {...} }`. Use DynamoDB conditional writes with version numbers to enforce optimistic locking — reject writes where the expected version doesn't match. Keep game state normalized and lean: store action logs + current state, not redundant derived views. If state approaches 200 KB, split history into a separate item. Test deserialization of every schema version on every deploy (even in early phases). Write a migration script before you need it.

**Warning signs:**
- State size approaching 200 KB in early testing
- No `version` field in the game state schema
- DynamoDB writes without `ConditionExpression`
- "It works fine locally" but fails after concurrent testing with two clients

**Phase to address:** Engine Foundation / Data Layer phase (Phase 1-2). State schema versioning and DynamoDB write patterns must be established before multiplayer goes live.

---

### Pitfall 3: Ignoring Turn-Based Multiplayer Edge Cases Until They're Player-Facing

**What goes wrong:**
The happy path — Player A takes a turn, Player B takes a turn — works. But production reveals: a player disconnects mid-action and their partial move leaves state inconsistent; a player's browser crashes after the server accepts a move but before the client receives the acknowledgement, so they retry and the move executes twice; a timeout fires while the player is mid-interaction, auto-skipping their turn while they're actually present; two players in different timezones both try to make a move in the same multi-player-active state simultaneously, and the server accepts both, corrupting state.

**Why it happens:**
These scenarios require concurrent players to reproduce, so they're invisible in solo testing. Each edge case requires dedicated logic that seems low-value until a real player reports it. The move-retry problem (idempotency) is especially subtle: clients will retry failed requests, so the server must handle identical moves arriving twice gracefully.

**How to avoid:**
Define explicit game state transitions on the server with idempotent move endpoints — every move action has a client-generated UUID; the server ignores duplicate IDs. Implement explicit player session state: CONNECTED, DISCONNECTED, TIMEOUT_WARNING, TIMED_OUT. Reconnection restores the last server-acknowledged state, not client-cached state. Design the state machine so that partially applied moves can be detected and rolled back (use DynamoDB transactions for multi-step state changes). For async games, run nightly Lambda jobs that detect stalled games and fire warning notifications before timeout.

**Warning signs:**
- Move endpoints are not idempotent (no client-generated move ID)
- No explicit reconnection flow tested with Network throttle in DevTools
- Timeout logic lives only client-side
- No load test with concurrent players hitting the same game

**Phase to address:** Multiplayer Infrastructure phase (Phase 2). Design idempotent moves and reconnection from the first multiplayer implementation.

---

### Pitfall 4: Mobile UX That Works at Desktop Scale But Fails on Small Screens

**What goes wrong:**
The Azul board designed for desktop looks fine at 1440px but is unplayable on a 375px phone screen. Tile pieces are too small to tap accurately (below 44px touch targets). The factory display, pattern lines, and floor line must all be visible simultaneously — cramming them into phone width makes text illegible and pieces indistinguishable. Players pinch-to-zoom into the OS zoom rather than the in-game zoom, breaking the layout. Tablet and phone use different aspect ratios (4:3 vs 9:16/9:21), so a single layout breaks on one of them.

**Why it happens:**
Development happens on a MacBook browser resized to "mobile width." This doesn't replicate actual device behavior, tap accuracy, or OS-level interference. Board game UIs are inherently information-dense; the instinct is to scale everything down rather than redesign for small screens.

**How to avoid:**
Build the mobile layout first, not last. Define minimum touch targets as 44x44px (Apple HIG) or 48x48dp (Material) as an engine-level constraint — the rendering layer enforces this, not individual games. Implement in-game zoom (pinch-to-zoom within the game canvas, not the browser viewport) as a first-class engine feature from day one. Test on real devices: iPhone SE (small), iPad (tablet), and a mid-range Android. For Azul specifically, consider a progressive disclosure layout: the factory display is primary, the player board is a swipeable secondary view, and the center pool is a permanent anchor element.

**Warning signs:**
- All testing done in Chrome DevTools device emulation rather than real devices
- Touch targets measured in CSS pixels without checking physical mm size
- Pinch-to-zoom opens the browser zoom rather than in-game zoom
- No layout breakpoint between 375px and 768px

**Phase to address:** Engine Foundation / UI Framework phase (Phase 1). Zoom as a first-class feature must be designed in, not retrofitted.

---

### Pitfall 5: Leaky Renderer Abstraction That Couples Game Logic to Rendering Details

**What goes wrong:**
The renderer abstraction looks clean but leaks: game code reaches into renderer-specific concepts like WebGL texture handles, Canvas context methods, or coordinate systems. When the renderer is swapped (Canvas 2D → WebGL → Godot WASM), game code breaks in non-obvious ways. Performance-critical paths bypass the abstraction entirely for "just this one case," creating a growing set of escape hatches that make swapping impossible in practice. Animation timing is tied to `requestAnimationFrame` semantics in ways that don't translate across renderers.

**Why it happens:**
Abstractions get perforated gradually. A developer needs a specific Canvas API feature and adds a thin wrapper instead of redesigning the abstraction. Performance concerns create pressure to "drop down to the metal." The abstraction is designed without a second renderer implementation to stress-test it, so leaks go undetected.

**How to avoid:**
Design the abstraction with two concrete implementations from the start — even if the second is a no-op stub renderer. This forces the abstraction to be genuinely renderer-agnostic. The public interface of the renderer must deal only in logical concepts: `drawPiece(piece, position, rotation)`, `playAnimation(type, target, duration)`, `setZoomLevel(factor)`. No renderer-specific types should cross the boundary. Write an integration test that runs the same game scene through both implementations and compares output. Keep the abstraction thin and boring — if it requires significant documentation to understand, it's too clever.

**Warning signs:**
- Game code imports anything from the renderer module
- Renderer interface methods take parameters typed to renderer-specific types (e.g., `WebGLTexture`, `CanvasRenderingContext2D`)
- "We'll just use the Canvas context directly here for performance" comments in game logic
- No second renderer implementation, even a minimal one

**Phase to address:** Engine Foundation (Phase 1). The abstraction interface must be validated with at least two implementations before Azul is implemented on top of it.

---

### Pitfall 6: Serverless Cold Starts Degrading the Synchronous Game Experience

**What goes wrong:**
Lambda functions behind API Gateway WebSocket connections take 500ms-2s to cold start for .NET runtime. During synchronous play, a player makes a move and nothing happens for 1-2 seconds — the game appears frozen. This is particularly jarring at game start when the first Lambda invocation after a period of inactivity triggers a cold start for all players simultaneously. WebSocket connection establishment itself hits a Lambda authorizer cold start before the game even begins.

API Gateway WebSocket connections expire after 2 hours maximum, requiring reconnection logic for long games that the client must handle transparently.

**Why it happens:**
Lambda cold starts affect a small percentage of requests (estimated under 1%) but the game experience makes them feel universal because timing matters. .NET has historically had one of the slower cold start profiles. Provisioned Concurrency is not free and feels like premature optimization in early development, so it gets deferred.

**How to avoid:**
Use Lambda SnapStart for .NET functions (AWS expanded support in 2024) — this snapshots the initialized state and cuts cold starts to sub-second. For the WebSocket authorizer Lambda, which every connection hits, enable Provisioned Concurrency for at least 1 instance. Structure game logic so that move processing is idempotent enough that a retry after a cold start is safe. For async play, cold starts are irrelevant — only optimize for synchronous game sessions. Design the client to show a visible "Connecting..." state during Lambda warm-up, so the blank period has a clear cause.

**Warning signs:**
- First move after opening a game takes 1-2 seconds while subsequent moves are instant
- WebSocket connection establishment takes more than 300ms consistently
- No SnapStart or Provisioned Concurrency configuration in infrastructure-as-code
- Lambda package size exceeds 10 MB (larger packages cold start slower)

**Phase to address:** Infrastructure phase (Phase 2-3). Configure SnapStart in initial Lambda deployment. Measure cold start p99 latency as an explicit acceptance criterion.

---

### Pitfall 7: State Machine Complexity Explosion for Multi-Player Simultaneous Actions

**What goes wrong:**
Azul starts clean: states map directly to rulebook phases. But when implementing simultaneous player actions (everyone drafts factories in parallel, then scores simultaneously), the simple flat state machine explodes. Each player's independent state requires tracking alongside global state. A naive approach creates a combinatorial explosion: Player1_Drafting × Player2_Drafting × Player1_Done × Player2_Done → 4 states for 2 players, 8 for 3, 16 for 4. Add optional actions and the count doubles again. The state machine becomes unmaintainable before game 2.

**Why it happens:**
State machines are designed to handle the "current player acts" case cleanly. When the rulebook says all players act simultaneously but independently, developers either serialize the actions (destroying the simultaneous feel) or manually enumerate all combinations. BGA's own documentation notes that MULTIPLE_ACTIVE_PLAYER states with private parallel states solve this, but the pattern is not obvious from first principles.

**How to avoid:**
Use hierarchical statecharts with parallel regions instead of flat FSMs. For simultaneous player phases, model each player's state as a parallel sub-machine that runs independently. The parent state transitions when all parallel children reach their terminal state. This keeps state count linear instead of exponential. BGA's approach validates this: each player's sub-state is a parallel private state within the MULTIPLE_ACTIVE_PLAYER parent state. On the engine side, model this explicitly rather than using ad-hoc workarounds. Avoid storing "waiting for players X, Y, Z" as enumerated states — instead, store a "pending players" set and transition the parent state when the set empties.

**Warning signs:**
- State machine file contains states named with player names or player indices
- "Waiting for Player 1 and Player 2" and "Waiting for Player 1 only" are separate states
- State count grows faster than linearly as new game phases are added
- State transition logic contains a combinatorial `if (player1Done && player2Done && player3Done)` pattern

**Phase to address:** Engine Foundation (Phase 1). Design the statechart model for parallel player states before implementing Azul's drafting phase.

---

## Moderate Pitfalls

### Pitfall 8: Asset Loading Blocking Game Start

**What goes wrong:**
All game assets (tile images, board textures, fonts, icons) are loaded synchronously before the game renders anything. On a 4G connection, a 15-20 MB game takes 5-10 seconds to display anything. Players on mobile see a blank screen and assume the game is broken. On returning visits, PWA cache should serve assets instantly but incorrect service worker cache strategies for versioned assets cause stale asset loads.

**How to avoid:**
Implement progressive asset loading: render the game board with placeholder graphics immediately, then stream in high-quality textures as they load. Use the PWA service worker with a cache-first strategy for hashed static assets and network-first for game state API calls. Limit initial payload to board structure and solid-color pieces; the Azul tile art can load in the background. Set explicit size budgets: initial render must occur within 2 seconds on a simulated 4G connection. Use WebP format for all raster assets — typically 25-35% smaller than PNG. Avoid base64-encoding large images in CSS.

**Warning signs:**
- Game canvas is invisible for more than 3 seconds on first load
- No loading progress indicator
- All image imports are at the top of the module (eager loading)
- Service worker precache list includes all assets without size consideration

**Phase to address:** First Game Implementation (Azul) phase. Define asset loading strategy as part of Azul's implementation spec.

---

### Pitfall 9: Async Play Notification Fatigue Causing Game Abandonment

**What goes wrong:**
Email notifications for every turn in a long game become noise. Players unsubscribe or filter notifications. Without notifications, async games stall for days or permanently. BGA's async games frequently sit abandoned at 40-60% completion. The inverse problem also occurs: a player gets one notification per opponent action in a 4-player game, receiving 3 emails per round and disabling notifications entirely after a week.

**How to avoid:**
Implement configurable notification frequency: "notify me immediately," "once per day digest," "only on deadline day." Default to a daily digest, not per-action. Add in-game reminders as a complement to email — when a player opens any game, show a badge indicating their pending turns across all games. Implement escalating reminders for deadline proximity: 48 hours before timeout, 24 hours, final hour. Track notification opt-out rates as a health metric and tune defaults based on observed behavior. Do not rely solely on WebSocket push — implement pull fallback (polling every 5 minutes when app is open) for players who block notifications.

**Warning signs:**
- No notification frequency preference in user settings
- Notification unsubscribe rate exceeds 20% in first month
- Average game completion rate drops below 50% after launch
- No in-app "your turn" indicator separate from email notifications

**Phase to address:** Async Play phase. Notification preferences must be part of the async play MVP, not a polish task.

---

### Pitfall 10: Scope Creep in the "Generic" Game Engine

**What goes wrong:**
The engine is designed to "support any board game" and accumulates primitives for games that don't exist yet. Deck building is added because someone says "we'll definitely want to support Dominion." Hex grid support is added for Catan. Hidden information zones are over-generalized to support Poker and Battleship. Each addition makes the engine more complex and the Azul implementation more distant. The engine becomes a framework for frameworks, and nothing ships.

**Why it happens:**
Building a generic engine is intellectually satisfying. Every new game primitive feels like progress. The abstract primitives are easier to design than to use — they look good on a whiteboard but are inflexible in practice. The team confuses "making the engine capable" with "making progress toward shipping."

**How to avoid:**
Apply the Three Strikes rule: a primitive is not added until three separate games require it. For v1, the engine contains exactly what Azul needs. For v2, it's extended for game 2's specific needs, with patterns from both games informing the right abstraction. Actively reject engine additions that are not required by the current game. Maintain a "deferred to later" list that captures the idea without acting on it. The engine's API surface area should grow in proportion to the number of shipped games, not the number of imagined games.

**Warning signs:**
- Engine PRs that reference hypothetical future games ("for when we add Catan...")
- Abstraction layers with a single concrete implementation
- "Deferred" feature list longer than the shipped feature list
- Engine documentation covers more features than Azul actually uses

**Phase to address:** Engine Foundation (Phase 1). Write the rule in the engine README: "Azul is the only customer of v1."

---

### Pitfall 11: AI-Generated Game Code With Silent Rule Misimplementations

**What goes wrong:**
The AI creation workflow generates a Dominion implementation that looks correct — it passes happy-path tests, the game is playable — but contains silent rule errors. A card effect that should trigger "once per turn" triggers on each card play. A tiebreaker clause from a community ruling (not the official rulebook) is applied. An edge case when a player's deck runs empty during a draw phase is handled incorrectly, giving the player zero cards instead of reshuffling the discard. These bugs are not caught by automated tests because the tests were written by the same AI that generated the rule misimplementation.

**Why it happens:**
LLMs confidently generate plausible-sounding rule implementations based on training data patterns, not verified rule texts. When AI generates both rules and tests, they share the same misconception. Board game rules are complex, ambiguous in edge cases, and often clarified by designer FAQs that are not in the training data. The AI resolves ambiguity in favor of the most common interpretation, which may be wrong.

**How to avoid:**
Separate AI rule generation from human rule verification. Every generated game implementation requires a human expert review of: (1) all state machine transitions against the physical rulebook, (2) all edge cases the AI identifies as "unclear" against official FAQ/ruling documents, (3) all card/tile effects against a manually authored golden test suite. Structure the AI workflow to produce a "rules discrepancy report" — explicit list of places where the rulebook was ambiguous and what assumption was made. Maintain a golden test suite of known edge cases (deck exhaustion, tie scenarios, last-round triggers) authored by humans independently of the AI output.

**Warning signs:**
- Game tests written by the same AI session that generated the game rules
- No human sign-off on generated rule implementations before QA
- Missing test coverage for game-end conditions and tie scenarios
- AI confidence score reported as "high" for known-ambiguous rules

**Phase to address:** AI Game Creation Toolkit phase. Build human review gates into the creation workflow before any generated game is published.

---

### Pitfall 12: Client-Server Game State Desync Without Detection or Recovery

**What goes wrong:**
The server and client diverge silently. A network hiccup causes the client to miss a state update notification. The client continues displaying the old state while the server has moved on. The player makes a "valid" move based on stale client state, which the server rejects — but the rejection is not clearly communicated. The player sees their move disappear without explanation and retries, creating a confusing loop. In async play, a player opens a game after a day away and sees state from the day before.

**Why it happens:**
WebSocket notifications are fire-and-forget — the server sends a state update, but there is no acknowledgement. A missed notification causes permanent desync for that session. The client trusts its in-memory state rather than re-fetching from the server on reconnection. Error handling for rejected moves shows a generic error rather than a recoverable "state was stale, here's the current state" response.

**How to avoid:**
Treat the server as the single source of truth, always. On every reconnection (page load, WebSocket reconnect, tab becoming visible), the client fetches current state from the server before allowing any interaction. Never apply moves to local state optimistically without a server-first pattern. State update messages from the server include a monotonic sequence number; if the client detects a gap (missed message 4, received 5), it triggers a full state re-fetch. Move rejection responses include the current authoritative state so the client can correct itself in a single round trip rather than requiring a separate fetch. Show the user "Game state refreshed" rather than hiding the correction.

**Warning signs:**
- Client applies moves to local state before server acknowledgement
- WebSocket message handlers do not track sequence numbers
- Move rejection responses return only an error code, not current state
- No re-fetch logic on reconnect (assuming WebSocket will catch up)
- Bugs reported as "my move disappeared" or "the game showed wrong state"

**Phase to address:** Multiplayer Infrastructure phase (Phase 2). Sequence numbers and reconnection re-fetch must be designed into the initial multiplayer protocol.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Monolithic game state as single DynamoDB item | Simple reads/writes | Hits 400 KB limit; all-or-nothing updates cause contention | Never — add versioning and state splitting from day one |
| Hardcoding Azul-specific logic in "engine" layer | Faster Azul delivery | Second game forces engine rewrite | Never — enforce module boundary; Azul logic stays in Azul package |
| Client-side move validation only | Fast UX feel | Cheating; client/server desync | OK for UX hints (legal move highlights), never for enforcement |
| Single Lambda function for all game actions | Simple deployment | Cold start affects all actions; no independent scaling | Acceptable in Phase 1; split by action type in Phase 3 |
| Flat FSM for all game states | Easy to reason about initially | State explosion when simultaneous player actions are needed | Never for multi-player-active states; use parallel statecharts |
| Skip notification preferences at launch | Faster async MVP | Notification fatigue causes early abandonment | Never — ship basic preference (immediate vs daily digest) |
| Canvas 2D only, skip renderer abstraction | 3x faster initial rendering | Impossible to swap renderer later without full rewrite | Never — abstraction must be there from Phase 1 |
| Touch targets < 44px "because they look better" | Cleaner visual design | Tap failures frustrate mobile users immediately | Never for interactive game pieces |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AWS API Gateway WebSocket | Assuming pub/sub broadcast is available natively | API Gateway has no native broadcast; send individual messages per connection ID; store active connection IDs in DynamoDB per game |
| AWS API Gateway WebSocket | Ignoring the 2-hour connection limit | Implement reconnection logic client-side; WebSocket connections expire at 2 hours maximum |
| AWS Lambda (.NET) | No SnapStart configured | Enable SnapStart for all game-facing Lambda functions; reduces cold starts from 2s+ to sub-second |
| DynamoDB | Missing conditional writes for game state | All game state updates must use `ConditionExpression` with version number to prevent lost updates |
| DynamoDB | Ignoring 400 KB item limit | Monitor item sizes in dev; design state schema to stay under 200 KB with headroom |
| iOS PWA push notifications | Assuming push works like Android | iOS requires PWA installed to home screen; push only works via Apple's Web Push API since iOS 16.4; background sync unreliable |
| iOS PWA storage | Trusting IndexedDB for game state cache | iOS can clear IndexedDB after 7 days of inactivity; always re-fetch game state from server on open |
| Email notifications | Sending per-action emails by default | Default to daily digest; per-action emails have high unsubscribe rates in async games |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all game assets eagerly before first render | Blank screen for 5-10 seconds on 4G | Progressive loading: render structure first, stream assets | Even with 5 concurrent users; it's a UX issue not a scale issue |
| Sending full game state on every move | Works fine for Azul (small state); breaks for complex games | Send state delta + sequence number; full state only on reconnect | When state size exceeds 50 KB per message |
| DynamoDB full table scan for "find active games for player X" | Slow queries as game library grows | Design access patterns first; use GSI on `playerId + gameStatus` from day one | 100+ active games per player |
| Querying DynamoDB in Lambda for every WebSocket message | Adds 5-20ms per message | Validate connection ID from DynamoDB on connect; cache in Lambda memory for session duration | Every request at any scale — it's a per-request latency cost |
| Private args in MULTIPLE_ACTIVE_PLAYER BGA-style states | Performance issues when fetching per-player private state | Use sparingly; fetch private state only when needed, not on every state refresh | With 4+ concurrent active players |
| Unoptimized images as PNG without WebP | 2-3x larger payload | Convert all raster assets to WebP; use texture atlases for small pieces | Even at 1 user on mobile — it's a load time issue |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Validating moves client-side only | Any player can inject illegal moves (take extra tiles, skip scoring) | All move validation runs server-side; client validation is UI only |
| Sending all game state to all players | In a hidden-information game, players can read opponents' hands via devtools | Server sends per-player filtered state views; never send information a player shouldn't see |
| No rate limiting on move actions | Scripted clients can make thousands of moves per second, breaking game state or exceeding Lambda concurrency | Rate limit move endpoints per user per game (max moves per second via API Gateway throttling) |
| Trust client-reported sequence numbers | Client can claim any sequence number and trigger invalid state fetches | Server tracks authoritative sequence numbers; client-submitted numbers are validated |
| AI-generated game code without security review | Generated code may expose internal state, skip validation, or allow privilege escalation between players | Code review gate on all AI-generated game script hooks before publishing |
| WebSocket connection ID used as auth token | Connection IDs are predictable; an attacker could spoof another player's connection | Authenticate via JWT on WebSocket connect; associate player identity with connection ID server-side |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual feedback when move is being processed | Player taps twice, move executes twice; player confused why nothing happened | Show immediate optimistic feedback (piece moves) with server reconciliation; disable move controls during pending state |
| Async game auto-timeout fires while player is actively mid-action | Player mid-move gets kicked by timeout; their work is lost | Timeout heartbeat: reset timer whenever player has the game open; only timeout on true inactivity |
| Turn notifications link to game, not to the specific move that needs action | Player opens game, can't find what they need to do | Deep link to the active game state with the required action highlighted |
| Mobile layout requires horizontal scrolling to see full board | Players on phones see half the board; high confusion and drop-off | Design mobile layout as vertical scroll or progressive disclosure; no horizontal scroll in main game view |
| Zoom implemented as page zoom (Ctrl+scroll) rather than in-game zoom | Browser zoom breaks layout; text and UI chrome scale incorrectly | In-game canvas zoom via pinch-to-zoom; browser viewport zoom must be disabled for the game canvas |
| No "undo last action" within a turn (before submitting) | Player fat-fingers a tile placement; it's permanent | Within-turn undo is low cost (just reset client state + re-enable controls); implement it before beta |
| Chat during async play gets buried | Async players communicate about the game; losing messages causes friction | Persist game chat in DynamoDB with the game state; display on game load |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Multiplayer game flow:** Turn transitions look correct — verify that disconnected player auto-timeout works, the timed-out player's turn actually advances, and the remaining players are notified correctly
- [ ] **Renderer abstraction:** Canvas 2D implementation works — verify no renderer-specific types leak into game code by running a second renderer (even a stub) through the same scenes
- [ ] **State serialization:** State round-trips correctly — verify that a game state saved at version N deserializes correctly after a deploy that changes the state schema (break this intentionally in testing)
- [ ] **Mobile zoom:** Game zooms in/out in the game canvas — verify it works on a real iPhone SE (smallest common screen), that pinch-to-zoom does not trigger the browser's native zoom, and that zoomed state persists across tab switches
- [ ] **Async notifications:** Notifications send on turn — verify the notification arrives within 5 minutes, the link deep-links to the correct game state, and the player can unsubscribe from per-game notifications
- [ ] **AI-generated game rules:** Generated code is syntactically correct — verify all edge cases (game end trigger, tiebreaker, last-round scoring) match the physical rulebook by hand
- [ ] **Cold start performance:** Lambda responds quickly in dev — verify with Provisioned Concurrency disabled and simulate a cold start to measure actual p99 latency in staging
- [ ] **iOS PWA push notifications:** Notifications work on Android — verify the notification flow on iOS 16.4+ with the PWA installed to home screen, not just opened in Safari

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Engine built without first game, now misaligned | HIGH | Freeze engine development; implement Azul directly against current engine; record every engine change needed; refactor engine based on real usage, not speculation |
| State schema breaks in-progress games | MEDIUM | Write a one-time migration Lambda that reads all active game states, applies schema transformation, and writes back with new version number; test on staging with production-sized state dump first |
| DynamoDB item exceeds 400 KB | MEDIUM | Migrate to split storage: current state in primary item, action log in separate items keyed by (gameId, actionIndex); client fetches both; requires schema migration Lambda |
| Renderer abstraction is leaky | HIGH | Audit all game code for renderer imports; extract leaking code to renderer-specific adapters; write integration tests that run both renderers; likely requires full game reimplementation if deeply leaky |
| Cold starts degrading sync experience | LOW | Enable Lambda SnapStart (no code changes); add Provisioned Concurrency for WebSocket authorizer Lambda; measure again; if still slow, investigate package size reduction |
| Desync bugs in production | MEDIUM | Add sequence number tracking and gap detection to WebSocket message handler; implement server state re-fetch on any rejected move; add "reload game state" button as user-facing escape hatch |
| Notification fatigue causing churn | LOW | Add digest notification option to user settings; retroactively migrate existing users to digest; monitor unsubscribe rate week-over-week |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Over-engineering engine before first game | Phase 1: Engine Foundation | Azul renders end-to-end before engine is called "done"; no engine primitive without Azul usage |
| State serialization breaks | Phase 1-2: Data Layer | Schema version field present; conditional writes in DynamoDB; deserialization tested across schema versions |
| Multiplayer edge cases | Phase 2: Multiplayer Infrastructure | Automated tests: disconnect mid-move, duplicate move retry, concurrent writes to same game |
| Mobile UX failures | Phase 1: UI Framework | In-game zoom implemented; tested on iPhone SE and iPad; touch targets audited at 44px minimum |
| Leaky renderer abstraction | Phase 1: Engine Foundation | Two renderer implementations (Canvas + stub); no renderer imports in game code |
| Serverless cold start latency | Phase 2: Infrastructure | SnapStart enabled; p99 cold start measured; Provisioned Concurrency for authorizer Lambda |
| State machine complexity explosion | Phase 1: Engine Foundation | Parallel statechart model implemented; simultaneous player phase tested in Azul |
| Asset loading blocking game start | Phase 3: First Game (Azul) | Time-to-first-render under 2 seconds on simulated 4G |
| Async notification fatigue | Phase 3: Async Play | Notification preferences (immediate/digest) ship with async play MVP |
| Engine scope creep | Phase 1-4: All phases | "Three strikes" rule enforced; engine API surface tracked and justified against shipped games |
| AI rule misimplementation | Phase 4: AI Game Creation | Human review gate in workflow; golden test suite for edge cases |
| Client-server desync | Phase 2: Multiplayer Infrastructure | Sequence numbers in protocol; rejected move includes current state; re-fetch on reconnect |

---

## Sources

- BGA Studio documentation (game state machine, guidelines): https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php — MEDIUM confidence (official BGA platform docs)
- Gabriel Gambetta on client-server game architecture and reconciliation: https://www.gabrielgambetta.com/client-server-game-architecture.html — MEDIUM confidence (widely cited authoritative reference)
- Getgud.io on reconnection ability in multiplayer games: https://www.getgud.io/blog/how-to-successfully-create-a-reconnect-ability-in-multiplayer-games/ — LOW confidence (single source, WebSearch only)
- Statecharts.dev on state explosion: https://statecharts.dev/state-machine-state-explosion.html — MEDIUM confidence (cross-verified with XState documentation)
- AWS documentation on Lambda cold starts and SnapStart: https://aws.amazon.com/blogs/compute/understanding-and-remediating-cold-starts-an-aws-lambda-perspective/ — HIGH confidence (official AWS documentation)
- AWS API Gateway WebSocket limits: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html — HIGH confidence (official AWS documentation)
- Ably on scaling API Gateway WebSocket APIs (no native broadcast): https://ably.com/topic/scaling-aws-api-gateway-websocket-apis — MEDIUM confidence (vendor docs, verified against API Gateway docs)
- iOS PWA limitations (storage clearing, push notifications): https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide — MEDIUM confidence (multiple corroborating sources)
- iLogos on mobile game design mistakes: https://ilogos.biz/mobile-game-design-mistakes — LOW confidence (industry blog, WebSearch only)
- Simon Willison on LLM hallucinations in code: https://simonwillison.net/2025/Mar/2/hallucinations-in-code/ — MEDIUM confidence (widely referenced, credible author)
- DynamoDB item 400 KB limit and gaming use cases: https://dynobase.dev/dynamodb-use-cases/ and AWS official DynamoDB docs — HIGH confidence
- Game Developer article on real reasons not to build custom engines in 2024: https://www.gamedeveloper.com/programming/real-reasons-not-to-build-custom-game-engines-in-2024 — LOW confidence (WebSearch only)
- Wayline.io on async multiplayer design: https://www.wayline.io/blog/asynchronous-multiplayer-reclaiming-time-mobile-gaming — LOW confidence (single source, WebSearch only)
- Serialization for games (long-term persistence pitfalls): https://michaelbitzos.com/devblog/demystifying-game-persistence — LOW confidence (single source, WebSearch only)

---
*Pitfalls research for: Digital board game platform (BGA competitor) with AI-powered game creation*
*Researched: 2026-02-28*
