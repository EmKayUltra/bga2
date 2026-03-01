# Architecture Research

**Domain:** Digital Board Game Platform (BGA Competitor)
**Researched:** 2026-02-28
**Confidence:** MEDIUM (patterns well-established; specific BGA internals are inferred from public docs, not source code)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER (Browser/PWA)                          │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│   Player UI Shell    │   Game Renderer      │   Creation Tool (local app)   │
│  (lobby, profiles,   │  (Canvas 2D / WebGL  │  (C# desktop, git-based,      │
│   match history)     │   / Godot WASM)      │   LLM-assisted pipeline)      │
│                      │        │             │                               │
│                      │  Renderer Interface  │                               │
│                      │  (abstraction layer) │                               │
│                      │        │             │                               │
│                      │  Game Client Logic   │                               │
│                      │  (legal move hints,  │                               │
│                      │   animations, input) │                               │
└──────────────────────┴─────────┬────────────┴───────────────────────────────┘
                                 │ WebSocket (sync games) / HTTP (async moves)
┌────────────────────────────────┴────────────────────────────────────────────┐
│                          AWS EDGE / API LAYER                               │
│   CloudFront (CDN + static assets)   API Gateway (REST + WebSocket APIs)   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┴────────────────────────────────────────────┐
│                        SERVERLESS COMPUTE (AWS Lambda + C#)                 │
├─────────────────┬───────────────────┬──────────────────┬────────────────────┤
│  Game Service   │  Lobby / Match    │  Notification    │  Auth / User       │
│  (state machine,│  Service          │  Service         │  Service           │
│  move validation│  (matchmaking,    │  (push, email,   │  (accounts,        │
│  rules engine)  │  room lifecycle)  │   WebSocket push)│   subscriptions)   │
└────────┬────────┴───────────────────┴──────────────────┴────────────────────┘
         │
┌────────┴─────────────────────────────────────────────────────────────────────┐
│                           PERSISTENCE LAYER                                  │
│   DynamoDB (game state, connections, sessions)   S3 (assets, game packages) │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Player UI Shell | Lobby, browse games, match history, profiles, subscription management | Svelte SPA, talks to REST API |
| Game Renderer | Draws board/pieces/animations on screen; no rules logic | Canvas 2D or WebGL canvas element; swappable via Renderer Interface |
| Renderer Interface | Decouples game logic from rendering API; enables Canvas→WebGL→Godot swaps | TypeScript interface: `IRenderer` with methods like `drawPiece()`, `animateMove()`, `highlight()` |
| Game Client Logic | UX-only intelligence: legal move indicators, optimistic animation, input routing | Pure functions consuming server game state; never mutates authoritative state |
| Game Service (Lambda) | Authoritative rules engine; validates moves against state machine; mutates game state | C# Lambda; loads game definition package from S3; runs state machine; writes to DynamoDB |
| Game State Machine | Tracks what phase/turn the game is in; determines valid actions | Hierarchical FSM: `Game → Phase → Turn → Stage`; defined in game definition package |
| Lobby / Match Service | Create/join games, matchmaking, async game lifecycle | C# Lambda; DynamoDB for room records |
| Notification Service | Alert players on their turn (async games); in-game push for sync games | API Gateway WebSocket push + SNS/SES for email/push notifications |
| Auth / User Service | Accounts, sessions, subscriptions | Cognito or custom JWT; DynamoDB for user records |
| Game Package (S3) | Versioned bundle: game data (JSON) + script hooks (compiled C# or JS) | One S3 prefix per game version; loaded by Game Service Lambda on cold start |
| Asset CDN (CloudFront+S3) | Serves static game art: boards, cards, tiles, tokens | S3 origin; webp/PNG sprite sheets; max 4096×4096 per sprite |
| Creation Tool | Local-first C# app; ingests source materials; calls LLM; outputs game packages | Desktop app with hot-reload; git-versioned output; produces game package artifacts |

---

## Recommended Project Structure

```
bga2/
├── src/
│   ├── engine/                  # Shared game engine core
│   │   ├── state-machine/       # FSM runtime (phase/turn/stage management)
│   │   ├── rules-runner/        # Executes game hook functions against state
│   │   ├── primitives/          # Zone, Piece, Deck, Player, Board types
│   │   └── engine.ts            # Engine entry point; wires state machine + rules runner
│   │
│   ├── renderer/                # Rendering layer (isolated from engine)
│   │   ├── IRenderer.ts         # Renderer interface contract
│   │   ├── canvas2d/            # Canvas 2D implementation
│   │   ├── webgl/               # WebGL implementation (later)
│   │   └── godot-wasm/          # Godot WASM bridge (later)
│   │
│   ├── client/                  # Browser client
│   │   ├── ui/                  # Svelte components (lobby, profiles, settings)
│   │   ├── game-view/           # Game session UI; connects engine + renderer
│   │   ├── api/                 # HTTP + WebSocket client wrappers
│   │   └── pwa/                 # Service worker, manifest, offline shell
│   │
│   └── game-packages/           # Game definitions (data + hooks)
│       └── azul/
│           ├── azul.game.json   # Game data (board layout, piece types, rules config)
│           └── azul.hooks.ts    # Script hooks (onTurnStart, validateMove, onScore, etc.)
│
├── backend/                     # C# Lambda functions
│   ├── GameService/             # Move validation, state machine runner
│   ├── LobbyService/            # Room management, matchmaking
│   ├── NotificationService/     # WebSocket push, email/SNS triggers
│   └── AuthService/             # User accounts, JWT, subscriptions
│
├── infra/                       # AWS CDK or SAM templates
│   ├── api-gateway.ts           # REST + WebSocket API definitions
│   ├── dynamodb.ts              # Table schemas
│   ├── cloudfront.ts            # CDN + asset serving
│   └── lambda.ts                # Function deployments
│
└── creation-tool/               # Local-first game creation tool (C#)
    ├── Ingestion/               # PDF/image/text rulebook parser
    ├── LlmPipeline/             # LLM orchestration (spec → data → hooks)
    ├── HotReload/               # File watcher; push game package to local test server
    └── Cli/                     # CLI entry point
```

### Structure Rationale

- **engine/:** Pure logic, no rendering, no network — can run server-side in Lambda or client-side in browser. Test in isolation.
- **renderer/:** All rendering behind `IRenderer` interface. Swap implementations without touching engine or game hooks.
- **game-packages/:** Each game is a self-contained data + hooks bundle. Engine loads and runs it. This is the "games as data" model.
- **backend/:** C# Lambdas mirror the frontend engine logic for server-side validation. Share DTOs/types via a shared contracts package.
- **creation-tool/:** Completely separate from the platform runtime. Outputs game packages that are then deployed to S3.

---

## Architectural Patterns

### Pattern 1: Game Definition as Data + Hooks

**What:** A game is represented as two artifacts: (1) a JSON data file describing static game facts (board layout, piece types, zones, initial state, turn structure config), and (2) a script hooks file with functions the engine calls at defined points (setup, validateMove, onMoveApplied, onTurnEnd, onPhaseEnd, endCondition, scoring).

**When to use:** Always — this is the foundational separation that makes the engine genre-agnostic. BGA uses PHP classes; boardgame.io uses JS objects with named move functions; this platform should use a JSON + compiled hook bundle.

**Trade-offs:** Hooks must be sandboxed (security concern when community creation opens up). JSON data is easily machine-generated by the AI pipeline. Hook functions are the hard part for LLMs to get right.

**Example (game definition contract):**
```typescript
// azul.game.json (data — LLM-generated, human-reviewed)
{
  "id": "azul",
  "version": "1.0.0",
  "minPlayers": 2,
  "maxPlayers": 4,
  "zones": [
    { "id": "factory-display", "count": 5, "capacity": 4, "public": true },
    { "id": "center-pool", "count": 1, "capacity": -1, "public": true },
    { "id": "player-board", "count": "perPlayer", "public": "owner" }
  ],
  "pieceTypes": [
    { "id": "tile", "variants": ["blue", "yellow", "red", "black", "white", "first-player"] }
  ],
  "phases": ["drafting", "tiling", "scoring"],
  "turnStructure": { "activePlayer": "sequential", "passAfterMove": false }
}

// azul.hooks.ts (behavior — LLM-assisted, human-verified)
export const hooks: GameHooks = {
  setup(ctx): GameState { /* initialize factories, bags */ },
  validateMove(state, move, player): ValidationResult { /* check legality */ },
  onMoveApplied(state, move): GameState { /* update state */ },
  onTurnEnd(state): GameState { /* check phase transition */ },
  onPhaseEnd(state): { nextPhase: string; state: GameState } { /* score, refill */ },
  endCondition(state): { winner: string } | null { /* check wall completion */ },
};
```

### Pattern 2: Hierarchical Finite State Machine for Turn Structure

**What:** Game state machine with four nested levels: Game (started/ended) → Phase (drafting/tiling/scoring) → Turn (whose turn, turn number) → Stage (what action is currently valid). BGA uses this exact model in states.inc.php. boardgame.io calls them phases/turns/stages.

**When to use:** For any game with multiple phases or complex turn structure. Even simple games benefit from explicit state because it prevents illegal actions and makes the game's flow self-documenting.

**Trade-offs:** More upfront design work. Pays off enormously in debuggability — you always know what state the game is in. Necessary for server-side validation.

**Example:**
```typescript
// State machine definition (in game data JSON)
{
  "stateMachine": {
    "states": {
      "GAME_SETUP":     { "type": "auto", "action": "setup",         "next": "DRAFT_PICK" },
      "DRAFT_PICK":     { "type": "activePlayer", "moves": ["pickTiles"], "next": "CHECK_DRAFT_DONE" },
      "CHECK_DRAFT_DONE": { "type": "auto", "action": "checkDraftDone", "branches": {
        "done": "TILING_PHASE", "continue": "DRAFT_PICK"
      }},
      "TILING_PHASE":   { "type": "multiPlayer", "moves": ["placeTile"], "next": "SCORING" },
      "SCORING":        { "type": "auto", "action": "score",          "next": "CHECK_GAME_END" },
      "CHECK_GAME_END": { "type": "auto", "action": "checkEnd",       "branches": {
        "over": "GAME_END", "continue": "DRAFT_PICK"
      }},
      "GAME_END":       { "type": "terminal" }
    }
  }
}
```

### Pattern 3: Server-Authoritative State with Event Log

**What:** The server is the single source of truth. Clients submit actions (commands) not state changes. The server validates the action against the state machine and game rules, applies it to the canonical state, records the event in an append-only log, then broadcasts the new state (or delta) to all connected clients.

**When to use:** Always — this is non-negotiable for cheating prevention. For turn-based games this is low-latency overhead (no real-time physics to reconcile). Clients can show optimistic UI for animations only, never for state.

**Trade-offs:** Adds round-trip latency for every move, but turn-based games tolerate this easily (100-500ms is fine). The event log enables replay, debugging, dispute resolution, and potential future spectator mode.

**Example (server command flow):**
```
Client: POST /games/{gameId}/moves { type: "pickTiles", factoryId: 2, color: "blue" }
Server:
  1. Load game state from DynamoDB
  2. Validate: is player active? Is move legal per state machine?
  3. Apply: run onMoveApplied hook → new state
  4. Persist: write new state + event record to DynamoDB (atomic transaction)
  5. Broadcast: push state delta via WebSocket to all players in game
  6. Return: 200 OK with new game state snapshot
```

### Pattern 4: Renderer Interface (Strategy Pattern)

**What:** Define an `IRenderer` interface with all rendering operations as methods. Game client logic calls only the interface — never the concrete renderer. Swap implementations by injecting a different renderer.

**When to use:** From day one. Starting with Canvas 2D behind the interface costs nothing extra and unlocks future swaps to WebGL or Godot WASM without touching game logic.

**Trade-offs:** Slightly more abstraction to design upfront. Interface must be general enough to handle Canvas 2D and WebGL semantics — avoid leaking renderer-specific concepts into the interface.

**Example:**
```typescript
// IRenderer.ts
interface IRenderer {
  drawBoard(layout: BoardLayout): void;
  drawPiece(piece: Piece, position: Position): void;
  animateMove(piece: Piece, from: Position, to: Position): Promise<void>;
  highlightZone(zoneId: string, style: HighlightStyle): void;
  clearHighlights(): void;
  resize(width: number, height: number): void;
}

// canvas2d/Canvas2DRenderer.ts — implements IRenderer using CanvasRenderingContext2D
// webgl/WebGLRenderer.ts      — implements IRenderer using WebGL commands
// godot-wasm/GodotRenderer.ts — implements IRenderer calling Godot WASM exports
```

### Pattern 5: WebSocket Connection Management (Serverless)

**What:** API Gateway WebSocket API manages persistent connections without keeping Lambda alive. Three Lambda handlers: `$connect` (store connectionId + playerId in DynamoDB), `$disconnect` (remove record, mark player offline), `$default` (route messages). A separate "broadcaster" Lambda is triggered by DynamoDB Streams or EventBridge when game state changes, and pushes state updates to all connected players in a game.

**When to use:** This is the recommended pattern for serverless turn-based multiplayer on AWS. Avoids EC2 for WebSocket server. Handles variable load automatically.

**Trade-offs:** Cold starts on WebSocket handlers add latency on first connection. DynamoDB connection table needs TTL cleanup for stale connections. Cost scales with connection-minutes (cheaper than persistent servers for low traffic, but watch costs at scale).

**Example (connection flow):**
```
Player connects → API Gateway → $connect Lambda → DynamoDB: { connectionId, gameId, playerId, ttl }
Move submitted → GameService Lambda → DynamoDB: write new game state
                                    → EventBridge event: { gameId, stateVersion }
                                    → Broadcaster Lambda: query DynamoDB for game connections
                                                        → push to each connectionId via Management API
Player disconnects → $disconnect Lambda → DynamoDB: remove connectionId
```

### Pattern 6: Async Play Architecture

**What:** Async games persist state between sessions. When a player is not connected, the server still holds game state in DynamoDB. When it's a player's turn, the Notification Service sends a push notification (web push via service worker) or email. Players reconnect, load current state via REST, take their turn, disconnect. No WebSocket required for async — HTTP suffices. WebSocket is an enhancement for real-time presence.

**When to use:** All games should support async play from the start. Sync play (with WebSocket for real-time state push) is built on the same foundation.

**Trade-offs:** Turn timers need a scheduled Lambda (EventBridge cron or Step Functions) to enforce deadlines and auto-skip. Notification delivery across web push + email adds operational complexity.

**Example (async state model in DynamoDB):**
```
GameTable: {
  gameId (PK),
  currentState: { ... full game state JSON },
  eventLog: [...],          // append-only (or separate EventLog table)
  currentPlayerId,
  turnDeadline (ISO8601),   // for deadline enforcement
  status: "active" | "waiting" | "completed",
  playerConnections: [{ playerId, notificationToken, email }]
}
```

### Pattern 7: AI Creation Pipeline Artifact Format

**What:** The creation tool's pipeline produces game packages as the final artifact: a versioned S3 bundle containing `game.json` (data) and `hooks.js` (compiled script). The pipeline stages are: (1) Ingest — parse rulebook/PDF/images into structured text; (2) Spec — LLM generates a `game-spec.json` (human-reviewable structured specification); (3) Codify — LLM generates `game.json` data and `hooks.ts` from spec; (4) Test — hot-reload against local engine, validate with test scenarios; (5) Package — compile hooks, bundle, upload to S3.

**When to use:** This is the LLM pipeline's contract with the engine. The engine only knows about the game package format — it doesn't care how the package was produced.

**Trade-offs:** The spec intermediate artifact (stage 2) is critical — it's where human review happens before code generation. Without it, LLM errors in hooks are hard to trace. The hook sandbox must be ready before community creation opens.

**Example (pipeline stages):**
```
[Source Materials]
  rulebook.pdf, card-art.zip, errata.txt
       │
       ▼ (1) Ingestion (C# parser + vision LLM for images)
[Structured Text]
  rules-extracted.md, components-list.json
       │
       ▼ (2) Spec Generation (LLM: Claude / GPT-4o)
[game-spec.json]  ← human review checkpoint
  { zones, pieceTypes, phases, turnStructure, winCondition, scoringRules }
       │
       ▼ (3) Code Generation (LLM with game spec + hook interface contract)
[game.json + hooks.ts]
       │
       ▼ (4) Hot-Reload Test (local engine, automated scenario runner)
[Test Results]  ← iterate until passing
       │
       ▼ (5) Package + Deploy
[S3: games/azul/v1.0.0/game.json, hooks.js]
```

---

## Data Flow

### Sync Play: Move Submission Flow

```
[Player Input (click)]
    │
    ▼
[Game Client Logic]
  Checks: is UI in valid input state? (not waiting for animation)
  Sends: POST /games/{gameId}/moves { type, ...params }
    │
    ▼ HTTP
[API Gateway REST] → [GameService Lambda (C#)]
  1. Auth: validate JWT, confirm player identity
  2. Load: DynamoDB.GetItem(gameId) → current GameState
  3. Validate: StateMachine.CanApply(state, move, player)
             + GameHooks.ValidateMove(state, move)
  4. Apply: GameHooks.OnMoveApplied(state, move) → newState
  5. Persist: DynamoDB.TransactWrite([
               PutItem(GameState=newState),
               PutItem(EventLog entry)
             ])
  6. Notify: EventBridge.PutEvent({ gameId, version })
    │
    ▼ (async, within ~100ms)
[Broadcaster Lambda]
  Queries DynamoDB: all connectionIds for gameId
  For each: API Gateway Management API PostToConnection(stateSnapshot)
    │
    ▼ WebSocket push
[Other Player Clients]
  Game Client Logic receives new state
  Renderer Interface: animate changes, redraw board
```

### Async Play: Turn Notification Flow

```
[GameService Lambda applies move]
    │
    ▼
[DynamoDB write: status="waiting", currentPlayerId=next, turnDeadline=+24h]
    │
    ▼ DynamoDB Stream / EventBridge
[NotificationService Lambda]
  Player connected? → push via WebSocket
  Player offline?   → Web Push (service worker) + email
    │
    ▼
[Player receives notification]
  Opens PWA → GET /games/{gameId}/state → loads current state
  Takes turn → POST /games/{gameId}/moves
```

### Asset Loading Flow

```
[Game View Mount]
    │
    ▼
[Game Client Logic: load game package]
  GET /packages/{gameId}/{version}/game.json → CloudFront → S3
  GET /packages/{gameId}/{version}/assets/   → CloudFront → S3
  Load sprite sheets (PNG/webp, max 4096×4096)
  Parse game.json: initialize board layout, piece types, zones
    │
    ▼
[Renderer Interface: initialize canvas]
  drawBoard(layout)  ← from game.json board config
  drawPiece(...)     ← for each piece in initial game state
```

### AI Pipeline: Source to Package Flow

```
[Creation Tool CLI: create-game --source ./azul-materials/]
    │
    ▼ (local, runs on developer machine)
[Ingestion Module]
  PDF parser → extracted rules text
  Vision LLM API → component descriptions from card images
    │
    ▼
[Spec Generator (LLM call)]
  Prompt: rules text + component list + game-spec.json schema
  Output: game-spec.json (structured, human-readable)
  ** Human reviews and edits spec here **
    │
    ▼
[Code Generator (LLM call)]
  Prompt: game-spec.json + hooks.ts interface contract + examples
  Output: game.json + hooks.ts (draft)
  ** Hot-reload: local engine loads and runs test scenarios **
  ** Human iterates on hooks until tests pass **
    │
    ▼
[Packager]
  TypeScript compile: hooks.ts → hooks.js
  Bundle: { game.json, hooks.js, assets/ }
  Upload: aws s3 sync ./dist/ s3://bga2-games/{gameId}/{version}/
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | All Lambda + DynamoDB + S3 as described. WebSocket broadcaster scans DynamoDB linearly. Fine at this scale. |
| 1k-10k users | Add DynamoDB GSI for game-to-connections lookup (avoid table scans). CloudFront cache hit rate optimization. DynamoDB on-demand billing adequate. |
| 10k-100k users | Consider Lambda provisioned concurrency to eliminate cold starts on WebSocket handlers. Separate DynamoDB tables per concern (connections, game state, event log). |
| 100k+ users | Introduce Redis/ElastiCache for hot game state cache (avoid DynamoDB read per move). Consider Kinesis for event log at high volume. Step Functions for async deadline orchestration at scale. |

### Scaling Priorities

1. **First bottleneck:** DynamoDB connection table scans in broadcaster Lambda. Fix by adding GSI `gameId → connectionId` from day one.
2. **Second bottleneck:** Lambda cold starts on WebSocket handlers (delays first connection). Fix with provisioned concurrency for WebSocket routes.
3. **Third bottleneck:** S3/CloudFront cache misses for game assets on initial load. Fix with aggressive cache headers and sprite sheet optimization.

---

## Anti-Patterns

### Anti-Pattern 1: Rules Logic in the Client

**What people do:** Implement move validation, turn advancement, and scoring in the browser to make the game feel responsive. Skip server validation or treat it as advisory.

**Why it's wrong:** Any client-side rule logic can be bypassed by a motivated cheater. Move validation in the browser is UX enhancement only — the server must be the authority. Duplicating complex rules in two places (client + server) creates drift and bugs.

**Do this instead:** All authoritative rule logic lives in the Game Service Lambda. The client holds UX-only logic: highlight legal moves (computed from server-provided valid actions list), animate moves, show UI feedback. Server sends `validMoves[]` in state snapshot so client can display hints without re-implementing rules.

### Anti-Pattern 2: Game Logic Coupled to the Renderer

**What people do:** Call `canvas.drawRect()` or WebGL commands directly inside game logic functions (state machine handlers, move validators, hook functions).

**Why it's wrong:** When the renderer needs to change (Canvas 2D → WebGL → Godot WASM), all game logic must be rewritten. Also breaks server-side validation — the Lambda cannot run browser canvas APIs.

**Do this instead:** All rendering is behind `IRenderer`. Game logic emits events or returns state snapshots. The renderer subscribes and translates state into draw calls. Server-side code never imports anything renderer-related.

### Anti-Pattern 3: One Monolithic Game Lambda

**What people do:** Put all game logic (all games) into a single Lambda function that switches on game type.

**Why it's wrong:** All games share the same cold start overhead and deployment cycle. One game's hooks bug takes down all games. Can't version games independently.

**Do this instead:** Game Service Lambda loads the game package (data + hooks) from S3 at runtime based on `gameId`. Each game is independently versioned and deployed. Lambda is the engine; games are plugins loaded dynamically.

### Anti-Pattern 4: Storing Full State in Every Event Log Entry

**What people do:** Append the entire game state JSON to every event log record.

**Why it's wrong:** DynamoDB item size limit is 400KB. Large game states (many pieces, complex boards) hit this quickly. Event log grows without bound.

**Do this instead:** Event log stores commands (the move submitted) and metadata (player, timestamp, state version). Full state snapshots stored separately in the game record, or periodic checkpoints. Replay by re-running commands from last checkpoint.

### Anti-Pattern 5: Async Game Notifications via Polling

**What people do:** Client polls `GET /games/{gameId}/state` every 5 seconds to detect it's their turn.

**Why it's wrong:** Wasteful Lambda invocations, unnecessary DynamoDB reads, and costs scale with number of open games × polling frequency. 5s delay feels sluggish.

**Do this instead:** WebSocket push for connected clients. Web Push (service worker) for offline clients. Fallback to email for long-dormant players. Polling is only a fallback for environments where WebSocket is blocked.

### Anti-Pattern 6: Tight Coupling Between AI Pipeline and Engine Runtime

**What people do:** Creation tool generates code that directly imports engine internals, or engine runtime calls back into creation-tool infrastructure.

**Why it's wrong:** Creation tool changes break the runtime. Runtime changes break tool output. Creates a maintenance nightmare.

**Do this instead:** Strict interface contract: creation tool produces the game package format (game.json + hooks.js). Engine consumes only the package format. The contract (hook function signatures, game.json schema) is the only coupling point. Version the contract schema.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| AWS API Gateway (REST) | HTTP to Lambda via proxy integration | Game state reads/writes, lobby operations |
| AWS API Gateway (WebSocket) | WebSocket routes to Lambda ($connect, $disconnect, $default) | Real-time game state push |
| DynamoDB | AWS SDK from Lambda (C#) | Game state, connections, user data, event log |
| S3 | AWS SDK for game packages; CloudFront for client asset serving | Game bundles, board art, card images |
| CloudFront | Static file serving with cache headers | PWA shell, game assets, game packages (JSON) |
| LLM APIs (Claude / GPT-4o) | HTTP from creation tool (local machine) | Spec generation, hook generation — not in runtime path |
| Web Push API | Service worker on client; Push Service (browser vendor) | Async turn notifications for offline players |
| SES / SNS | Lambda to SES/SNS SDK | Email notifications for async game turns |
| AWS Cognito (or custom JWT) | Lambda authorizer on API Gateway | Auth for all API calls |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Client Game Logic ↔ Renderer | `IRenderer` interface method calls | No direct renderer import in game logic |
| Client ↔ Game Service | HTTP REST (moves) + WebSocket (state push) | Game logic on server; client sends commands |
| Game Service Lambda ↔ Game Package | Dynamic load from S3 at Lambda init | Game package is a versioned plugin; engine is host |
| Game Service ↔ DynamoDB | AWS SDK; transactional writes for state + event log | Atomic: state update + event must succeed together |
| Game Service ↔ Notification Service | EventBridge event on state change | Decoupled; notification delivery is best-effort |
| Creation Tool ↔ Engine | Game package format (JSON schema + hook interface) | Only coupling point; version controlled |
| Creation Tool ↔ LLM APIs | HTTP (runs on developer machine, not in production) | LLM is in the creation pipeline only |

---

## Build Order Implications

The component dependencies establish a mandatory build order. Each phase unblocks the next.

```
Phase 1 — Foundation (blocks everything else)
  ├── Engine primitives (Zone, Piece, Board, GameState types)
  ├── State machine runtime (FSM evaluator)
  ├── Game hook interface contract (TypeScript interface + JSON schema)
  └── IRenderer interface

Phase 2 — First Playable (needs Phase 1)
  ├── Canvas 2D Renderer (implements IRenderer)
  ├── Game Service Lambda (C#: load package, validate move, apply hooks, persist)
  ├── DynamoDB schemas (game state, connections, event log)
  ├── REST API (move submission, state load)
  └── Azul game package (first proof of the engine)

Phase 3 — Multiplayer (needs Phase 2)
  ├── API Gateway WebSocket API
  ├── WebSocket Lambda handlers ($connect/$disconnect/broadcaster)
  ├── Lobby Service (create/join game, matchmaking)
  └── Game Client WebSocket integration

Phase 4 — Async Play (needs Phase 3)
  ├── Notification Service (Web Push + email)
  ├── Turn deadline scheduler (EventBridge cron)
  └── Async game state model (status, turnDeadline fields)

Phase 5 — Creation Tool (can parallel-track with Phase 3)
  ├── Ingestion module (PDF/text/image parser)
  ├── LLM pipeline (spec → data → hooks)
  ├── Hot-reload test harness
  └── Packager + S3 deploy

Phase 6 — Player Platform (needs Phase 3)
  ├── Player UI Shell (lobby, profiles, match history)
  ├── PWA manifest + service worker
  └── Subscription / payment integration

Phase 7 — Polish + Second Renderer (needs Phase 1)
  ├── WebGL Renderer or Godot WASM bridge (implements IRenderer)
  └── Renderer swap validation (same game package, different renderer)
```

---

## Sources

- BGA Studio documentation — state machine and file structure: [BGA Studio](https://en.boardgamearena.com/doc/Studio), [BGA State Machine](https://en.boardgamearena.com/doc/Your_game_state_machine:_states.inc.php) — MEDIUM confidence (public doc, inferred from wiki)
- boardgame.io framework architecture — game object, moves, phases, turns: [boardgame.io](https://boardgame.io/documentation/), [Beginner's Guide](https://jhcheung.medium.com/beginners-guide-to-boardgame-io-19dd6c5c9977) — HIGH confidence (open source, verified)
- Game Programming Patterns — State pattern, pushdown automata: [Game Programming Patterns](https://gameprogrammingpatterns.com/state.html) — HIGH confidence (canonical reference)
- Server-authoritative architecture — Gabriel Gambetta's series: [Client-Server Game Architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html) — HIGH confidence (widely cited)
- AWS serverless WebSocket game architecture: [AWS API Gateway WebSocket Tutorial](https://binaryheap.com/websocket-api-gateway/), [Serverless Game Backend](https://docs.aws.amazon.com/wellarchitected/latest/games-industry-lens/serverless-based-game-backend-architecture.html) — HIGH confidence (AWS official)
- Renderer abstraction / Strategy pattern: [Rendering with a Strategy](https://logantharvell.github.io/rendering-abstraction-dev-diary-6/), [Modern Rendering Abstraction](https://alextardif.com/RenderingAbstractionLayers.html) — MEDIUM confidence (blog posts, well-reasoned)
- Boardwalk LLM framework for board game code generation: [Boardwalk arXiv](https://arxiv.org/html/2508.16447v1) — MEDIUM confidence (research paper, 2025)
- BGA asset pipeline conventions: [BGA Game Art](https://en.boardgamearena.com/doc/Game_art:_img_directory) — MEDIUM confidence (public doc)
- Turn-based game architecture patterns: [Turn-Based Architecture Guide](https://outscal.com/blog/turn-based-game-architecture) — LOW confidence (single source, blog)
- CQRS/Event sourcing for game state: [Event Sourcing and CQRS](https://mia-platform.eu/blog/understanding-event-sourcing-and-cqrs-pattern/) — MEDIUM confidence (pattern widely validated, game-specific application is LOW)

---

*Architecture research for: Digital Board Game Platform (BGA Competitor)*
*Researched: 2026-02-28*
