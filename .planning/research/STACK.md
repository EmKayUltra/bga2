# Stack Research

**Domain:** Digital board game platform (BGA competitor)
**Researched:** 2026-02-28
**Confidence:** MEDIUM (most findings verified via official docs or multiple credible sources; renderer abstraction patterns and anti-cheat approaches are MEDIUM due to reliance on verified community practice)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| SvelteKit | 2.49+ (Svelte 5) | Frontend framework + routing + PWA shell | Compiler-based — no virtual DOM overhead; 47KB bundle vs React's 156KB for equivalent app; `$effect` rune maps cleanly to `requestAnimationFrame` game loops; jQuery-era mental model translates better than React's component/hook paradigm; PWA support via `@vite-pwa/sveltekit` is first-class |
| PixiJS | 8.16+ | 2D renderer (Canvas 2D fallback + WebGL primary) | WebGL-primary with automatic Canvas 2D fallback; v8 unified renderer, tree-shakeable, 100K+ sprites at 60fps; the abstraction layer sits HERE — game logic never calls PixiJS directly, only the renderer adapter does |
| AWS AppSync Events | managed | Real-time WebSocket pub/sub for game sessions | 3x cheaper than API Gateway WebSocket ($0.08/M connection-minutes vs $0.25); native pub/sub model with channel namespaces maps perfectly to game rooms; Lambda data source integration with C# supported via `Amazon.Lambda.AppSyncEvents` NuGet; eliminates manual connection-ID tracking in DynamoDB |
| AWS Lambda (.NET 8/Native AOT) | .NET 8 + Native AOT | Game logic API — REST + AppSync event handlers | .NET 10 is available but has a known startup regression; use .NET 8 + Native AOT for now: 940ms AOT cold start vs 6,680ms interpreted; SnapStart available for .NET 8 managed runtime as alternative approach |
| Amazon DynamoDB | managed | Game state persistence + player profiles + session tracking | Single-table design with composite keys (gameId + playerId) supports concurrent sessions, move history, and connection metadata; AWS provides a reference board game tutorial using DynamoDB + SNS |
| Amazon S3 | managed | Static asset hosting (game art, board images, card sprites) | Trivially cheap for assets; pair with CloudFront for CDN delivery |
| Amazon CloudFront | managed | CDN + edge caching for static frontend + assets | Required for low-latency PWA delivery globally; offloads origin completely for static files |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vite-pwa/sveltekit` | 1.1+ | PWA manifest, service worker, offline caching | Always — enables installable PWA with offline shell, required for mobile parity |
| `Amazon.Lambda.AppSyncEvents` | latest NuGet | C# handler types for AppSync Events integration | In every Lambda that handles WebSocket game events |
| AWS Powertools for Lambda (.NET) | latest NuGet | Structured logging, tracing, metrics, AppSync Events helpers | Always — reduces boilerplate, integrates with X-Ray and CloudWatch |
| AWS SDK for .NET v3 | latest NuGet | DynamoDB, S3, AppSync management API calls from Lambda | Always — use `AWSSDK.DynamoDBv2`, `AWSSDK.S3` |
| `vite` | 5.x | Build tool for SvelteKit (bundled with SvelteKit) | Automatic — do not configure separately |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| AWS SAM CLI | Local Lambda development, SAM template for IaC | Use for Lambda function packaging and local testing; supports .NET 8 runtimes |
| AWS CDK (C#) | Infrastructure-as-code | Define AppSync, Lambda, DynamoDB, CloudFront in C# — keeps the whole stack in one language |
| dotnet CLI | C# project management and build | Use `dotnet publish -c Release -r linux-x64 --self-contained true` for Native AOT Lambda packages |
| Vite dev server | Frontend hot-reload during development | `npm run dev` — SvelteKit's dev server proxies API calls to local SAM |

---

## Architecture Decision: Renderer Abstraction

This is the most important architectural decision. The renderer must be swappable without rewriting game logic.

**Recommended pattern:** Define a `IRenderer` interface in TypeScript (or a plain JS object with a defined shape) that the game engine calls. The first implementation is a PixiJS adapter. Game logic never imports PixiJS directly.

```typescript
// src/engine/renderer.ts — the contract
export interface BoardRenderer {
  init(container: HTMLElement, width: number, height: number): void;
  drawSprite(id: string, texture: string, x: number, y: number, options?: SpriteOptions): void;
  moveSprite(id: string, x: number, y: number, durationMs?: number): void;
  removeSprite(id: string): void;
  destroy(): void;
}

