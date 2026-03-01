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
- Warm textured aesthetic: warm-toned background with subtle texture (evokes a wooden tabletop), natural tile colors. Physical board game feel — not flat UI, not dark gaming.
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

### Dev Environment
- Docker Compose orchestrates the full local stack. `docker compose up` starts everything. No local tool installs beyond Docker.
- Three services in Docker Compose:
  1. SvelteKit frontend (Vite dev server with HMR)
  2. C# API server (dotnet watch for automatic rebuild on file save)
  3. DynamoDB Local (local persistence for game state)
- Watch mode on both frontend and backend: saving a file triggers automatic rebuild/reload. Frontend via Vite HMR (instant), backend via dotnet watch (slightly slower but fully automatic).
- Monorepo structure with top-level directories: /client (SvelteKit), /server (C# API), /engine (shared game logic), /shared (types, contracts)

### Testing Strategy
- Unit tests for engine internals: FSM transitions, game state mutations, hook execution, zone/piece operations
- Integration tests for the full stack: boot engine, load a game.json, execute moves through the API, verify state. End-to-end proof the engine works.
- Tests run inside Docker containers for consistency with the dev environment

### Claude's Discretion
- Exact PixiJS filter parameters (glow intensity, particle count, animation timing curves)
- Procedural shape generation algorithm for piece fallback rendering
- Monorepo tooling choice (npm workspaces, turborepo, or similar)
- Test framework selection (xUnit for C#, vitest for TypeScript)
- DynamoDB Local vs alternative local persistence for Phase 1

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
*Context gathered: 2026-02-28*
