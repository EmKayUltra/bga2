# Phase 1: Engine Foundation - Research

**Researched:** 2026-03-01
**Domain:** Game engine primitives, renderer abstraction, hierarchical FSM, NX monorepo, Docker dev environment
**Confidence:** HIGH (core stack), MEDIUM (NX+SvelteKit integration nuances)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Player Interaction Model**
- Click-to-select, then click-to-place — works identically on desktop (mouse) and mobile (tap). No drag-and-drop in Phase 1.
- Selected piece gets a PixiJS GlowFilter; all valid destination targets highlight simultaneously with a distinct glow/color shift
- Piece movement uses snappy overshoot easing — quick move with slight overshoot and settle back. Pieces feel responsive and alive without being distracting.
- When it's not your turn: speculative select mode — player can tap pieces to preview what they'd do (highlights show, planned moves display), but nothing submits until their turn. Keeps players engaged during wait/async periods.

**Visual Style**
- Styled placeholder art: colored tiles with subtle patterns and gradients. Not raw colored squares, not production art. Should look intentional and polished, not broken.
- Adaptive board layout: desktop shows all player boards at equal size around the shared area. Mobile puts your player board large at the bottom, opponents' boards smaller above. Layout responds to viewport dimensions.
- Light + clean aesthetic: light/white background, bright tile colors. Airy, readable. Not dark gaming, not heavy textures.
- Phase 1 visual effects (all powered by PixiJS): scoring particle burst, smooth tile slides with snappy overshoot easing, placement feedback flash/pulse, ambient board glow via PixiJS filters

**Game Definition Format**
- Data-heavy game.json: maximally declarative. Zones, pieces, board layout, scoring tables, turn order structure, win conditions — everything that CAN be expressed as data SHOULD be. Hooks are only for logic that can't be declarative.
- TypeScript hooks: hooks written in TypeScript. Runs in browser and compiles for server validation. Same language as the frontend.
- Hybrid zones: zones have a name and a type (grid, stack, hand, deck, discard). The engine knows how to render and interact with each type by default. Hooks can override any zone behavior.
- Pieces: sprite-based rendering when asset images exist, auto-generated procedural shapes (colored shape + text label) as fallback.