// src/engine/renderers/pixi-renderer.ts — PixiJS implementation
import { Application, Sprite, Assets } from 'pixi.js';
export class PixiRenderer implements BoardRenderer { ... }

// src/engine/renderers/canvas-renderer.ts — fallback (if needed later)
export class CanvasRenderer implements BoardRenderer { ... }
```

The Svelte component mounts the renderer and passes it to the game engine:

```svelte
<!-- GameBoard.svelte -->
<script>
  import { onMount } from 'svelte';
  import { PixiRenderer } from '$lib/engine/renderers/pixi-renderer';
  import { GameEngine } from '$lib/engine/game-engine';

  let container;
  $effect(() => {
    const renderer = new PixiRenderer();
    const engine = new GameEngine(renderer, gameState);
    renderer.init(container, 1200, 800);
    return () => renderer.destroy();
  });
</script>

<div bind:this={container}></div>
```

**Why PixiJS over raw Canvas 2D:** Board games with many tile pieces (Azul has 100+ tiles) need WebGL throughput. Canvas 2D becomes sluggish when redrawing 60fps with dozens of animated pieces. PixiJS handles this with GPU acceleration and render-instruction caching (v8 only redraws changed nodes). Canvas 2D fallback is available in PixiJS v8.16 for environments without WebGL.

**Why not Godot WASM as renderer:** As of February 2026, C# Godot web export is a prototype (draft PR #106125), not production-ready. The `.pck` file alone is 72MB uncompressed (23.8MB Brotli). The GDScript-only web export works but forces you to maintain two languages (GDScript for Godot, C# for backend). The abstraction layer means you can add a Godot renderer later — do not start there.

**Why not SVG:** SVG is fine for static diagrams. For animated board games with 60fps piece movement, tweening, and particle effects, SVG DOM manipulation is too slow. PixiJS handles all of this natively.

---

## Real-Time Architecture: AppSync Events over API Gateway WebSocket

**Why AppSync Events wins for this project:**

1. **No connection management code.** API Gateway WebSocket requires you to store every `connectionId` in DynamoDB on `$connect`, query all IDs on every broadcast, and POST to the management API per connection — with a known race condition where Lambda exits before all broadcasts complete. AppSync Events handles fan-out internally.

2. **Cheaper.** $0.08/M connection-minutes vs $0.25/M. For a turn-based board game with 4-player sessions, connections are long-lived but infrequent-message — AppSync pricing is significantly better.

3. **Native pub/sub model.** Game rooms map directly to AppSync channel namespaces (e.g., `games/azul-session-123`). All players subscribe to the channel; server publishes a move → all players receive it.

4. **C# Lambda handler support.** The `Amazon.Lambda.AppSyncEvents` NuGet package provides typed handler models. Powertools for AWS Lambda (.NET) has AppSync Events helpers built in.

**Critical: SignalR does NOT work with AWS Lambda.** SignalR requires persistent connections and stateful servers. Lambda is stateless and ephemeral. Do not attempt SignalR on Lambda — it is architecturally incompatible.

**Turn-based game flow with AppSync Events:**

```
Player clicks tile → POST /api/games/{id}/move (Lambda REST handler)
  → Lambda validates move (server-authoritative)
  → Lambda writes new state to DynamoDB
  → Lambda publishes game event to AppSync channel "games/{id}"
  → AppSync broadcasts to all subscribers
  → All clients update their local view from the event payload
