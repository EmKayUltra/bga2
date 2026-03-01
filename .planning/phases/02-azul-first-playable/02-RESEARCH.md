# Phase 2: Azul + First Playable - Research

**Researched:** 2026-03-01
**Domain:** Game logic implementation (Azul rules), SvelteKit routing, simple session identity
**Confidence:** HIGH — primary findings are from direct codebase inspection and verified engine contracts

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hot-seat turn flow**
- Open board for Azul — all information is shared, no need to hide anything between turns
- However, the turn-handoff system must be generic enough to support pass-and-play screens for games with hidden information (future games). Azul just happens to not need it.
- Active player indicated by BOTH: a banner/toast announcing turn change AND the active player's board visually highlighted throughout their turn
- 2-4 player support (full Azul spec) — factory count scales with player count (5/7/9 factories for 2/3/4 players)
- Game end shows a score summary screen with full breakdown: wall tiles, row bonuses, column bonuses, color set bonuses, floor penalties. Winner announced. Option to start a new game.

**Move interaction UX**
- Tap-to-select, then tap destination: player taps a tile in a factory (selects all tiles of that color), then taps a pattern line row to place them. Two-step source → target flow.
- Invalid moves handled with prevent + explain: only highlight legal destinations. When hovering/long-pressing a disabled option, show a tooltip/reason ('This line already has blue tiles'). Most informative approach.
- Smooth animations when tiles move: tiles slide from source to destination with easing. AzulScene already has animatePiece() with easeOutBack — wire it to real moves.
- Floor line overflow: auto-overflow by default (excess tiles automatically go to floor line with animation). Opt-in warning prompt available — if enabled, show 'N tiles will go to the floor line — proceed?' before applying. Default is auto (no prompt).

**Player identity & auth**
- Simple name entry for Phase 2: players type their names before starting a game. No accounts, no passwords.
- Upgrade path to full sign-up/login: the data model should accommodate future auth (email/password, sessions, user records) without requiring a painful migration. Don't build the auth now, but don't paint into a corner.
- No persistent browser identity beyond the game — just player names per game. Phase 3 multiplayer will introduce real user identity.

**Game resumability**
- Games resumable via URL: game session lives at /game/{sessionId}. Bookmark or share the URL to return. State is in PostgreSQL, client re-fetches on load.
- ALSO resumable via game list: a simple page listing active/completed games. Since there's no user identity, this is likely a localStorage list of recently played game IDs.
- New game creation via BOTH: a landing page with a 'Start New Azul Game' button (clean entry point for first impression) AND direct URL/API creation for developer convenience.

**Azul rule completeness**
- Full Azul scoring: adjacency bonuses (horizontal + vertical neighbors when placing wall tile), end-game bonuses for complete rows (+2), complete columns (+7), all 5 of one color (+10), floor line penalties (-1/-1/-2/-2/-2/-3/-3)
- All edge cases implemented: first-player token (goes to center, taken by first player to pick from center, that player starts next round), factory exhaustion (round ends when all factories and center are empty), tied game tiebreak (most complete horizontal rows wins)
- Full 2-4 player support with correct factory counts and per-player boards

### Claude's Discretion
- Exact tooltip/explain UI implementation for invalid moves (popover vs inline text vs toast)
- Score summary screen layout and visual design
- Animation timing and easing curves beyond what exists
- How the "opt-in overflow warning" preference is stored/toggled
- Landing page visual design

