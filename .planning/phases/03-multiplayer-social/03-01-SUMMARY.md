---
phase: 03-multiplayer-social
plan: "01"
subsystem: auth
tags: [better-auth, jwt, pg, svelte5, csharp, entityframework, postgresql]

# Dependency graph
requires:
  - phase: 02-azul-first-playable
    provides: SvelteKit client, C# API server with EF Core + PostgreSQL, docker-compose infra

provides:
  - Better Auth server instance (betterAuth with pg Pool, username plugin, jwt plugin)
  - Browser auth client (createAuthClient with usernameClient)
  - SvelteKit hooks.server.ts populating locals.user/session
  - /auth/login and /auth/register pages
  - Root +layout.svelte with auth-aware nav bar
  - JWT Bearer middleware in C# API validating tokens from Better Auth JWKS
  - GameTable, TablePlayer, Friendship, MatchResult EF Core entities + tables in PostgreSQL
  - .RequireAuthorization() on POST /games/{id}/move endpoint

affects:
  - 03-02-lobby (needs GameTable, TablePlayer entities + JWT auth)
  - 03-03-match-history (needs MatchResult entity + JWT auth)
  - 03-04-realtime (needs JWT auth for WebSocket handshake)
  - 03-05-friends (needs Friendship entity + JWT auth)

# Tech tracking
tech-stack:
  added:
    - better-auth 1.5.0 (server + client, username plugin, jwt plugin)
    - pg + @types/pg (PostgreSQL driver for Better Auth)
    - Microsoft.AspNetCore.Authentication.JwtBearer 8.0.0

  patterns:
    - Better Auth server in $lib/auth.ts, client in $lib/auth-client.ts
    - SvelteKit hooks.server.ts populates locals.user/session via auth.api.getSession
    - JWT Bearer validates against Better Auth JWKS at /api/auth/jwks
    - Use relative path (./lib/auth.js) instead of $lib alias in hooks.server.ts for tsc compatibility
    - skipLibCheck: true added to client tsconfig.json to handle better-auth 1.5.0 type quirks

key-files:
  created:
    - apps/client/src/lib/auth.ts
    - apps/client/src/lib/auth-client.ts
    - apps/client/src/hooks.server.ts
    - apps/client/src/app.d.ts
    - apps/client/src/routes/+layout.svelte
    - apps/client/src/routes/auth/login/+page.svelte
    - apps/client/src/routes/auth/register/+page.svelte
    - apps/server/Data/GameTable.cs
    - apps/server/Data/TablePlayer.cs
    - apps/server/Data/Friendship.cs
    - apps/server/Data/MatchResult.cs
  modified:
    - apps/client/package.json (added better-auth, pg, @types/pg)
    - apps/client/tsconfig.json (added skipLibCheck: true)
    - apps/server/Data/GameDbContext.cs (added 4 new DbSets with indexes/FKs)
    - apps/server/Program.cs (added JWT Bearer auth middleware)
    - apps/server/server.csproj (added JwtBearer package reference)
    - apps/server/Endpoints/GameEndpoints.cs (added RequireAuthorization on move endpoint)
    - apps/infra/docker-compose.yml (added DATABASE_URL to client, BETTER_AUTH_URL to server)

key-decisions:
  - "better-auth 1.5.0 type declarations have internal errors — added skipLibCheck: true to client tsconfig.json to allow builds"
  - "hooks.server.ts uses relative import (./lib/auth.js) instead of $lib alias because $lib path resolution in tsconfig.json is overridden by tsconfig.base.json's paths section"
  - "Better Auth migration run via @better-auth/cli@1.5.0-beta.13 with --yes flag to create auth tables (user/session/account/verification/jwks)"
  - "JWT Bearer uses Authority=client:5173/api/auth with RequireHttpsMetadata=false (Docker dev only) and ValidateIssuer=false/ValidateAudience=false — validate signature only in dev"

patterns-established:
  - "Better Auth: always use ./lib/auth.js (relative) in server-side TS files; use $lib/auth-client in Svelte components (Vite resolves $lib at build time)"
  - "Entity scaffolding: all Phase 3 entities (GameTable, TablePlayer, Friendship, MatchResult) created upfront with EnsureCreated to avoid later schema changes"

requirements-completed: [SOCL-01]

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 3 Plan 01: Auth + Entity Scaffolding Summary

**Better Auth 1.5.0 email+username+JWT auth in SvelteKit, JWT Bearer validation in C# via JWKS, plus GameTable/TablePlayer/Friendship/MatchResult entities ready for Phase 3 plans 02-05**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-02T01:20:34Z
- **Completed:** 2026-03-02T01:35:05Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Complete Better Auth integration: register/login pages, session hook, JWT endpoint, and auth-aware nav bar
- C# API now validates JWT Bearer tokens from Better Auth's JWKS endpoint (HTTP in Docker dev)
- POST /games/{id}/move protected with .RequireAuthorization(); GET /games/{id}/state remains open
- All 4 Phase 3 DB entities (GameTable, TablePlayer, Friendship, MatchResult) created and migrated via EnsureCreated

## Task Commits

Each task was committed atomically:

1. **Task 1: Better Auth SvelteKit integration with login and register pages** - `11ad463` (feat)
2. **Task 2: C# JWT Bearer auth and Phase 3 DB entity scaffolding** - `d93f4a3` (feat)

## Files Created/Modified