```

---

## Server-Authoritative State + Anti-Cheat

**Approach for a turn-based board game:**

The server is the single source of truth. The client only sends *intent* (e.g., "pick tile at position 3 from factory 2"), never state. The Lambda validates:
1. Is it this player's turn?
2. Is the move legal given current board state?
3. Apply the move, write to DynamoDB, broadcast result.

**Client-side prediction is NOT needed for turn-based games.** Client-side prediction exists to mask network latency in action games (FPS, racing) where input must feel instantaneous. For board games, a 50-200ms round-trip to validate a move is imperceptible and acceptable. Do not implement client-side prediction — it adds complexity with no user-visible benefit for this genre.

**Anti-cheat pattern:** HMAC signing is overkill here because the move payloads are *requests* (not state assertions) validated server-side. A player cannot "cheat" by sending a valid HTTP request for an invalid move — the server rejects it. The main vectors to guard against:
- Viewing hidden information (other players' tiles, deck order) — server never sends hidden state to clients
- Replaying old moves — include sequence number + game session ID in every move; Lambda rejects sequence mismatches
- Rate manipulation — Lambda checks turn ownership before processing any move

**DynamoDB optimistic locking for concurrent writes:**

```csharp
// Use DynamoDB ConditionExpression to prevent race conditions
var request = new PutItemRequest {
    TableName = "GameSessions",
    Item = newStateItem,
    ConditionExpression = "sequenceNumber = :expected",
    ExpressionAttributeValues = new Dictionary<string, AttributeValue> {
        { ":expected", new AttributeValue { N = expectedSequence.ToString() } }
    }
};
```

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| React | 156KB bundle vs Svelte's 47KB; virtual DOM overhead unnecessary for a canvas-heavy app where most UI is rendered by PixiJS anyway; steeper learning curve for jQuery-background developer | SvelteKit + Svelte 5 |
| Blazor WASM | Canvas access requires JavaScript interop (every draw call crosses WASM-JS boundary); initial load time remains slow even with AOT; small ecosystem for games; adds complexity without enabling anything Svelte cannot do | SvelteKit — C# stays on the server where it belongs |
| Godot WASM as renderer (v1) | C# web export is a draft prototype as of Feb 2026; GDScript-only web export works but is 40MB+ WASM uncompressed; introduces a second language dependency; bundle size unacceptable for a PWA | PixiJS with renderer abstraction layer (swap to Godot later if desired) |
| SignalR on Lambda | Architecturally incompatible — SignalR requires stateful persistent server connections; Lambda is ephemeral and stateless | AWS AppSync Events |
| API Gateway WebSocket | Requires manual connection-ID storage/retrieval/broadcast code; known race condition on Lambda exit; 3x more expensive than AppSync Events | AWS AppSync Events |
| Client-side prediction | Unnecessary complexity for turn-based games; latency is imperceptible for board game interactions | Server-authoritative validation with fast Lambda response |
| Three.js / Babylon.js | 3D renderers with significant overhead for 2D board games; no benefit for Azul-style games | PixiJS (WebGL 2D) |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SvelteKit | React + Next.js | If you need a massive component ecosystem, have React-experienced team, or need extensive third-party integrations with React-specific libraries |
| SvelteKit | Blazor WASM | Never for this project; consider only if you want to run C# game logic in the browser and are willing to accept the JS interop overhead for every canvas draw call |
| PixiJS | raw Canvas 2D API | For extremely simple games with <20 static pieces and no animation needs; significantly less work for very simple rendering |
| AppSync Events | API Gateway WebSocket | If you need granular per-route Lambda invocations or cannot use AppSync in your region; API Gateway remains a solid fallback |
| .NET 8 Native AOT | .NET 8 with SnapStart | SnapStart is simpler to configure but cannot be combined with Provisioned Concurrency; AOT gives better baseline performance and lower memory use (52% less vs JIT) |
| .NET 8 | .NET 10 | Once the startup regression in .NET 10 Lambda (issue #120288) is resolved; .NET 10 is available in Lambda as of January 2026 but has known performance issues |

---

## Stack Patterns by Variant

**For the renderer (start here):**
- Use PixiJS 8.x as the first `BoardRenderer` implementation
- Keep the `IRenderer` interface boundary strict — no PixiJS types leak into game engine
- When/if Godot C# web export ships as stable, write a second adapter

**For real-time (turn-based games):**
- Use AppSync Events channel per game session (`games/{sessionId}`)
- Publish game state deltas (not full state) from Lambda to the channel
- Client reconstructs full state by applying deltas on top of last-known good state

**For real-time (if you add synchronous real-time features later, e.g., timer countdowns):**
- AppSync Events supports this natively — the same channel subscription handles both
- Lambda publishes a timer-tick event; no polling needed

**For the game creation tool (local-first C#):**
- Console application or Avalonia UI desktop app (C# cross-platform)
- Reads source materials, calls LLM API, outputs game data files
- Does NOT use any web framework — pure .NET 8+ console or desktop

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| SvelteKit 2.x | Svelte 5.x | SvelteKit 2 requires Svelte 5; do not mix with Svelte 4 |
| `@vite-pwa/sveltekit` 1.1 | SvelteKit 2.x | Supports SvelteKit 2 from v0.3.0 |
| PixiJS 8.x | All modern browsers with WebGL 2.0 | Safari has some WebGL 2.0 quirks; v8.16 Canvas fallback mitigates this |
| .NET 8 Lambda | Native AOT requires `linux-x64` publish | Do not use `win-x64` for Lambda packages |
| AWS AppSync Events | Lambda .NET 8+ | `Amazon.Lambda.AppSyncEvents` NuGet required |
| Godot 4 web export (GDScript only) | WebGL 2.0 + SharedArrayBuffer | Requires COOP/COEP headers; C# export is prototype-only as of Feb 2026 |

---

## Installation

```bash
# Frontend (SvelteKit + Svelte 5 + PWA)
npm create svelte@latest bga2-frontend
cd bga2-frontend
npm install
npm install -D @vite-pwa/sveltekit vite-plugin-pwa