### Deferred Ideas (OUT OF SCOPE)
- Real user authentication (email/password, OAuth) — Phase 3 when multiplayer needs it
- AI opponents — explicitly out of scope per PROJECT.md
- Spectator mode — Phase 6
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AZUL-01 | Azul drafting phase — select tiles from shared factories | hooks.ts getValidMoves + onMove stubs fully understand the contract; factory/center zone IDs already defined in game config |
| AZUL-02 | Azul tiling phase — place tiles on pattern lines and wall | onRoundEnd stub documents the full pipeline; per-player zones (player-pattern-line-N, player-wall, player-floor-line) exist in game config |
| AZUL-03 | Azul scoring — per-round and end-game scoring with all rules | Scoring is inside onRoundEnd; GameState.players[].score is the aggregation point; end-game bonus logic maps directly onto state.players[].data wall grid |
| AZUL-04 | Azul supports 2-4 players with correct component counts | GameState.players[] is already variadic; factory count (5/7/9) must be derived from players.length at game creation; CreateGame endpoint needs player name input |
| AZUL-05 | All Azul edge cases handled (floor line overflow, factory exhaustion, first player token) | First-player token defined as a piece in game config; floor line overflow is a client UX + server state concern; factory exhaustion triggers ROUND_END |
| PLAT-01 | User can sign up, log in, and maintain session across browser refresh | Decided: simple name entry (no auth). Session is the game session ID in the URL + localStorage game list. Server state in PostgreSQL survives restart. |
</phase_requirements>

---

## Summary

Phase 2's primary work is implementing the Azul game hook logic (`libs/games/azul/src/hooks.ts`) and wiring the client to support multi-player turn management, a meaningful landing/lobby flow, and game resumption. The engine, server infrastructure, and client rendering scaffold are all in place from Phase 1 — the stubs explicitly mark every implementation target.

