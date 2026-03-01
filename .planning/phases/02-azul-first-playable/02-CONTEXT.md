# Phase 2: Azul + First Playable - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A complete game of Azul can be played locally (single browser, hot-seat style) with all rules enforced by the server, state persisted to PostgreSQL, and a working SvelteKit UI. 2-4 player support, full scoring, all edge cases. The engine is proven by a real game.

</domain>

<decisions>
## Implementation Decisions

### Hot-seat turn flow
- Open board for Azul — all information is shared, no need to hide anything between turns
- However, the turn-handoff system must be generic enough to support pass-and-play screens for games with hidden information (future games). Azul just happens to not need it.
- Active player indicated by BOTH: a banner/toast announcing turn change AND the active player's board visually highlighted throughout their turn
- 2-4 player support (full Azul spec) — factory count scales with player count (5/7/9 factories for 2/3/4 players)
- Game end shows a score summary screen with full breakdown: wall tiles, row bonuses, column bonuses, color set bonuses, floor penalties. Winner announced. Option to start a new game.

### Move interaction UX
- Tap-to-select, then tap destination: player taps a tile in a factory (selects all tiles of that color), then taps a pattern line row to place them. Two-step source → target flow.
- Invalid moves handled with prevent + explain: only highlight legal destinations. When hovering/long-pressing a disabled option, show a tooltip/reason ('This line already has blue tiles'). Most informative approach.
- Smooth animations when tiles move: tiles slide from source to destination with easing. AzulScene already has animatePiece() with easeOutBack — wire it to real moves.
- Floor line overflow: auto-overflow by default (excess tiles automatically go to floor line with animation). Opt-in warning prompt available — if enabled, show 'N tiles will go to the floor line — proceed?' before applying. Default is auto (no prompt).

### Player identity & auth
- Simple name entry for Phase 2: players type their names before starting a game. No accounts, no passwords.
- Upgrade path to full sign-up/login: the data model should accommodate future auth (email/password, sessions, user records) without requiring a painful migration. Don't build the auth now, but don't paint into a corner.
- No persistent browser identity beyond the game — just player names per game. Phase 3 multiplayer will introduce real user identity.

### Game resumability
- Games resumable via URL: game session lives at /game/{sessionId}. Bookmark or share the URL to return. State is in PostgreSQL, client re-fetches on load.
- ALSO resumable via game list: a simple page listing active/completed games. Since there's no user identity, this is likely a localStorage list of recently played game IDs.
- New game creation via BOTH: a landing page with a 'Start New Azul Game' button (clean entry point for first impression) AND direct URL/API creation for developer convenience.

### Azul rule completeness
- Full Azul scoring: adjacency bonuses (horizontal + vertical neighbors when placing wall tile), end-game bonuses for complete rows (+2), complete columns (+7), all 5 of one color (+10), floor line penalties (-1/-1/-2/-2/-2/-3/-3)
- All edge cases implemented: first-player token (goes to center, taken by first player to pick from center, that player starts next round), factory exhaustion (round ends when all factories and center are empty), tied game tiebreak (most complete horizontal rows wins)
- Full 2-4 player support with correct factory counts and per-player boards

### Claude's Discretion
- Exact tooltip/explain UI implementation for invalid moves (popover vs inline text vs toast)
- Score summary screen layout and visual design
- Animation timing and easing curves beyond what exists
- How the "opt-in overflow warning" preference is stored/toggled
- Landing page visual design

</decisions>

<specifics>
## Specific Ideas

- The turn-handoff system should be engine-level, not Azul-specific. Azul uses "open board" mode; a future game with hidden hands would use "pass-and-play" mode. This is a game config property, not hardcoded.
- Floor line overflow warning is an opt-in player preference, not a game-level setting. Some players want the guardrail, experienced players don't.
- Game list page (for resuming) can be simple — localStorage tracks recently played session IDs, page fetches their status from the server.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AzulScene.ts` (493 lines): Full board rendering with click handlers, glow highlights, animatePiece(). Needs wiring to real moves.
- `SceneManager.ts` (365 lines): Orchestration layer with piece click → submit move → update scene flow. Needs turn switching and multi-player support.
- `gameApi.ts` (132 lines): REST client with createGame, getGameState, submitMove. Ready to use.
- `GameService.cs` (184 lines): Server-side move validation with optimistic locking. ValidateAndApplyMove pipeline is complete — just needs real hook logic.
- `HookExecutor.cs` (315 lines): Jint-based JS execution with timeout/memory guards. Loads hooks.ts, strips TS annotations.
- `StubRenderer` + `RendererSwap.test.ts`: Proven renderer abstraction — game logic has zero PixiJS imports.

### Established Patterns
- Game config as JSON (game.json) with zones, pieces, turn order, hook references
- Hooks contract: getValidMoves(ctx) → ValidMove[], onMove(ctx, move) → mutates ctx.state, onRoundEnd(ctx) → mutates ctx.state
- Server validates moves via hooks, client only highlights — no rule logic in client
- PostgreSQL JSONB for game state, xmin for optimistic concurrency
- NX monorepo: apps/ (client, server) + libs/ (engine-core, shared-types, games/azul)

### Integration Points
- `libs/games/azul/src/hooks.ts`: All 3 hook functions are stubs returning empty — primary implementation target
- `apps/server/Services/GameService.cs` line 94: empty validMoves bypasses validation — will activate once hooks return real data
- `apps/client/src/lib/engine/SceneManager.ts`: hardcoded playerId='player-1', needs multi-player turn management
- `apps/client/src/routes/game/[id]/+page.svelte`: game route exists, needs landing page + game list routes
- `libs/shared-types/src/state.ts`: GameState/PlayerState types need Azul-specific state schema

</code_context>

<deferred>
## Deferred Ideas

- Real user authentication (email/password, OAuth) — Phase 3 when multiplayer needs it
- AI opponents — explicitly out of scope per PROJECT.md
- Spectator mode — Phase 6

</deferred>

---

*Phase: 02-azul-first-playable*
*Context gathered: 2026-03-01*