# Renderer
npm install pixi.js

# Backend (C# Lambda) — run from backend project directory
dotnet new lambda.EmptyFunction --name BGA2.GameApi
dotnet add package Amazon.Lambda.AppSyncEvents
dotnet add package Amazon.Lambda.Powertools.AppSyncEvents
dotnet add package AWSSDK.DynamoDBv2
dotnet add package AWSSDK.S3

# Infrastructure (CDK in C#)
dotnet new cdk --language csharp --name BGA2.Infrastructure
```

---

## Sources

- **PixiJS v8.16.0 release (Feb 3, 2026):** https://github.com/pixijs/pixijs/releases — Canvas fallback, WebGL/WebGPU renderer, current version confirmed HIGH confidence
- **PixiJS v8 launch post:** https://pixijs.com/blog/pixi-v8-launches — Architecture, tree shaking, performance numbers
- **Godot web export docs:** https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html — WASM requirements, SharedArrayBuffer
- **Godot C# web prototype (May 2025):** https://godotengine.org/article/live-from-godotcon-boston-web-dotnet-prototype/ — Draft PR status, 72MB pck file, no timeline commitment MEDIUM confidence
- **Godot C# web PR #106125:** https://github.com/godotengine/godot/pull/106125 — Draft, not merged
- **AWS AppSync Events announcement:** https://aws.amazon.com/blogs/mobile/announcing-aws-appsync-events-serverless-websocket-apis/ — Pricing, architecture
- **AppSync Events data source integrations (April 2025):** https://aws.amazon.com/about-aws/whats-new/2025/04/aws-appsync-events-data-source-integrations-channel-namespaces/ — Lambda integration
- **Powertools for AWS Lambda (.NET) — AppSync Events:** https://docs.aws.amazon.com/powertools/dotnet/core/event_handler/appsync_events/ — C# handler support HIGH confidence
- **AWS API Gateway WebSocket docs:** https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html — Connection management patterns
- **DynamoDB turn-based game tutorial:** https://aws.amazon.com/tutorials/turn-based-game-dynamodb-amazon-sns/ — DynamoDB game state patterns
- **Lambda SnapStart for .NET:** https://codewithmukesh.com/blog/lambda-snapstart-dotnet/ — Performance numbers MEDIUM confidence
- **Lambda Native AOT .NET:** https://dev.to/whitewaw/net-nativeaot-on-aws-lambda-7x-faster-cold-starts-73-lower-costs-np3 — 940ms vs 6,680ms cold start
- **Lambda .NET 10 availability:** https://aws.amazon.com/blogs/compute/net-10-runtime-now-available-in-aws-lambda/ — Available Jan 2026
- **.NET 10 Lambda regression issue:** https://github.com/dotnet/runtime/issues/120288 — Known startup regression, use .NET 8 for now
- **SignalR incompatibility with Lambda:** https://github.com/dotnet/aspnetcore/issues/36575 — Official GitHub issue confirming incompatibility HIGH confidence
- **Svelte 5 bundle size vs React:** https://dev.to/krish_kakadiya_5f0eaf6342/why-svelte-5-is-redefining-frontend-performance-in-2025-a-deep-dive-into-reactivity-and-bundle-5200 — 47KB vs 156KB MEDIUM confidence
- **SvelteKit PWA support:** https://github.com/vite-pwa/sveltekit — @vite-pwa/sveltekit v1.1 HIGH confidence
- **Svelte $effect + requestAnimationFrame pattern:** https://svelte.dev/tutorial/svelte/bind-this — Official Svelte docs HIGH confidence
- **Gabriel Gambetta — Client-side prediction:** https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html — Authoritative reference on when CSP is and isn't needed MEDIUM confidence
- **AppSync Events WebSocket publishing (March 2025):** https://aws.amazon.com/about-aws/whats-new/2025/03/appsync-events-publishing-websocket-real-time-pub-sub/ — Bi-directional pub/sub confirmed
- **Serverless game backend architecture (AWS Well-Architected):** https://docs.aws.amazon.com/wellarchitected/latest/games-industry-lens/serverless-based-game-backend-architecture.html — Official AWS game architecture patterns

---

*Stack research for: Digital board game platform (BGA competitor)*
*Researched: 2026-02-28*