**NX Monorepo Structure**
- NX monorepo using standard apps/ + libs/ convention
- `apps/client/` — SvelteKit web application
- `apps/server/` — C# API server (.NET)
- `apps/infra/` — CDK stack, Docker Compose, deployment scripts
- `libs/engine/` — engine sub-libs (organization is Claude's discretion)
- `libs/shared-types/` — cross-cutting types shared by client, server, engine, and games
- `libs/games/azul/` — Azul starts in monorepo for fast iteration
- Games are external packages long-term (separate git repos using engine SDK)
- Engine SDK published as an npm package from the monorepo

**Database**
- PostgreSQL for all persistence (not DynamoDB)
- Game state stored as JSONB columns
- Optimistic locking via version column + conditional UPDATE

**Dev Environment**
- Docker Compose orchestrates the full local stack. `docker compose up` starts everything.
- Four services: SvelteKit frontend (Vite HMR), C# API server (dotnet watch), PostgreSQL, LocalStack
- Watch mode on both frontend and backend

**Testing Strategy**
- Unit tests for engine internals: FSM transitions, game state mutations, hook execution, zone/piece operations
- Integration tests for the full stack: boot engine, load game.json, execute moves through the API, verify state
- Tests run inside Docker containers

### Claude's Discretion
- Engine libs internal organization (single lib vs feature-sliced sub-libs)
- Exact PixiJS filter parameters (glow intensity, particle count, animation timing curves)
- Procedural shape generation algorithm for piece fallback rendering
- How C# server integrates with NX (nx-dotnet plugin vs custom executors wrapping dotnet CLI)
- Test framework selection (xUnit for C#, vitest for TypeScript)
- NX caching and task pipeline configuration

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENG-01 | Game engine provides zone/board primitives (grids, freeform areas, hands, decks, discard piles) | Zone type enum + engine renderer binding; game.json declares zones, engine renders by type |
| ENG-02 | Game engine provides piece primitives (cards, tokens, tiles, dice) with properties and state | Piece descriptor in game.json; sprite asset with procedural fallback; state held in FSM context |
| ENG-03 | Game engine provides hierarchical FSM runtime (Game > Phase > Turn > Stage) with parallel regions | XState v5 `createMachine` with nested `states` + `type: 'parallel'` for simultaneous player regions |
| ENG-04 | Server validates every move against state machine + game hooks; client never enforces rules | ASP.NET Core Minimal API POST /games/:id/move; server holds FSM + evaluates hooks.ts compiled output |
| ENG-05 | Client receives validMoves[] from server for legal move highlighting | Server returns `validMoves[]` in response; client applies GlowFilter to matching pieces/zones |
| ENG-06 | IRenderer interface abstracts rendering; game logic never imports renderer directly | Custom TypeScript `IRenderer` interface wrapping PixiJS `AbstractRenderer`; game code only calls IRenderer |
| ENG-07 | PixiJS 8 WebGL adapter implements IRenderer as primary renderer | PixiJS 8.16.0 with `autoDetectRenderer`; `preference: 'webgl'`; adapter wraps PixiJS Application |
| ENG-08 | Zoom/pan works on all devices — pinch-to-zoom mobile, scroll-wheel desktop, drag to pan | pixi-viewport 6.0.3 (PixiJS v8 compatible); `.drag().pinch().wheel().decelerate()` chain |
| ENG-09 | Touch targets minimum 44px; no hover-dependent interactions | PixiJS hitArea + eventMode='static' on interactive objects; minimum 44px bounds enforced in piece/zone render |
| ENG-10 | Games defined as data (game.json) + script hooks (hooks.ts) on shared engine | JSON schema for game.json; TypeScript interface for hook function signatures; server compiles+runs hooks |
| INFR-01 | All services build and run via Docker containers — no local tool dependencies beyond Docker | Multi-stage Dockerfiles for each service; no host tool requirements documented |
| INFR-02 | Docker Compose orchestrates the full local development stack | docker-compose.yml with 4 services: client (Vite HMR), server (dotnet watch), PostgreSQL, LocalStack |
</phase_requirements>

---

## Summary

Phase 1 builds the foundational scaffolding that all subsequent phases depend on: the NX monorepo, the IRenderer abstraction, the PixiJS adapter, the XState-powered FSM runtime, the game definition contract (game.json + hooks.ts), and a fully Dockerized dev environment. Every architectural decision made here is a load-bearing constraint for the six-phase roadmap.

The technology choices are all well-proven and currently maintained. PixiJS 8.16 is stable and production-ready with a clean `AbstractRenderer` base that makes wrapping straightforward. XState v5.28.0 handles hierarchical statecharts and parallel regions natively. NX 22 has an official `@nx/dotnet` plugin replacing the deprecated community one. The main integration complexity is NX + SvelteKit (no first-class plugin; requires manual Vite configuration) and PixiJS + SvelteKit (SSR collision requiring dynamic imports or a shim).

The game.json + hooks.ts contract is a custom design pattern — not a library. The closest reference implementations are boardgame.io (pure-code game definitions) and Boardzilla (TypeScript-first, shared client/server code). This project's approach is more data-driven than either, which is the right call for the AI generation pipeline in Phase 5.

**Primary recommendation:** Scaffold the NX monorepo first (one command establishes the project graph), then stub the IRenderer interface and PixiJS adapter, then build the FSM runtime, then wire game.json loading. Docker Compose and test scaffolding can run in parallel with FSM work.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NX | 22.5.3 | Monorepo orchestration, task graph, caching | Industry standard for TypeScript monorepos; official dotnet support |
| SvelteKit | 2.53.4 | Frontend app framework | Locked decision; Svelte 5 runes model aligns with reactive game state |
| Svelte | 5.53.6 | UI component runtime | Locked decision; v5 is current stable (released Oct 2024) |
| PixiJS | 8.16.0 | WebGL 2D rendering engine (behind IRenderer) | Locked decision; fastest 2D WebGL; WebGPU-ready; active maintenance |
| pixi-filters | 6.1.5 | GlowFilter, other visual effects | Official PixiJS filter collection; GlowFilter for piece selection feedback |
| pixi-viewport | 6.0.3 | Zoom/pan/pinch camera for PixiJS | Only maintained viewport library supporting PixiJS v8; chainable plugin API |
| XState | 5.28.0 | Hierarchical FSM + parallel states runtime | Industry standard statecharts library; TypeScript-first; 1M weekly downloads |
| PostgreSQL | 16+ (Docker image) | Game state persistence (JSONB) + relational data | Locked decision; replaces DynamoDB |
| LocalStack | latest | Local AWS service emulation (S3, SES, etc.) | Locked decision; enables offline AWS development |
| .NET / C# | 8 (SDK image) | API server | Non-negotiable constraint per project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @nx/dotnet | 22.5.3 | NX generators + executors for .NET projects | Required for NX task graph integration with C# projects |
| @nx/vite | 22.5.3 | NX Vite integration for SvelteKit | Required for `nxViteTsPaths()` plugin — resolves shared lib imports |
| @nx/vitest | 22.5.3 | NX Vitest runner integration | Unit tests for TypeScript engine libs |
| vitest | 4.0.18 | TypeScript unit test runner | Vite-native; fast; used in engine libs and game logic |
| xUnit | latest NuGet | C# unit test framework | Standard .NET test framework; good Docker test runner support |
| Testcontainers (.NET) | latest NuGet | Integration tests with real PostgreSQL in Docker | Spin up real Postgres for API integration tests without Docker Compose dependency |
| @mszu/pixi-ssr-shim | latest | Fix PixiJS "self is not defined" crash in SvelteKit SSR | Required for SvelteKit SSR compatibility with PixiJS |
| npgsql / EF Core | latest NuGet | PostgreSQL ORM for C# | Official PostgreSQL .NET provider; native JSONB support |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| XState | Custom FSM implementation | Custom is simpler for trivial cases but misses parallel regions, devtools, TypeScript inference, and visualization |
| XState | Zustand + custom state machine | Zustand is a state store, not a statechart — doesn't model legal state transitions or parallel regions |
| pixi-viewport | Custom pan/zoom implementation | pixi-viewport handles Safari pinch gesture quirks, pointer vs touch event unification, and deceleration physics — all hard edge cases |
| @nx/dotnet | Custom NX executors wrapping `dotnet` CLI | @nx/dotnet provides project inference, MSBuild dependency graph, and task targets for free |
| pixi-filters GlowFilter | Custom WebGL shader filter | pixi-filters GlowFilter is maintained and tunable; custom shaders are a rabbit hole for a Phase 1 visual effect |

**Installation:**
```bash
# NX monorepo bootstrap
npx create-nx-workspace@latest bga2 --preset=apps --packageManager=npm

# SvelteKit app
nx add @sveltejs/kit
nx generate @nx/vite:app apps/client

# Engine libs
nx generate @nx/js:library libs/engine/core --bundler=vite
nx generate @nx/js:library libs/shared-types --bundler=vite

# .NET
nx add @nx/dotnet
nx generate @nx/dotnet:application apps/server

# PixiJS stack
npm install pixi.js pixi-filters pixi-viewport

# FSM
npm install xstate

# Testing (TypeScript)
npm install -D vitest @nx/vitest

# PixiJS SSR fix
npm install @mszu/pixi-ssr-shim
```

---

## Architecture Patterns

### Recommended Project Structure

```
bga2/
├── apps/
│   ├── client/                    # SvelteKit PWA
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   └── game/[id]/+page.svelte   # game canvas mount
│   │   │   └── lib/
│   │   ├── vite.config.ts         # nxViteTsPaths() plugin
│   │   └── svelte.config.js
│   ├── server/                    # C# ASP.NET Minimal API
│   │   ├── Program.cs
│   │   ├── Endpoints/
│   │   │   └── GameEndpoints.cs   # POST /games/:id/move
│   │   └── apps/server.csproj
│   └── infra/                     # Docker Compose, CDK
│       ├── docker-compose.yml
│       └── docker-compose.override.yml   # dev volumes + watch
├── libs/
│   ├── engine/
│   │   ├── core/                  # IRenderer, FSM runtime, game loader
│   │   │   └── src/
│   │   │       ├── renderer/
│   │   │       │   ├── IRenderer.ts
│   │   │       │   └── PixiAdapter.ts
│   │   │       ├── fsm/
│   │   │       │   ├── GameFSM.ts
│   │   │       │   └── types.ts
│   │   │       ├── loader/
│   │   │       │   └── GameLoader.ts
│   │   │       └── index.ts
│   │   └── pixi/                  # (optional) PixiJS-specific helpers
│   ├── shared-types/              # Move, Player, GameConfig, Zone, Piece
│   │   └── src/index.ts
│   └── games/
│       └── azul/                  # Azul game package
│           ├── game.json
│           ├── hooks.ts
│           └── assets/
├── tsconfig.base.json             # path aliases for all libs
├── nx.json
└── package.json
```

### Pattern 1: IRenderer Interface + PixiJS Adapter

**What:** Game logic talks only to `IRenderer`. The PixiJS adapter implements it. A no-op stub renderer exists for testing.

**When to use:** Every rendering call from engine or game code.

**Example:**
```typescript
// libs/engine/core/src/renderer/IRenderer.ts
// Based on PixiJS AbstractRenderer contract + custom game needs

export interface IRenderer {
  // Lifecycle
  init(container: HTMLElement, options: RendererOptions): Promise<void>;
  destroy(): void;
  resize(width: number, height: number): void;

  // Scene graph
  createSprite(textureId: string): ISpriteHandle;
  createContainer(): IContainerHandle;
  addToStage(handle: ISceneHandle): void;
  removeFromStage(handle: ISceneHandle): void;

  // Interaction
  setInteractive(handle: ISpriteHandle, enabled: boolean): void;
  onPointerDown(handle: ISpriteHandle, cb: () => void): void;

  // Effects (PixiJS adapter uses pixi-filters; stub no-ops these)
  applyGlow(handle: ISpriteHandle, color: number, strength: number): void;
  removeGlow(handle: ISpriteHandle): void;
  animateTo(handle: ISpriteHandle, x: number, y: number, opts: AnimateOptions): Promise<void>;

  // Viewport (PixiJS adapter uses pixi-viewport; stub returns noop)
  enableViewport(options: ViewportOptions): IViewportHandle;
}

// libs/engine/core/src/renderer/PixiAdapter.ts
import '@mszu/pixi-ssr-shim';  // MUST be first import
import { Application, Sprite, Texture, Container } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { Viewport } from 'pixi-viewport';

export class PixiAdapter implements IRenderer {
  private app!: Application;
  private viewport!: Viewport;

  async init(container: HTMLElement, options: RendererOptions): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: container,
      preference: 'webgl',
      antialias: true,
      background: 0xfafaf8,  // light + clean aesthetic
    });
    container.appendChild(this.app.canvas);

    this.viewport = new Viewport({
      screenWidth: container.clientWidth,
      screenHeight: container.clientHeight,
      worldWidth: options.worldWidth,
      worldHeight: options.worldHeight,
      events: this.app.renderer.events,  // REQUIRED for pixi-viewport v6
    });
    this.viewport.drag().pinch().wheel().decelerate();
    this.app.stage.addChild(this.viewport);
  }
  // ... rest of implementation
}
```

### Pattern 2: XState Hierarchical FSM with Parallel Regions

**What:** Game > Phase > Turn > Stage as nested XState states. Two simultaneous players modeled as parallel regions within a Turn state.

**When to use:** All game state transitions are driven through this FSM.

**Example:**
```typescript
// libs/engine/core/src/fsm/GameFSM.ts
// Source: https://stately.ai/docs/parallel-states
import { createMachine, createActor } from 'xstate';

export const gameMachine = createMachine({
  id: 'azul',
  initial: 'playing',
  context: {
    gameState: {} as GameState,
    round: 0,
  },
  states: {
    playing: {
      initial: 'draftingPhase',
      states: {
        draftingPhase: {
          initial: 'turn',
          states: {
            turn: {
              // Parallel regions for multi-player simultaneous turns (if applicable)
              // For Azul drafting: sequential turns, so no parallel here
              // But the FSM supports parallel for games that need it:
              type: 'parallel' as const,  // set when players act simultaneously
              states: {
                player1: {
                  initial: 'waiting',
                  states: {
                    waiting: { on: { SELECT_TILE_P1: 'selected' } },
                    selected: { on: { PLACE_TILE_P1: 'done' } },
                    done: { type: 'final' as const },
                  },
                },
                player2: {
                  initial: 'waiting',
                  states: {
                    waiting: { on: { SELECT_TILE_P2: 'selected' } },
                    selected: { on: { PLACE_TILE_P2: 'done' } },
                    done: { type: 'final' as const },
                  },
                },
              },
              onDone: 'scoring',  // fires when ALL parallel regions reach final
            },
            scoring: {
              on: { SCORING_DONE: 'turn' },
            },
          },
          on: { PHASE_END: '#azul.playing.tilingPhase' },
        },
        tilingPhase: {
          // ... similar structure
        },
      },
      on: { GAME_END: 'finished' },
    },
    finished: { type: 'final' as const },
  },
});

export const gameActor = createActor(gameMachine);
```

### Pattern 3: game.json Contract

**What:** Declarative game definition that the engine loader parses. Hooks are TypeScript functions compiled and evaluated separately.

**When to use:** Every game is defined this way — both in-monorepo games and future external packages.

**Example:**
```json
// libs/games/azul/game.json
{
  "id": "azul",
  "version": "1.0.0",
  "title": "Azul",
  "players": { "min": 2, "max": 4 },
  "zones": [
    {
      "id": "factory-0",
      "type": "stack",
      "capacity": 4,
      "position": { "x": 100, "y": 100 },
      "render": { "shape": "circle", "size": 120 }
    },
    {
      "id": "pattern-line-0",
      "type": "grid",
      "rows": 5,
      "cols": 1,
      "owner": "player",
      "render": { "cellSize": 52 }
    }
  ],
  "pieces": [
    {
      "id": "tile-blue",
      "type": "tile",
      "asset": "tiles/blue.png",
      "fallback": { "shape": "square", "color": "#4A90D9", "label": "B" }
    }
  ],
  "turnOrder": "sequential",
  "hooks": {
    "file": "hooks.ts",
    "events": ["onMove", "onRoundEnd", "getValidMoves"]
  }
}
```

```typescript
// libs/games/azul/hooks.ts — implements engine hook contract
import type { HookContext, Move, ValidMove } from '@bga2/shared-types';

export function getValidMoves(ctx: HookContext): ValidMove[] {
  // Returns array of legal moves for the current player
  // This runs server-side for validation AND client-side for highlighting
  return [];
}

export function onMove(ctx: HookContext, move: Move): void {
  // Mutates ctx.state in response to a validated move
}

export function onRoundEnd(ctx: HookContext): void {
  // Scoring logic
}
```

### Pattern 4: SvelteKit + PixiJS Canvas Mount

**What:** PixiJS cannot run during SSR. Mount only inside `onMount`.

**When to use:** Any SvelteKit route/component that hosts the game canvas.

**Example:**
```svelte
<!-- apps/client/src/routes/game/[id]/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { IRenderer } from '@bga2/engine-core';

  let container: HTMLDivElement;
  let renderer: IRenderer;

  onMount(async () => {
    // Dynamic import ensures PixiJS never loads during SSR
    const { PixiAdapter } = await import('@bga2/engine-core/renderer/PixiAdapter');
    renderer = new PixiAdapter();
    await renderer.init(container, { worldWidth: 2000, worldHeight: 1500 });
  });

  onDestroy(() => {
    renderer?.destroy();
  });
</script>

<div bind:this={container} class="game-canvas" />
```

### Pattern 5: Docker Compose Dev Stack

**What:** Full local stack in one compose file. Watch mode enabled for both frontend and backend.

**Example:**
```yaml
# apps/infra/docker-compose.yml
services:
  client:
    build:
      context: ../..
      dockerfile: apps/client/Dockerfile
    ports:
      - "5173:5173"
      - "24678:24678"  # Vite HMR websocket
    volumes:
      - ../../apps/client:/app/apps/client   # source mount for HMR
      - ../../libs:/app/libs
    environment:
      - CHOKIDAR_USEPOLLING=true  # required for Docker volume file watching
    command: npm run dev -- --host 0.0.0.0

  server:
    build:
      context: ../..
      dockerfile: apps/server/Dockerfile
    ports:
      - "8080:8080"
    volumes:
      - ../../apps/server:/app/apps/server   # source mount for dotnet watch
    environment:
      - DOTNET_USE_POLLING_FILE_WATCHER=1    # required for Docker mounted volumes
      - ConnectionStrings__Default=Host=db;Database=bga2;Username=bga2;Password=secret
    command: dotnet watch run --project apps/server/apps/server.csproj

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bga2
      POSTGRES_USER: bga2
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=s3,ses
    volumes:
      - localstack_data:/var/lib/localstack

volumes:
  pgdata:
  localstack_data:
```

### Anti-Patterns to Avoid

- **Importing PixiJS at the module level in SvelteKit**: Crashes SSR with "self is not defined". Always use `onMount` + dynamic import for the PixiAdapter, never static top-level imports.
- **Game logic calling PixiJS directly**: Violates the IRenderer abstraction. Game code must only call `IRenderer` methods. The PixiJS adapter is a leaf implementation, never a dependency of game logic.
- **Putting game rules in the client FSM**: The FSM runtime runs on both client and server, but rule enforcement (getValidMoves, move validation) is server-only. The client FSM tracks UI state; move legality comes from `validMoves[]` returned by the server.
- **Synchronous PixiJS Application construction**: PixiJS v8 requires `await app.init()`. Do not use the v7 synchronous constructor pattern.
- **Using @nx-dotnet/core**: This package is deprecated. Use `@nx/dotnet` (official, NX 22+).
- **Using @nxext/sveltekit**: This plugin is in alpha/dormant state. Use `@nx/vite` with manual SvelteKit configuration and `nxViteTsPaths()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zoom/pan/pinch camera | Custom pointer event handler | pixi-viewport 6.0.3 | Handles Safari GestureEvent API quirks, trackpad pinch vs touch pinch disambiguation, deceleration physics, edge clamping |
| Glow selection feedback | Custom WebGL shader filter | `GlowFilter` from pixi-filters | Tunable `color`, `outerStrength`, `innerStrength`; already WebGL + WebGPU compatible |
| FSM with parallel regions | Custom state machine | XState v5 | Parallel region synchronization (onDone fires when ALL regions reach final) is deceptively complex; XState also provides devtools and TypeScript inference |
| Monorepo task orchestration | npm workspaces scripts | NX 22 | NX computes affected projects, parallelizes tasks, caches outputs — critical as the monorepo grows across 6 phases |
| .NET project graph integration | Shell scripts wrapping dotnet CLI | @nx/dotnet | Project inference, MSBuild dependency analysis, first-class NX task targets |
| PostgreSQL JSONB optimistic locking | Manual version check queries | EF Core Npgsql xmin concurrency token | PostgreSQL `xmin` system column auto-updates on every row change; maps to `[Timestamp]` attribute in EF Core |
| TypeScript path resolution in monorepo | tsconfig path aliases only | `nxViteTsPaths()` in vite.config.ts + `tsconfig.base.json` paths | Vite's module resolver and tsc have separate resolution stacks; both need configuration |

**Key insight:** The pixi-viewport and XState parallel regions problems both look simple but have production-breaking edge cases (Safari pinch event API, parallel onDone synchronization). These are the exact kind of problems that libraries exist to solve.

---

## Common Pitfalls

### Pitfall 1: PixiJS SSR Crash in SvelteKit

**What goes wrong:** Importing `pixi.js` at the top level of any `.svelte` or `.ts` file that SvelteKit SSR touches throws `ReferenceError: self is not defined` during `vite build` or `vite preview`.

**Why it happens:** PixiJS uses browser globals (`self`, `window`, `document`) at module load time. Node.js doesn't have these.

**How to avoid:** Two-layer approach:
1. Install `@mszu/pixi-ssr-shim` and import it first in the PixiAdapter file: `import '@mszu/pixi-ssr-shim'`
2. In SvelteKit components, only instantiate the PixiAdapter inside `onMount` using a dynamic import: `const { PixiAdapter } = await import(...)`
3. Alternatively, set `export const ssr = false` in game route's `+page.js` to make the entire game page a CSR-only SPA

**Warning signs:** Build succeeds in dev (`vite dev`) but fails in `vite build` or when running the preview. The error mentions `self`, `window`, or `document`.

### Pitfall 2: pixi-viewport Missing `events` Option

**What goes wrong:** Viewport drag/pinch/wheel silently does nothing, or throws `Cannot read properties of undefined`.

**Why it happens:** pixi-viewport v6 (for PixiJS v8) requires the `events` option to be the renderer's events system: `events: app.renderer.events`. This replaced the old `interaction` plugin.

**How to avoid:** Always pass `events: this.app.renderer.events` in the Viewport constructor. This must be called after `await app.init()`.

**Warning signs:** Viewport constructed without error but mouse/touch events don't fire.

### Pitfall 3: Vite HMR Broken in Docker

**What goes wrong:** SvelteKit dev server starts inside Docker but code changes on the host don't trigger hot reload in the browser.

**Why it happens:** Two root causes: (1) Docker volume file watching on Linux may not propagate inotify events without polling, and (2) the Vite HMR WebSocket must be exposed on port 24678 (not just 5173).

**How to avoid:**
- Set `CHOKIDAR_USEPOLLING=true` in the container environment
- Expose both port 5173 (HTTP) and port 24678 (WebSocket HMR) in docker-compose.yml
- Run SvelteKit with `--host 0.0.0.0` so the container accepts connections from outside

**Warning signs:** Browser shows the app but doesn't update when you save a file. Network tab shows WebSocket connection to HMR failing.

### Pitfall 4: dotnet watch Ignoring File Changes in Docker

**What goes wrong:** `dotnet watch run` inside a Docker container doesn't rebuild when source files on the host change.

**Why it happens:** `System.IO.FileSystemWatcher` doesn't work reliably with Docker mounted volumes. Requires polling-based file watcher.

**How to avoid:** Set `DOTNET_USE_POLLING_FILE_WATCHER=1` in the container environment.

**Warning signs:** dotnet watch process shows no "Build succeeded" messages after you save a C# file.

### Pitfall 5: NX + SvelteKit TypeScript Path Resolution

**What goes wrong:** SvelteKit app imports from `@bga2/engine-core` work in TypeScript IDE but fail at runtime or build time.

**Why it happens:** SvelteKit's Vite plugin resolves from the SvelteKit project root, not the NX workspace root. TypeScript paths in `tsconfig.base.json` are visible to tsc but not to Vite's module resolver.

**How to avoid:**
- Add `nxViteTsPaths()` to `vite.config.ts` plugins array in every app that imports shared libs
- Define path aliases in `tsconfig.base.json` at workspace root (not individual project tsconfigs)
- Ensure SvelteKit `package.json` libs have a `package.json` at their root (SvelteKit requires this for imports)

**Warning signs:** TypeScript IDE shows no errors, but `npm run dev` or `npm run build` fails with "Cannot find module '@bga2/engine-core'".

### Pitfall 6: XState v5 Parallel onDone Behavior

**What goes wrong:** Using `onDone` on a parallel state fires before all regions have completed.

**Why it happens:** `onDone` on a parallel state fires only when ALL regions have reached a `final` state. If any region's states don't include a `type: 'final'` terminal state, `onDone` never fires.

**How to avoid:** Every region in a parallel state that should participate in the `onDone` synchronization must have at least one state with `type: 'final'`. Test this with a simple two-region machine before wiring it into game logic.

**Warning signs:** Game never advances past the parallel turn phase.

### Pitfall 7: PixiJS v8 Async Init Not Awaited

**What goes wrong:** Sprites added to stage before `await app.init()` completes throw errors or silently fail to render.

**Why it happens:** PixiJS v8 initialization is async (required for WebGPU renderer detection). The `Application` constructor no longer accepts options — all config goes into `app.init()` which returns a Promise.

**How to avoid:** Always `await app.init(options)` before adding anything to `app.stage`. The PixiAdapter's `init()` method is already async — make sure callers await it.

---

## Code Examples

Verified patterns from official sources:

### PixiJS v8 Application Bootstrap
```typescript
// Source: https://pixijs.com/8.x/guides/components/application
import { Application } from 'pixi.js';

const app = new Application();
await app.init({
  resizeTo: containerElement,
  preference: 'webgl',
  background: 0xfafaf8,
  antialias: true,
});
containerElement.appendChild(app.canvas);
```

### pixi-viewport v6 Full Setup
```typescript
// Source: https://github.com/pixijs-userland/pixi-viewport
import { Viewport } from 'pixi-viewport';

// MUST be called after await app.init()
const viewport = new Viewport({
  screenWidth: window.innerWidth,
  screenHeight: window.innerHeight,
  worldWidth: 2000,
  worldHeight: 1500,
  events: app.renderer.events,  // critical: pass events system
});

app.stage.addChild(viewport);

viewport
  .drag()          // left-click drag to pan
  .pinch()         // two-finger pinch to zoom (mobile)
  .wheel()         // scroll wheel to zoom (desktop)
  .decelerate();   // momentum-based movement after drag
```

### GlowFilter Application
```typescript
// Source: https://pixijs.io/filters/docs/GlowFilter.html
import { GlowFilter } from 'pixi-filters';

// Apply glow for selected piece (light + clean theme: blue-tinted)
const glow = new GlowFilter({
  color: 0x4A90D9,
  outerStrength: 3,
  innerStrength: 0,
  distance: 15,
});
sprite.filters = [glow];

// Remove glow
sprite.filters = [];
```

### XState v5 Parallel Regions
```typescript
// Source: https://stately.ai/docs/parallel-states
import { createMachine, createActor } from 'xstate';

const turnMachine = createMachine({
  id: 'turn',
  type: 'parallel',
  states: {
    player1: {
      initial: 'active',
      states: {
        active: { on: { SUBMIT_P1: 'submitted' } },
        submitted: { type: 'final' },
      },
    },
    player2: {
      initial: 'active',
      states: {
        active: { on: { SUBMIT_P2: 'submitted' } },
        submitted: { type: 'final' },
      },
    },
  },
  // onDone fires only when BOTH player1 AND player2 reach 'submitted'
});
```

### Npgsql xmin Optimistic Locking
```csharp
// Source: https://www.npgsql.org/efcore/modeling/concurrency.html
public class GameSession
{
    public Guid Id { get; set; }
    public string State { get; set; } = "{}";  // JSONB stored as string
    public int Version { get; set; }

    // xmin is a PostgreSQL system column that auto-increments on every UPDATE
    // Maps to optimistic concurrency without a manual version column
    [Timestamp]
    public uint RowVersion { get; set; }
}

// In DbContext:
modelBuilder.Entity<GameSession>()
    .UseXminAsConcurrencyToken();

// Concurrent UPDATE will throw DbUpdateConcurrencyException if row was modified
```

### ASP.NET Core Minimal API Move Endpoint
```csharp
// apps/server/Endpoints/GameEndpoints.cs
app.MapPost("/games/{gameId}/move", async (
    Guid gameId,
    MoveRequest move,
    GameService gameService) =>
{
    var result = await gameService.ValidateAndApplyMove(gameId, move);
    if (!result.IsValid)
        return Results.BadRequest(result.Errors);

    return Results.Ok(new {
        state = result.NewState,
        validMoves = result.ValidMoves,  // Client uses this for highlighting
    });
});
```

### NX Vite TypeScript Path Resolution
```typescript
// apps/client/vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  plugins: [
    sveltekit(),
    nxViteTsPaths(),  // Resolves @bga2/* path aliases from tsconfig.base.json
  ],
  server: {
    host: '0.0.0.0',  // Required for Docker
    hmr: {
      port: 24678,    // HMR WebSocket port — must be exposed in docker-compose
    },
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PixiJS v7 synchronous `new Application(options)` | PixiJS v8 `await app.init(options)` | v8.0 (2024) | All initialization code must be async |
| PixiJS v7 `DisplayObject` base class | PixiJS v8 `Container` base class | v8.0 (2024) | All scene nodes are Containers; leaf nodes (Sprite, Mesh) can't have children |
| PixiJS v7 `@pixi/filter-glow` separate package | PixiJS v8 `pixi-filters` unified package | v6.0 filters (2024) | Single package install for all filters |
| pixi-viewport v5 (PixiJS v7) | pixi-viewport v6 (PixiJS v8) | v6.0.0 (Nov 2024) | Must pass `events: app.renderer.events` instead of old `interaction` |
| `@nx-dotnet/core` community plugin | `@nx/dotnet` official NX plugin | NX 22 (2025) | Official plugin; project inference; MSBuild integration; migration is 10 minutes |
| XState v4 `Machine()` factory | XState v5 `createMachine()` + actors | v5.0 (Dec 2023) | TypeScript inference dramatically improved; actor model replaces service model |
| NX + SvelteKit via `@nxext/sveltekit` | NX + SvelteKit via `@nx/vite` + manual config | 2024-2025 | `@nxext/sveltekit` is dormant alpha; manual Vite config is the working path |

**Deprecated/outdated:**
- `@nx-dotnet/core`: Deprecated; migration to `@nx/dotnet` takes <10 minutes
- `@nxext/sveltekit`: Alpha/dormant; do not use; manually configure SvelteKit with `@nx/vite`
- PixiJS `DisplayObject`: Removed in v8; use `Container`
- PixiJS `BaseTexture`: Removed in v8; use `TextureSource` variants
- XState v4 `service.start()` pattern: v5 uses `createActor(machine).start()`

---

## Open Questions

1. **Engine lib organization: single vs feature-sliced sub-libs**
   - What we know: CONTEXT.md marks this as Claude's discretion. NX supports both `libs/engine/` as one lib or `libs/engine/core`, `libs/engine/pixi`, `libs/engine/fsm` as separate libs.
   - What's unclear: Whether early separation adds complexity that slows Phase 1, or whether it's worth the cleaner dependency graph.
   - Recommendation: Start with `libs/engine/core` as a single lib. Split into sub-libs when a natural seam emerges (likely when the PixiJS adapter grows to >500 lines). NX makes splitting later low-cost.

2. **How hooks.ts runs server-side in C#**
   - What we know: hooks.ts is TypeScript. The C# server needs to execute it for move validation. The CONTEXT.md says hooks "compile for server validation."
   - What's unclear: The exact mechanism — Node.js subprocess from C#? Jint JS interpreter in C#? Pre-compiled to WASM?
   - Recommendation: Use Jint (C# JavaScript interpreter) for Phase 1 — it's a NuGet package, no subprocess overhead, runs in-process. Alternative is a separate Node.js sidecar service called via HTTP, but that adds Docker service complexity. Jint is sufficient for Phase 1 server-authoritative validation.

3. **game.json JSON Schema formalization**
   - What we know: The format is custom-designed for this project. No existing library defines it.
   - What's unclear: Should Phase 1 include a JSON Schema file for validation and IDE intellisense, or is TypeScript interfaces sufficient?
   - Recommendation: Define TypeScript interfaces first (`GameConfig`, `ZoneDef`, `PieceDef`) in `libs/shared-types`. Generate JSON Schema from those using `ts-json-schema-generator` if IDE support becomes needed. Don't invest in the schema in Phase 1.

4. **NX SvelteKit `package.json` requirement for libs**
   - What we know: SvelteKit requires libraries it imports to have a `package.json` at their root in some configurations (issue sveltejs/kit#2973).
   - What's unclear: Whether NX-generated libs include this automatically or need manual addition.
   - Recommendation: Add a minimal `package.json` to each lib that the SvelteKit app imports. This is a known workaround and takes 30 seconds per lib.

---

## Sources

### Primary (HIGH confidence)
- PixiJS official docs (https://pixijs.com/8.x/) — renderer architecture, async init, v8 migration guide
- pixi-viewport GitHub (https://github.com/pixijs-userland/pixi-viewport) — v6.0.3 release notes, PixiJS v8 compatibility, events API
- XState/Stately docs (https://stately.ai/docs/) — parallel states API, createMachine, TypeScript requirements
- Npgsql EF Core docs (https://www.npgsql.org/efcore/modeling/concurrency.html) — xmin concurrency token
- npm registry (verified via `npm view`) — all version numbers confirmed as of 2026-03-01

### Secondary (MEDIUM confidence)
- pixi-filters npm page — version 6.1.5 confirmed current; GlowFilter parameters
- LocalStack Docker docs (https://docs.docker.com/guides/localstack/) — docker-compose setup patterns
- nx-dotnet.com — @nx-dotnet/core deprecated; @nx/dotnet recommended
- NX docs (https://nx.dev/docs/technologies/dotnet) — @nx/dotnet generators
- Microsoft Learn minimal APIs — endpoint pattern for move validation

### Tertiary (LOW confidence)
- WebSearch results on SvelteKit + NX integration: consensus points to @nx/vite + nxViteTsPaths() + manual config, but no single authoritative guide for the exact stack (SvelteKit 2 + NX 22 + @nx/dotnet). Integration approach is derived from combining multiple partial sources.
- Jint JS interpreter recommendation for server-side hooks.ts execution: based on known C# JS interpretation patterns, not directly verified for this use case in Phase 1 context.

---

## Metadata

**Confidence breakdown:**
- Standard stack versions: HIGH — verified via `npm view` directly against registry
- PixiJS adapter pattern: HIGH — verified against official PixiJS 8 docs and AbstractRenderer API
- pixi-viewport API: HIGH — verified against v6 GitHub README and npm
- XState parallel regions: HIGH — verified against Stately official docs with code examples
- NX + SvelteKit integration: MEDIUM — no single official guide; synthesized from multiple community sources and NX issue tracker
- Hooks.ts server execution (Jint): LOW — architectural recommendation not verified with working code
- Docker dev environment patterns: HIGH — well-documented across multiple authoritative sources

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable libraries) / 2026-03-15 (NX + SvelteKit integration — fast-moving)
