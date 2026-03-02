---
phase: quick-3
plan: 3
subsystem: infrastructure, client-api
tags: [docker, ssr, networking, api, cleanup]
dependency_graph:
  requires: []
  provides: [SSR-aware API base URL for all client API modules]
  affects: [lobbyApi, gameApi, socialApi, friendApi, notificationApi, ChatPanel]
tech_stack:
  added: []
  patterns: [SvelteKit browser/SSR detection via $app/environment, Docker private env var for SSR host]
key_files:
  created: []
  modified:
    - apps/infra/docker-compose.yml
    - apps/client/src/lib/api/lobbyApi.ts
    - apps/client/src/lib/api/gameApi.ts
    - apps/client/src/lib/api/socialApi.ts
    - apps/client/src/lib/api/friendApi.ts
    - apps/client/src/lib/api/notificationApi.ts
    - apps/client/src/lib/components/ChatPanel.svelte
decisions:
  - SSR uses API_SERVER_URL (private, no VITE_ prefix) so it is not inlined by Vite but is available via import.meta.env on the server side
  - browser ternary: browser=true uses VITE_API_URL/localhost:8080; browser=false uses API_SERVER_URL/server:8080
  - ChatPanel.svelte already had browser import — only API_BASE ternary was added, no duplicate import
metrics:
  duration: ~5 min
  completed: 2026-03-02
  tasks_completed: 2
  files_changed: 7
---

# Quick Task 3: Fix Vite API URL Docker Networking and Remove LocalStack — Summary

**One-liner:** SSR-aware API_BASE via browser ternary (`localhost:8080` browser / `server:8080` SSR) across all six API modules, plus LocalStack service and volume removed from docker-compose.

## What Was Done

### Task 1: Remove LocalStack from docker-compose.yml and add API_SERVER_URL

- Removed the entire `localstack` service block (LocalStack was included for planned AWS emulation that was never needed — AppSync mock was built separately)
- Removed the `localstack_data` volume from the top-level `volumes:` section
- Added `API_SERVER_URL: "http://server:8080"` to the `client` service environment block (private env var, no VITE_ prefix, so Vite does not inline it at build time; available at runtime in SSR via `import.meta.env`)
- YAML validated via `docker compose config --quiet` — exits 0

### Task 2: Update API modules to use SSR-aware base URL

All six files updated from the static pattern:
```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
```

To the SSR-aware ternary:
```typescript
import { browser } from '$app/environment';

const API_BASE = browser
  ? (import.meta.env.VITE_API_URL || 'http://localhost:8080')
  : (import.meta.env.API_SERVER_URL || 'http://server:8080');
```

Files updated:
- `apps/client/src/lib/api/lobbyApi.ts` — import added, API_BASE replaced
- `apps/client/src/lib/api/gameApi.ts` — import added after existing shared-types import, API_BASE replaced
- `apps/client/src/lib/api/socialApi.ts` — import added, API_BASE replaced
- `apps/client/src/lib/api/friendApi.ts` — import added, API_BASE replaced
- `apps/client/src/lib/api/notificationApi.ts` — import added, API_BASE replaced
- `apps/client/src/lib/components/ChatPanel.svelte` — already had browser import at line 3; only API_BASE ternary replaced (no duplicate import)

TypeScript check (`tsc --noEmit`) passed with no errors.

## Deviations from Plan

None — plan executed exactly as written. ChatPanel.svelte already had the browser import, so only the API_BASE line was changed (not a deviation, just a minor implementation detail handled correctly).

## Verification Results

1. `docker compose config` exits 0 — YAML valid
2. `localstack` does not appear anywhere in docker-compose.yml
3. `localstack_data` does not appear in the volumes section
4. `API_SERVER_URL: "http://server:8080"` present in client service environment
5. All 6 files confirmed to contain `browser` import and `API_SERVER_URL` ternary
6. `tsc --noEmit` exits clean

## Self-Check: PASSED

Files modified exist:
- apps/infra/docker-compose.yml — FOUND
- apps/client/src/lib/api/lobbyApi.ts — FOUND
- apps/client/src/lib/api/gameApi.ts — FOUND
- apps/client/src/lib/api/socialApi.ts — FOUND
- apps/client/src/lib/api/friendApi.ts — FOUND
- apps/client/src/lib/api/notificationApi.ts — FOUND
- apps/client/src/lib/components/ChatPanel.svelte — FOUND

Commits:
- d49a6e3: chore(quick-3): remove localstack service, add API_SERVER_URL to client
- ddb8fc1: feat(quick-3): SSR-aware API_BASE in all API modules