The largest single unit of work is the Azul hooks implementation: `getValidMoves`, `onMove`, and `onRoundEnd`. These three functions encode all Azul rules and must run correctly inside Jint (the C# in-process JS engine). The HookExecutor already strips TypeScript annotations before execution, but Phase 2 must ensure the hook code uses only ES5-compatible patterns that Jint supports reliably. Wall-tiling scoring (adjacency calculation) and end-game bonus detection are the most algorithmically complex pieces.

On the client side, four changes drive the rest of the UX: (1) SceneManager needs per-player turn tracking instead of the hardcoded `player-1` identity; (2) AzulScene needs per-player board rendering for 2–4 players instead of the hardcoded two-player layout; (3) new SvelteKit routes are needed (`/` → landing/lobby, `/games` → game list, `/game/[id]` already exists); (4) the game creation API must accept player names and player count, returning a session ID the client navigates to.

**Primary recommendation:** Implement hooks first (server-side rules), then wire the client turn flow, then add routes. Each layer is independently testable.

---

## Standard Stack

### Core (all already in place — Phase 1 verified)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Jint | 3.x | In-process JS/TS hook execution in C# | No subprocess, no Node.js install; proven in Phase 1 |
| XState v5 | 5.x | Client-side FSM driving turn/phase flow | Already wired in SceneManager/GameFSM |
| SvelteKit 2 / Svelte 5 | 2.x / 5.x | Client routing and reactivity | Established stack; SSR disabled on game route |
| Entity Framework Core | 8.x | PostgreSQL ORM for GameSession JSONB state | GameDbContext + xmin optimistic locking in place |
| Vitest | latest | Unit tests for hook logic | vitest.config.ts exists in engine/core; same config reusable for azul lib |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| localStorage (native) | — | Game list (recently played session IDs) | No auth means no server-side user context; localStorage is the right scope |
| SvelteKit `$page` store | built-in | Reading `params.id` on game route | Already used via `+page.ts` load function |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage for game list | IndexedDB | localStorage is sufficient for a list of UUIDs; IndexedDB is overkill |
| Jint TS stripping | esbuild compile step | HookExecutor comments say "Phase 2 will use tsc/esbuild" — evaluate whether current regex stripping handles real hook code before committing |

---

## Architecture Patterns

### Recommended Project Structure

No new directories are needed. Work happens inside existing files + new routes:

```
libs/games/azul/src/
├── hooks.ts              ← PRIMARY: implement all 3 hook functions
└── hooks.test.ts         ← NEW: unit tests for hook logic

apps/client/src/
├── routes/
│   ├── +page.svelte      ← UPDATE: landing page with "Start New Azul Game" button
│   ├── games/
│   │   └── +page.svelte  ← NEW: game list (reads localStorage, fetches status)
│   └── game/[id]/
│       ├── +page.svelte  ← UPDATE: multi-player turn UI + active player indicator
│       └── +page.ts      ← EXISTS: load function already reads params.id
├── lib/
│   ├── engine/
│   │   ├── AzulScene.ts  ← UPDATE: 2-4 player boards, per-player zone IDs
│   │   └── SceneManager.ts ← UPDATE: multi-player turn tracking, floor warning
│   └── api/
│       └── gameApi.ts    ← UPDATE: createGame sends player names + count

apps/server/
├── Services/
│   └── GameService.cs    ← UPDATE: CreateGame accepts players, initializes Azul state
└── Endpoints/
    └── GameEndpoints.cs  ← UPDATE: CreateGame body includes playerNames[]
```

### Pattern 1: Azul State Schema (in GameState.zones + players[].data)

**What:** All Azul-specific mutable state lives in the generic `GameState` fields — no new top-level fields needed.

**Azul state layout:**

```typescript
// GameState.zones keys (shared):
//   "factory-0" ... "factory-8"  (0-indexed, count = 5/7/9 based on player count)
//   "center"
//   "bag"
//   "lid"
//
// GameState.zones keys (per-player, namespaced by player index):
//   "player-0-pattern-line-1" ... "player-0-pattern-line-5"
//   "player-0-wall"       // 5x5 grid — filled cell = tile present
//   "player-0-floor-line" // up to 7 tiles

// GameState.players[i].data shape (Azul-specific):
interface AzulPlayerData {
  wall: boolean[][];        // 5x5 — true = tile placed
  patternLines: {
    color: string | null;   // null = empty line
    count: number;          // tiles currently on this line
  }[];
  floorLine: string[];      // colors of tiles on floor
  hasFirstPlayerToken: boolean;
}

// GameState top-level fields used by hooks:
//   phase: 'factory-offer' | 'wall-tiling' | 'finished'
//   currentPlayerIndex: 0-based index into players[]
//   round: 1-indexed round counter
//   finished: true when end-game triggered
//   winnerId: player id of winner
```

**Key insight:** The existing `GameState` schema is already sufficient. The `data: Record<string, unknown>` on `PlayerState` holds per-player Azul state. Zone contents (which tiles are where) live in `GameState.zones` as ZoneState. No schema migration needed.

### Pattern 2: Hook Implementation Contract

**What:** The three hook functions that Jint executes. They must be written in TypeScript that strips cleanly to ES5-compatible JavaScript.

**Jint compatibility rules (verified from HookExecutor.cs):**
- No ES6 module syntax (`import`/`export`) — HookExecutor strips these
- No TypeScript generics in runtime code (type annotations are stripped)
- `console.log/warn/error` work (shim is injected)
- `JSON.parse` / `JSON.stringify` work natively
- Arrow functions work (Jint supports ES6+)
- `Array.from`, `Object.keys`, `Object.entries` work in modern Jint

**Hook function signatures (from shared-types/src/hooks.ts):**
```typescript
getValidMoves(ctx: HookContext): ValidMove[]
onMove(ctx: HookContext, move: Move): void  // mutates ctx.state in place
onRoundEnd(ctx: HookContext): void           // mutates ctx.state in place
```

**HookContext shape passed by Jint (from HookExecutor.cs BuildHookContext):**
```javascript
// ctx is a JS object with:
ctx.state      // full GameState as parsed JSON object
ctx.currentPlayer  // player ID string (currently just "player1" — needs update)
ctx.round      // integer
ctx.players    // currently always [] — needs to be populated from state.players
```

**IMPORTANT GAP FOUND:** HookExecutor.cs `BuildHookContext` hard-codes `players: []` and extracts `currentPlayer` as a bare string from the JSON `currentPlayer` field. In Phase 2, once hooks need the players list, the context builder must be updated to pass `state.players` to the context. The `ExtractPlayerAndRound` method also only reads `currentPlayer` (a string) and `round` — it needs to read `currentPlayerIndex` (integer) and derive the player ID from `state.players[currentPlayerIndex].id`.

### Pattern 3: Factory Count Scaling

**What:** Azul uses 5 factories for 2 players, 7 for 3 players, 9 for 4 players.

The current `azulGameConfig` in `azul-game-config.ts` hardcodes 5 factories (`factory-0` through `factory-4`). For Phase 2 multi-player, the initial game state must be created dynamically on the server at `CreateGame` time based on player count.

**Approach:** `GameService.CreateGame` receives player names and count, creates zones array accordingly in the initial state JSON stored to PostgreSQL. The game config (for the client model) remains a superset (9 factories) and the hooks only reference zones that exist in state.

### Pattern 4: Turn Handoff (engine-level, not Azul-specific)

Per the CONTEXT.md decision, turn handoff must be a game config property:

```typescript
// In GameState or game config:
turnHandoffMode: 'open-board' | 'pass-and-play'
// Azul uses 'open-board' — no screen hiding between turns
// Future games with hidden hands use 'pass-and-play'
```

The client SceneManager should check this property when advancing turns. For Phase 2 with Azul (`open-board`), it simply: (a) deselects everything, (b) shows a turn-change banner/toast, (c) highlights the new active player's board, and then allows interaction.

### Pattern 5: Game List via localStorage

No server endpoint needed for "my games":

```typescript
// localStorage key: 'bga2-recent-games'
// Value: JSON array of { sessionId: string, createdAt: string, gameId: string, playerNames: string[] }
// Written when CreateGame succeeds, read on /games page
// Page fetches GET /games/:id/state for each to show current status
```

### Anti-Patterns to Avoid

- **Re-rendering the whole board on every move from scratch:** AzulScene.updateScene() currently does a full re-render (clear all sprites, redraw). This is acceptable for Phase 2 but should animate only the changed pieces. Wire animatePiece() before clearing unchanged sprites.
- **Putting rule logic in the client:** Client only highlights valid moves from the server's validMoves list. Never compute legal moves in the browser.
- **Blocking onRoundEnd on missing bag:** If the bag runs out, shuffle the lid into the bag. Failing to handle this leads to infinite loops or dead games. Must be implemented in onRoundEnd.
- **Storing player index vs player ID inconsistently:** HookContext exposes both `currentPlayer` (string ID) and the players list. Hook code must be consistent about which it uses. The server's `ExtractPlayerAndRound` currently reads a `currentPlayer` string field — standardize to `currentPlayerIndex` integer + derive ID from `players[]`.
- **Azul game config duplicated in two places:** `azul-game-config.ts` in the client is a copy of `libs/games/azul/game.json`. For Phase 2, this is still acceptable, but the config must be kept in sync when adding per-player zones.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript → JS for Jint | Custom regex stripper (extend HookExecutor) | Evaluate esbuild in Docker | The current StripTypeScriptAnnotations is explicitly a Phase 1 stub. If real hook code uses generics, template literals with type params, or complex union types, the regex will break. Test the stripped output before writing complex hook code. |
| Optimistic concurrency | Custom version checks | Existing `Version` + `DbUpdateConcurrencyException` pattern | Already implemented in GameService.cs — just use it |
| Client-side session identity | Custom UUID generation | `crypto.randomUUID()` (built into browsers) | No install needed |
| Game state validation | JSON schema validators | Keep hook validation in hooks (already the contract) | Server hook pipeline is the single validation point |

**Key insight:** The infrastructure is already built. The risk of hand-rolling is in hook complexity — Azul scoring has many interacting rules (adjacency, row/column/color bonuses) that are easy to get subtly wrong. Write unit tests in `hooks.test.ts` against pure functions before integrating with Jint.

---

## Common Pitfalls

### Pitfall 1: Jint Context Mutation Pattern

**What goes wrong:** `onMove` must mutate `ctx.state` in place. If the hook code replaces `ctx.state` with a new object reference (`ctx.state = newStateObject`), the HookExecutor cannot see the change because it reads `ctx.state` via `engine.Evaluate("JSON.stringify(ctx.state)")` using the global `ctx` variable.

**Why it happens:** JS mutation vs reassignment confusion. `ctx.state.players[0].score += 5` works. `ctx.state = {...ctx.state, ...}` breaks it.

**How to avoid:** Never reassign `ctx.state`. Always mutate in place:
```javascript
// CORRECT
ctx.state.players[ctx.state.currentPlayerIndex].score += points;
ctx.state.zones['center'].pieces = remaining;

// WRONG — breaks HookExecutor read-back
ctx.state = { ...ctx.state, currentPlayerIndex: nextIndex };
```

**Warning signs:** Move appears to succeed (no errors) but state is unchanged in the DB.

### Pitfall 2: HookContext `ctx.players` is Empty

**What goes wrong:** HookExecutor.cs `BuildHookContext` sets `players: []`. Hook code that tries to iterate `ctx.players` to build display names or look up player data will get an empty array.

**Why it happens:** Phase 1 stub — players list wasn't needed yet.

**How to avoid:** Update `BuildHookContext` to populate `ctx.players` from `ctx.state.players` before Phase 2 hook logic needs it. Also update `ExtractPlayerAndRound` to use `currentPlayerIndex` instead of a `currentPlayer` string ID.

**Warning signs:** Hook code sees no players, valid moves may be correct but player-specific state is never updated.

### Pitfall 3: Wall Adjacency Scoring Off-by-One

**What goes wrong:** When placing a tile on the wall, you score 1 point for the tile itself, then +1 for each contiguous horizontal neighbor and +1 for each contiguous vertical neighbor. A tile that completes a row of 5 earns 5 points (not 5 + 1). The self-score is already included in the run count.

**Why it happens:** The rule is "count the contiguous run including the placed tile." Beginners add 1 for self + neighbors, double-counting.

**How to avoid:**
```javascript
function scoreWallPlacement(wall, row, col) {
  // Count horizontal run including placed cell
  let hRun = 1;
  for (let c = col - 1; c >= 0 && wall[row][c]; c--) hRun++;
  for (let c = col + 1; c < 5 && wall[row][c]; c++) hRun++;

  // Count vertical run including placed cell
  let vRun = 1;
  for (let r = row - 1; r >= 0 && wall[r][col]; r--) vRun++;
  for (let r = row + 1; r < 5 && wall[r][col]; r++) vRun++;

  // Only add run if > 1 (isolated tile = 1 point, not 2)
  return (hRun > 1 ? hRun : 0) + (vRun > 1 ? vRun : 0) + (hRun === 1 && vRun === 1 ? 1 : 0);
}
// Simpler: score = (hRun > 1 ? hRun : 1) + (vRun > 1 ? vRun : 0)
// But: if isolated, score = 1 (not hRun + vRun = 2)
```

**Warning signs:** End-of-round scores are consistently ~1 point too high or too low per placed tile.

### Pitfall 4: Factory Count Not Matching Player Count

**What goes wrong:** The `azulGameConfig` hardcodes 5 factories. If the server creates a 4-player game but the client config only knows about 5 factories, the client won't render factories 5-8 (indices 5-8), and the hooks won't find them in `ctx.state.zones`.

**Why it happens:** Config was designed for Phase 1 (2-player demo), not dynamic player counts.

**How to avoid:** The server's `CreateGame` should store the correct zone IDs in the initial state. The client's azulGameConfig should define all 9 factories (factory-0 through factory-8) as the maximum configuration. Hook code derives factory list from `ctx.state.zones` keys, not from a hardcoded count. AzulScene renders only zones that exist in the model's zone map.

**Warning signs:** 3+ player games work server-side but client renders incomplete board.

### Pitfall 5: Floor Line Overflow Missing Tiles

**What goes wrong:** When a player picks N tiles of one color from a factory, some may overflow to the floor line. The floor line holds at most 7 tiles. Tiles beyond 7 go to the lid (box cover). If the hook doesn't route overflow-of-overflow to the lid, tiles disappear from the game.

**Why it happens:** Two-stage overflow: pick → some go to pattern line, rest → floor line, floor-line-overflow → lid.

**How to avoid:**
```javascript
// In onMove, after placing tiles on pattern line:
const overflow = tilesToPlace.slice(patternLineCapacity);
const floorSpace = 7 - currentFloorLength;
const toFloor = overflow.slice(0, floorSpace);
const toLid = overflow.slice(floorSpace);
// Add toFloor to floor-line zone, toLid to lid zone
```

### Pitfall 6: First Player Token Handling

**What goes wrong:** The first-player token starts in the center. The first player to pick from the center takes it (not just from factories). At round end, the player holding the first-player token starts the next round AND takes a floor-line penalty. Many implementations forget the penalty.

**Why it happens:** The token is both a "next round starts with me" marker and a floor-line penalty tile.

**How to avoid:** In `onMove`, when picking from the center, always check if the first-player token is present. If so: remove it from center, add it to the current player's floor line (before other picked tiles, since it counts as position 0 penalty), set `players[i].data.hasFirstPlayerToken = true`. In `onRoundEnd`, the player with `hasFirstPlayerToken` becomes `currentPlayerIndex` for round N+1.

---

## Code Examples

Verified patterns from existing codebase:

### Hook State Mutation Pattern (verified from HookExecutor.cs)

```typescript
// Correct onMove implementation pattern
export function onMove(ctx: HookContext, move: Move): void {
  // Always mutate ctx.state in place — never reassign ctx.state
  const playerIdx = ctx.state.currentPlayerIndex;
  const player = ctx.state.players[playerIdx];

  if (move.action === 'pick-from-factory') {
    const factoryId = move.source!;  // e.g. 'factory-2'
    const color = move.data!['color'] as string;
    const targetRow = move.data!['patternLineRow'] as number;  // 0-4

    // Get tiles from factory zone
    const factory = ctx.state.zones[factoryId];
    const picked = factory.pieces.filter(p => p.color === color);
    const leftover = factory.pieces.filter(p => p.color !== color);

    // Move leftover to center
    ctx.state.zones['center'].pieces.push(...leftover);

    // Clear factory
    ctx.state.zones[factoryId].pieces = [];

    // Place picked on pattern line (or overflow to floor)
    const patternLineId = `player-${playerIdx}-pattern-line-${targetRow + 1}`;
    const line = ctx.state.zones[patternLineId];
    const capacity = targetRow + 1;
    const canPlace = capacity - line.pieces.length;
    const toLine = picked.slice(0, canPlace);
    const toFloor = picked.slice(canPlace);

    line.pieces.push(...toLine);

    // Floor line overflow
    const floorId = `player-${playerIdx}-floor-line`;
    const floor = ctx.state.zones[floorId];
    const floorSpace = 7 - floor.pieces.length;
    floor.pieces.push(...toFloor.slice(0, floorSpace));
    // Remainder goes to lid
    ctx.state.zones['lid'].pieces.push(...toFloor.slice(floorSpace));

    // Advance turn (next player or round end check)
    advanceTurn(ctx);
  }
}
```

### Advancing Turn in Hooks

```typescript
function advanceTurn(ctx: HookContext): void {
  const allEmpty = areAllFactoriesEmpty(ctx.state);
  if (allEmpty) {
    // Round ends — onRoundEnd will be called by engine
    ctx.state.phase = 'wall-tiling';
    // HookExecutor doesn't auto-call onRoundEnd; SceneManager must detect phase change
    // and explicitly trigger ROUND_END on FSM, which triggers the endpoint call
  } else {
    // Next player's turn
    ctx.state.currentPlayerIndex =
      (ctx.state.currentPlayerIndex + 1) % ctx.state.players.length;
  }
}

function areAllFactoriesEmpty(state: GameState): boolean {
  const factoryKeys = Object.keys(state.zones).filter(k => k.startsWith('factory-'));
  const centerEmpty = state.zones['center'].pieces.length === 0;
  const factoriesEmpty = factoryKeys.every(k => state.zones[k].pieces.length === 0);
  return centerEmpty && factoriesEmpty;
}
```

### Creating Game with Players (server-side)

The `CreateGame` endpoint needs updating. Proposed request shape:

```csharp
// New request shape
public record CreateGameRequest(
    string? GameId = null,
    string[]? PlayerNames = null  // e.g. ["Alice", "Bob", "Carol"]
);
```

Initial state must include per-player zones and the correct factory count:

```csharp
public async Task<CreateGameResponse> CreateGame(string gameId, string[] playerNames)
{
    var playerCount = Math.Clamp(playerNames.Length, 2, 4);
    var factoryCount = playerCount switch { 2 => 5, 3 => 7, _ => 9 };

    var zones = new Dictionary<string, object>();
    for (int i = 0; i < factoryCount; i++)
        zones[$"factory-{i}"] = new { pieces = Array.Empty<object>() };
    zones["center"] = new { pieces = Array.Empty<object>() };
    zones["bag"] = new { pieces = BuildInitialBag() };  // 20 of each color = 100 tiles
    zones["lid"] = new { pieces = Array.Empty<object>() };

    for (int p = 0; p < playerCount; p++)
    {
        for (int row = 1; row <= 5; row++)
            zones[$"player-{p}-pattern-line-{row}"] = new { pieces = Array.Empty<object>() };
        zones[$"player-{p}-wall"] = new { pieces = Array.Empty<object>() };
        zones[$"player-{p}-floor-line"] = new { pieces = Array.Empty<object>() };
    }

    // Populate factories from bag
    PopulateFactories(zones, factoryCount);
    // Place first-player token in center
    zones["center"]["pieces"].Add(new { id = "first-player-token", color = "white" });

    var players = playerNames.Select((name, i) => new {
        id = $"player-{i}",
        name,
        score = 0,
        data = new { wall = new bool[5][], patternLines = new object[5], floorLine = Array.Empty<object>(), hasFirstPlayerToken = false }
    }).ToList();

    var state = new { id = sessionId, gameId, version = 0, phase = "factory-offer",
                      currentPlayerIndex = 0, players, zones, round = 1, finished = false };
    // ... serialize and save
}
```

### SceneManager Turn Tracking Update

```typescript
// Replace hardcoded 'player-1' with dynamic tracking
export interface SceneManagerState {
  sessionId: string | null;
  currentPlayerIndex: number;  // replaces playerId
  playerNames: string[];       // populated from game state
  currentFsmState: string;
  lastMoveResult: MoveResult | null;
  validMoves: ValidMove[];
}

// After successful move, check if phase changed to wall-tiling
// If so, call server ROUND_END endpoint (or handle automatically in hooks)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 1: hooks return [] (permissive mode) | Phase 2: hooks return real ValidMoves (enforced) | Phase 2 | Server now rejects invalid moves — client must only offer legal options |
| Hardcoded player-1 in SceneManager | Dynamic currentPlayerIndex from state | Phase 2 | Enables 2-4 player hot-seat |
| 5 factories hardcoded in game config | Factory count derived from player count | Phase 2 | Correct Azul component counts |
| CreateGame takes only gameId | CreateGame takes gameId + playerNames[] | Phase 2 | State is pre-populated with players and correct zones |
| HookExecutor strips TS with regex | Consider esbuild compile step | Phase 2 evaluation | If regex breaks on complex hook code, switch to compiled JS |

**Deprecated/outdated from Phase 1:**
- `playerId: 'player-1'` hardcode in SceneManager — replace with dynamic player tracking
- `stub game state` in SceneManager.init() — replace with real state fetched from server
- 5-factory game config — update to support 2-4 players with scaled factory count
- `currentPlayer` string field in GameState — standardize to `currentPlayerIndex` integer

---

## Open Questions

1. **onRoundEnd trigger mechanism**
   - What we know: `onRoundEnd` is a hook function in the contract. The engine calls it at round end. But the current GameService has no `onRoundEnd` call.
   - What's unclear: How does the server know when a round ends? The hook could set `phase = 'wall-tiling'` in the state. The client could detect this phase change and call a `POST /games/:id/round-end` endpoint. Or `ValidateAndApplyMove` could auto-detect when all factories are empty and call `onRoundEnd` before returning.
   - Recommendation: Simplest approach — detect empty factories inside `ValidateAndApplyMove` after `onMove`. If all factories empty, call `_hookExecutor.OnRoundEnd(...)` inline, then increment round, refill factories, and advance to factory-offer phase. No new endpoint needed.

2. **HookExecutor context players field**
   - What we know: `BuildHookContext` passes `players: []`. This is a bug for Phase 2.
   - What's unclear: Should context also carry derived helpers (factory list, player count)?
   - Recommendation: Populate `players` from `state.players` in `BuildHookContext`. Keep it minimal — just the `PlayerInfo[]` shape from shared-types. Hook code accesses full player data via `ctx.state.players[i].data`.

3. **Jint ES2020 compatibility**
   - What we know: Jint 3.x supports ES2020. Modern arrow functions, destructuring, optional chaining (`?.`) all work.
   - What's unclear: `Object.assign`, spread operators in array/object literals — need to verify no edge cases.
   - Recommendation: Test hook code against Jint before full integration. Write a small test harness that calls the stripped hook source through Jint with a representative game state.

4. **Wall-tiling phase: automatic vs manual**
   - What we know: Standard Azul wall-tiling is automatic (server auto-moves completed pattern line tiles to wall). The CONTEXT.md doesn't specify manual wall placement (which is the variant rule).
   - What's unclear: Should wall-tiling be a user-facing phase at all, or should it happen server-side in onRoundEnd?
   - Recommendation: Auto-wall-tiling in onRoundEnd (matches base Azul rules). The client shows an animation of tiles moving to the wall, but no user input is required. The `wall-tiling` phase in the FSM is effectively a brief animation state, not an interactive state.

5. **Score summary screen routing**
   - What we know: Game ends when `state.finished = true` and `state.winnerId` is set.
   - What's unclear: Should the summary screen be a new route (`/game/:id/summary`) or an overlay on the same route?
   - Recommendation: Overlay on the same `/game/[id]` route — simpler, URL stays bookmarkable. Svelte reactive `{#if state.finished}` block shows the summary over the game board.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `/var/home/emkayultra/code/personal/bga2/libs/games/azul/src/hooks.ts` — stub implementation with full Phase 2 TODO comments
- `/var/home/emkayultra/code/personal/bga2/apps/server/Services/HookExecutor.cs` — Jint integration and TS stripping details
- `/var/home/emkayultra/code/personal/bga2/apps/server/Services/GameService.cs` — move validation pipeline
- `/var/home/emkayultra/code/personal/bga2/libs/shared-types/src/` — canonical type contracts
- `/var/home/emkayultra/code/personal/bga2/libs/engine/core/src/fsm/GameFSM.ts` — XState machine structure
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/lib/engine/AzulScene.ts` — renderer/scene layer
- `/var/home/emkayultra/code/personal/bga2/apps/client/src/lib/engine/SceneManager.ts` — orchestration and interaction

### Secondary (MEDIUM confidence — Azul rulebook knowledge)
- Azul official rules: adjacency scoring, floor penalties (-1/-1/-2/-2/-2/-3/-3), end-game bonuses (+2 row, +7 column, +10 color set), factory counts (5/7/9), first-player token mechanics

### Tertiary (LOW confidence — implementation judgment calls)
- onRoundEnd trigger mechanism (recommendation is inference from existing pipeline, not documented)
- Jint ES2020 compatibility for spread/destructuring (verified by Jint 3.x release notes generally, not tested against this codebase's hook code specifically)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by codebase inspection; no new dependencies needed
- Architecture: HIGH — patterns derived from existing working code, not speculation
- Azul rules accuracy: MEDIUM — rules are well-known but scoring edge cases should be unit-tested
- Pitfalls: HIGH — most derived from direct code inspection (HookExecutor mutation pattern, ctx.players bug, hardcoded factory count)
- Open questions: HIGH confidence they are real questions; recommendations are MEDIUM confidence

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days — stack is stable, rules are fixed)
