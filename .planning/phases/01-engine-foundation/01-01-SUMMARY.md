---
phase: 01-engine-foundation
plan: "01"
subsystem: infra
tags: [nx, sveltekit, svelte5, csharp, dotnet8, docker, postgresql, localstack, typescript, monorepo]

# Dependency graph
requires: []
provides:
  - NX monorepo workspace with 6 projects (client, server, infra, engine-core, shared-types, games-azul)
  - SvelteKit 2 + Svelte 5 client app with vite.config.ts nxViteTsPaths() path resolution
  - C# .NET 8 minimal API server with Npgsql + Jint NuGet references
  - Docker Compose 4-service orchestration (client, server, db, localstack)
  - tsconfig.base.json with @bga2/* TypeScript path aliases
  - Stub barrel exports for engine-core, shared-types, games-azul libraries
affects: [02-game-engine, 03-multiplayer, 04-async-play, 05-ai-toolkit, 06-platform]

# Tech tracking
tech-stack:
  added:
    - nx@19 (monorepo orchestration)
    - "@nx/vite@19 (vite build/test executor)"
    - "@sveltejs/kit@2 (SvelteKit 2 web framework)"
    - svelte@5 (Svelte 5 component framework)
    - vite@5 (bundler + dev server)
    - "@sveltejs/vite-plugin-svelte@3 (Svelte Vite integration)"
    - "@sveltejs/adapter-node@5 (SvelteKit Node adapter for Docker)"
    - typescript@5.4
    - dotnet SDK 8.0 (C# server runtime)
    - Npgsql.EntityFrameworkCore.PostgreSQL@8 (PostgreSQL EF Core provider)
    - Jint@3 (JavaScript engine for C# — game hook execution)
    - postgres:16-alpine (local database)
    - localstack/localstack:latest (AWS service emulation)
    - node:20-alpine (Docker base for client)
    - mcr.microsoft.com/dotnet/sdk:8.0 (Docker base for server)
  patterns:
    - NX monorepo with apps/ + libs/ convention
    - Docker Compose build context at workspace root so all paths are accessible
    - Volume mounts for HMR in both client (Vite) and server (dotnet watch)
    - CHOKIDAR_USEPOLLING=true for client file watching in Docker
    - DOTNET_USE_POLLING_FILE_WATCHER=1 for server file watching in Docker
    - nxViteTsPaths() plugin in vite.config.ts resolves @bga2/* TypeScript path aliases
    - tsconfig.base.json as single source of truth for monorepo TS path aliases

key-files:
  created:
    - nx.json
    - package.json
    - tsconfig.base.json
    - apps/client/vite.config.ts
    - apps/client/svelte.config.js
    - apps/client/tsconfig.json
    - apps/client/package.json
    - apps/client/project.json
    - apps/client/src/app.html
    - apps/client/src/routes/+page.svelte
    - apps/client/Dockerfile
    - apps/server/Program.cs
    - apps/server/server.csproj
    - apps/server/project.json
    - apps/server/Dockerfile
    - apps/infra/docker-compose.yml
    - apps/infra/project.json
    - libs/engine/core/src/index.ts
    - libs/engine/core/package.json
    - libs/engine/core/tsconfig.json
    - libs/engine/core/project.json
    - libs/shared-types/src/index.ts
    - libs/shared-types/package.json
    - libs/shared-types/tsconfig.json
    - libs/shared-types/project.json
    - libs/games/azul/src/index.ts
    - libs/games/azul/package.json
    - libs/games/azul/tsconfig.json
    - libs/games/azul/project.json
    - .gitignore
  modified: []

key-decisions:
  - "Used @sveltejs/adapter-node instead of adapter-auto for Docker compatibility — adapter-node produces a Node.js server suitable for containerized deployment"
  - "Docker Compose build context is workspace root (../../) so both client and server Dockerfiles can COPY from any workspace path including libs/"
  - "workspace:* protocol dropped in favor of plain * for peerDependencies — npm workspaces don't support workspace: protocol (pnpm/yarn only)"
  - "NX projects defined via project.json files (not inferred) for explicit control over all 6 projects"
  - "Azul peerDependencies use * version range since all libs are private workspace packages"

patterns-established:
  - "Monorepo structure: apps/(client|server|infra), libs/(engine/core|shared-types|games/azul)"
  - "Path alias pattern: @bga2/{lib-name} -> libs/{path}/src/index.ts in tsconfig.base.json"
  - "vite.config.ts always includes nxViteTsPaths() to resolve @bga2/* in SvelteKit"
  - "Docker multi-stage: base (deps install) -> dev (source + CMD) target pattern"
  - "docker-compose.yml build context at workspace root, service Dockerfiles use relative paths"
  - "db healthcheck with pg_isready ensures server waits for PostgreSQL before starting"

requirements-completed: [INFR-01, INFR-02]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 01 Plan 01: NX Monorepo Scaffold and Docker Compose Summary

**NX monorepo with SvelteKit 2 + Svelte 5 client, C# .NET 8 API server, and 4-service Docker Compose (client, server, PostgreSQL, LocalStack) with hot-reload volume mounts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T05:41:59Z
- **Completed:** 2026-03-01T05:46:34Z
- **Tasks:** 2 of 2
- **Files modified:** 29

## Accomplishments

- Complete NX workspace with 6 projects (client, server, infra, engine-core, shared-types, games-azul) all recognized by `npx nx show projects`
- SvelteKit 2 + Svelte 5 client app configured with nxViteTsPaths(), adapter-node for Docker, HMR on port 24678, host 0.0.0.0 for container access
- Docker Compose orchestrates 4 services: SvelteKit client, C# API server, PostgreSQL 16 with pg_isready healthcheck, LocalStack for AWS emulation
- TypeScript path aliases (@bga2/engine-core, @bga2/shared-types, @bga2/games-azul) configured in tsconfig.base.json, resolved by nxViteTsPaths() in Vite
- C# server with Npgsql.EntityFrameworkCore.PostgreSQL + Jint NuGet packages, minimal API with CORS for :5173, health check at GET /

## Task Commits

1. **Task 1: Scaffold NX monorepo with all project structure** - `e0b3086` (chore)
2. **Task 2: Create Docker Compose with 4 services and Dockerfiles** - `1b868a6` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `nx.json` - NX workspace config with targetDefaults, namedInputs, defaultBase main
- `package.json` - Workspace root with npm workspaces for all libs and apps/client
- `tsconfig.base.json` - Root TypeScript config with @bga2/* path aliases (ES2022, moduleResolution: bundler)
- `apps/client/vite.config.ts` - Vite config with sveltekit() + nxViteTsPaths(), host 0.0.0.0, HMR port 24678
- `apps/client/svelte.config.js` - SvelteKit config with adapter-node, vitePreprocess
- `apps/client/tsconfig.json` - Client TS config extending tsconfig.base.json
- `apps/client/package.json` - SvelteKit 2, Svelte 5, Vite 5, @nx/vite dev deps
- `apps/client/project.json` - NX project definition for client app
- `apps/client/src/app.html` - SvelteKit HTML shell with viewport meta, light+clean base
- `apps/client/src/routes/+page.svelte` - Landing page with light/clean aesthetic
- `apps/client/Dockerfile` - node:20-alpine multi-stage, workspace root build context
- `apps/server/Program.cs` - .NET 8 minimal API, health check at /, CORS for :5173
- `apps/server/server.csproj` - .NET 8 project, Npgsql EF Core + Jint + Swashbuckle
- `apps/server/project.json` - NX project for server (build, serve, watch, test targets)
- `apps/server/Dockerfile` - dotnet/sdk:8.0 multi-stage, dotnet watch for hot reload
- `apps/infra/docker-compose.yml` - 4 services: client, server, db (pg:16-alpine), localstack
- `apps/infra/project.json` - NX project for infra with docker-up/down/build/logs targets
- `libs/engine/core/src/index.ts` - Stub barrel export (Phase 1 engine expansion)
- `libs/shared-types/src/index.ts` - Core shared types: Player, Move, GameConfig, GameStateEnvelope, ApiResponse
- `libs/games/azul/src/index.ts` - Stub barrel export (Phase 2 Azul implementation)
- `.gitignore` - node_modules, dist, .nx, bin/obj/.vs, .svelte-kit, .env patterns

## Decisions Made

- Chose `@sveltejs/adapter-node` over `adapter-auto` for Docker deployment — produces a self-contained Node.js server suitable for containerized environments.
- Docker Compose build context set to workspace root (`../..`) enabling Dockerfiles to COPY from any workspace path including shared libs.
- Dropped `workspace:` protocol for peerDependencies — npm workspaces only support npm version ranges, not the pnpm/yarn workspace: protocol.
- Used explicit `project.json` files (not NX inference) for all 6 projects to ensure full visibility and control over build/test targets.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed workspace:* peerDependency protocol for npm**
- **Found during:** Task 1 (npm install)
- **Issue:** `libs/games/azul/package.json` used `workspace:*` for peerDependencies — npm workspaces do not support the `workspace:` URL protocol (pnpm/yarn only). Install failed with `EUNSUPPORTEDPROTOCOL`.
- **Fix:** Changed `workspace:*` to `*` in Azul peerDependencies
- **Files modified:** libs/games/azul/package.json
- **Verification:** `npm install` completed successfully, 522 packages installed
- **Committed in:** e0b3086 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Trivial protocol fix. npm workspaces use plain version ranges; workspace: is pnpm/yarn syntax. No scope creep.

## Issues Encountered

None beyond the workspace: protocol fix documented above.

## User Setup Required

None — no external service configuration required for Phase 1 scaffold. All services are local Docker containers.

The full stack can be started with:
```
docker compose -f apps/infra/docker-compose.yml up
```

## Next Phase Readiness

- NX monorepo scaffold complete — all 6 projects recognized
- Docker Compose 4-service stack validated and ready to start
- TypeScript path aliases configured and resolvable via nxViteTsPaths()
- Engine core, shared-types, and games-azul library stubs ready for implementation in subsequent plans
- C# server has Npgsql + Jint dependencies declared, ready for EF Core setup and hook execution in next plans

## Self-Check: PASSED

All 15 key files verified present. Both task commits (e0b3086, 1b868a6) verified in git log.

---
*Phase: 01-engine-foundation*
*Completed: 2026-03-01*
