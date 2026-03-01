# Phase 1: Engine Foundation - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Game engine primitives, renderer abstraction (IRenderer + PixiJS adapter), hierarchical FSM runtime, game hook contract, and Dockerized dev environment — proven by rendering an interactive Azul scene locally in the browser. No networking, no multiplayer, no auth — just the engine running a game scene.

</domain>

<decisions>
## Implementation Decisions

### Player Interaction Model
- Click-to-select, then click-to-place — works identically on desktop (mouse) and mobile (tap). No drag-and-drop in Phase 1.
- Selected piece gets a PixiJS GlowFilter; all valid destination targets highlight simultaneously with a distinct glow/color shift
- Piece movement uses snappy overshoot easing — quick move with slight overshoot and settle back. Pieces feel responsive and alive without being distracting.
- When it's not your turn: speculative select mode — player can tap pieces to preview what they'd do (highlights show, planned moves display), but nothing submits until their turn. Keeps players engaged during wait/async periods.

### Visual Style
- Styled placeholder art: colored tiles with subtle patterns and gradients. Not raw colored squares, not production art. Should look intentional and polished, not broken.
- Adaptive board layout: desktop shows all player boards at equal size around the shared area. Mobile puts your player board large at the bottom, opponents' boards smaller above. Layout responds to viewport dimensions.
- Light + clean aesthetic: light/white background, bright tile colors. Airy, readable. Not dark gaming, not heavy textures.
- Phase 1 visual effects (all powered by PixiJS):
  - Scoring particle burst: small particles emit from scored positions
  - Smooth tile slides: tiles animate from source to destination with the snappy overshoot easing
  - Placement feedback: brief flash/pulse when a tile locks into position on the wall
  - Ambient board glow: subtle warm lighting on the board surface using PixiJS filters

### Game Definition Format
- Data-heavy game.json: maximally declarative. Zones, pieces, board layout, scoring tables, turn order structure, win conditions — everything that CAN be expressed as data SHOULD be. Hooks are only for logic that can't be declarative.
- TypeScript hooks: hooks written in TypeScript. Runs in browser (for client-side legal move hints eventually) and compiles for server validation. Same language as the frontend. Best fit for AI code generation.
- Hybrid zones: zones have a name and a type (grid, stack, hand, deck, discard). The engine knows how to render and interact with each type by default. Hooks can override any zone behavior for custom game needs.
- Pieces: sprite-based rendering when asset images exist, auto-generated procedural shapes (colored shape + text label) as fallback. AI creation pipeline can generate a playable game before art is finalized.

### NX Monorepo Structure
- NX monorepo using standard apps/ + libs/ convention
- **apps/**: deployable things
  - `apps/client/` — SvelteKit web application
  - `apps/server/` — C# API server (.NET)
  - `apps/infra/` — CDK stack, Docker Compose, deployment scripts (own NX project)
- **libs/**: shared code
  - `libs/engine/` — engine sub-libs (organization is Claude's discretion)
  - `libs/shared-types/` — cross-cutting types shared by client, server, engine, and games (Move, Player, GameConfig)
  - `libs/games/azul/` — Azul starts in monorepo for fast iteration while engine API is forming
- **Games are external packages long-term**: each game is its own git repo using the published engine SDK. Produces a versioned game package (game.json + compiled hooks + assets) deployed to a registry (S3). Platform discovers and loads them at runtime.
- **Azul starts in monorepo, extracts later**: once engine SDK stabilizes, Azul moves to its own repo — eating our own dog food.
- Engine SDK published as an npm package from the monorepo: game creators depend on it for types, hook interfaces, and local testing.

### Database
- PostgreSQL for all persistence — single database, not DynamoDB (overrides research recommendation)
- Game state stored as JSONB columns — flexible schema for different game types while keeping relational structure for everything else
- Relational tables for: users, profiles, friendships, match history, game library, subscriptions, chat, notifications
- Optimistic locking via version column + conditional UPDATE for concurrent move protection (replaces DynamoDB conditional writes)
- Production hosting: Aurora Serverless v2 or Neon (serverless Postgres) for budget-conscious scaling

### Dev Environment
- Docker Compose orchestrates the full local stack. `docker compose up` starts everything. No local tool installs beyond Docker.
- Four services in Docker Compose:
  1. SvelteKit frontend (Vite dev server with HMR)
  2. C# API server (dotnet watch for automatic rebuild on file save)
  3. PostgreSQL (local persistence for game state + all relational data)
  4. LocalStack (local AWS service emulation — S3, AppSync, SES, etc.)
- Watch mode on both frontend and backend: saving a file triggers automatic rebuild/reload. Frontend via Vite HMR (instant), backend via dotnet watch (slightly slower but fully automatic).

### Testing Strategy
- Unit tests for engine internals: FSM transitions, game state mutations, hook execution, zone/piece operations
- Integration tests for the full stack: boot engine, load a game.json, execute moves through the API, verify state. End-to-end proof the engine works.
- Tests run inside Docker containers for consistency with the dev environment

### Claude's Discretion
- Engine libs internal organization (single lib vs feature-sliced sub-libs)
- Exact PixiJS filter parameters (glow intensity, particle count, animation timing curves)
- Procedural shape generation algorithm for piece fallback rendering
- How C# server integrates with NX (nx-dotnet plugin vs custom executors wrapping dotnet CLI)
- Test framework selection (xUnit for C#, vitest for TypeScript)
- NX caching and task pipeline configuration

</decisions>

<specifics>
## Specific Ideas

- "Using WASM or WebGL over canvas feels like it'd give us a degree of polish BGA can't achieve" — the visual effects (particles, glow, ambient lighting) are a deliberate competitive differentiator over BGA's DOM rendering
- Azul's tile-clacking-into-place feel should come through in the snappy overshoot animation + placement flash
- The speculative select during opponent turns keeps engagement high, especially important for the async play model coming in Phase 4
- Fallback procedural shapes for pieces supports the AI creation pipeline in Phase 5 — games are playable before art exists

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — patterns will be established by this phase

### Integration Points
- game.json + hooks.ts contract established here will be consumed by: Phase 2 (Azul implementation), Phase 5 (AI generation pipeline), and all future games
- IRenderer interface established here will be consumed by: Phase 7 (second renderer) and all game rendering
- Docker Compose setup established here will be extended by: every subsequent phase adding services

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-engine-foundation*
*Context gathered: 2026-02-28, updated 2026-03-01*