- `apps/client/src/lib/auth.ts` - Better Auth server instance with pg Pool, username + jwt plugins
- `apps/client/src/lib/auth-client.ts` - Browser auth client with usernameClient plugin
- `apps/client/src/hooks.server.ts` - SvelteKit handle hook: populate locals.user/session, delegate to svelteKitHandler
- `apps/client/src/app.d.ts` - Typed App.Locals with user and session fields
- `apps/client/src/routes/+layout.svelte` - Root layout with auth-aware nav bar (username + sign out / login + register links)
- `apps/client/src/routes/auth/login/+page.svelte` - Login form (username+password, ?next= redirect, error display)
- `apps/client/src/routes/auth/register/+page.svelte` - Register form (email/username/displayName/password, error display)
- `apps/client/package.json` - Added better-auth, pg, @types/pg
- `apps/client/tsconfig.json` - Added skipLibCheck: true
- `apps/server/Data/GameTable.cs` - Lobby table entity (host, player limits, privacy, status)
- `apps/server/Data/TablePlayer.cs` - Per-seat entity with ready state
- `apps/server/Data/Friendship.cs` - Friend request entity (Pending/Accepted/Blocked)
- `apps/server/Data/MatchResult.cs` - Per-player game outcome (won, score, rank)
- `apps/server/Data/GameDbContext.cs` - Extended with 4 new DbSets, indexes, FK constraints
- `apps/server/Program.cs` - Added JWT Bearer auth middleware with UseAuthentication/UseAuthorization
- `apps/server/server.csproj` - Added JwtBearer package reference
- `apps/server/Endpoints/GameEndpoints.cs` - Added RequireAuthorization on move, userId extraction from claims
- `apps/infra/docker-compose.yml` - Added DATABASE_URL (client) and BETTER_AUTH_URL (server) env vars

## Decisions Made

- **skipLibCheck for better-auth 1.5.0:** The library's own `.d.mts` type declarations contain internal errors (missing exports, zod ambiguity). Added `skipLibCheck: true` to tsconfig.json to allow building with this library version.
- **Relative import in hooks.server.ts:** The `$lib` path alias defined in `.svelte-kit/tsconfig.json` is silently overridden by the workspace-level `tsconfig.base.json` which also declares `paths`. TypeScript only uses one `paths` configuration, and the base wins. Using `./lib/auth.js` (relative) resolves correctly.
- **Better Auth CLI version:** Used `@better-auth/cli@1.5.0-beta.13` with `--yes` and `--config` flags. The `@latest` (1.4.x) is incompatible with better-auth 1.5.0's DB exports.
- **JWT validation mode:** ValidateIssuer=false, ValidateAudience=false in development — validate signature via JWKS only. Production would need proper issuer/audience claims configured.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed better-auth 1.5.0 type errors breaking $lib/auth resolution**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** better-auth 1.5.0 .d.mts files have internal type errors (zod re-export ambiguity, missing GenericEndpointContext) which caused TypeScript to refuse to type-check any file importing from better-auth, making the entire `$lib/auth` module unresolvable
- **Fix:** Added `skipLibCheck: true` to `apps/client/tsconfig.json`
- **Files modified:** apps/client/tsconfig.json
- **Verification:** `npx tsc --noEmit` passes with 0 errors
- **Committed in:** 11ad463 (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed $lib path alias not resolving in hooks.server.ts**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** `$lib` paths from `.svelte-kit/tsconfig.json` are overridden by `tsconfig.base.json`'s paths (which only has workspace package aliases). TypeScript merged tsconfig won't resolve `$lib/*` at all.
- **Fix:** Changed `import { auth } from "$lib/auth"` to `import { auth } from "./lib/auth.js"` in hooks.server.ts. Svelte files still use `$lib` (resolved by Vite at runtime).
- **Files modified:** apps/client/src/hooks.server.ts
- **Verification:** `npx tsc --noEmit` passes with 0 errors
- **Committed in:** 11ad463 (Task 1 commit)

**3. [Rule 3 - Blocking] Fixed @better-auth/cli version compatibility**
- **Found during:** Task 1 (Better Auth migration)
- **Issue:** `@better-auth/cli@latest` (1.4.x) imports `getMigrations` from `better-auth/db` which doesn't exist in 1.5.0
- **Fix:** Used `@better-auth/cli@1.5.0-beta.13 migrate --yes --config /app/apps/client/src/lib/auth.ts`
- **Files modified:** None (DB migration only, tables created in PostgreSQL)
- **Verification:** Migration completed successfully — user/session/account/verification/jwks tables created
- **Committed in:** 11ad463 (Task 1 commit — package.json updated)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes necessary for compilation and migration. No scope creep.

## Issues Encountered

- better-auth 1.5.0 is a very new release with known type declaration issues that require skipLibCheck
- The tsconfig.json "extends" array causes the last extends to override earlier paths — a TypeScript behavior that bit us with `$lib` aliases

## User Setup Required

The plan frontmatter includes `user_setup` for AWS AppSync Events (needed for Plan 04 real-time features). This plan's code doesn't require AppSync — that setup is documented for future use.

See plan frontmatter for AppSync setup details.

## Next Phase Readiness

- Auth foundation complete — any Phase 3 plan can now require authenticated users
- GameTable and TablePlayer ready for Plan 02 (lobby)
- MatchResult ready for Plan 03 (match history)
- Friendship ready for Plan 05 (social/friends)
- JWT validation wired: C# API will reject unauthenticated move requests with 401
- Remaining: Better Auth session isn't yet verified with a running browser test (verification steps 3-8 in the plan require the server to restart with new entities)

---
*Phase: 03-multiplayer-social*
*Completed: 2026-03-02*
