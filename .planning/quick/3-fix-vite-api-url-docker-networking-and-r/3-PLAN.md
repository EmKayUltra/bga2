---
phase: quick-3
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/infra/docker-compose.yml
  - apps/client/src/lib/api/lobbyApi.ts
  - apps/client/src/lib/api/gameApi.ts
  - apps/client/src/lib/api/socialApi.ts
  - apps/client/src/lib/api/friendApi.ts
  - apps/client/src/lib/api/notificationApi.ts
  - apps/client/src/lib/components/ChatPanel.svelte
autonomous: true
requirements: [QUICK-3]

must_haves:
  truths:
    - SSR fetch calls to the C# server succeed inside the Docker container
    - Browser fetch calls continue to use localhost:8080 (host-accessible)
    - LocalStack service is removed from docker-compose.yml and its volume is gone
  artifacts:
    - path: "apps/infra/docker-compose.yml"
      provides: "No localstack service; client has API_SERVER_URL env var"
    - path: "apps/client/src/lib/api/lobbyApi.ts"
      provides: "API_BASE uses server:8080 in SSR, localhost:8080 in browser"
  key_links:
    - from: "docker-compose.yml client environment"
      to: "apps/client/src/lib/api/*.ts"
      via: "API_SERVER_URL private env var (no VITE_ prefix)"
      pattern: "API_SERVER_URL.*server:8080"
---

<objective>
Fix two infrastructure issues in docker-compose.yml and the SvelteKit API modules:

1. SSR fetch calls fail inside Docker because `VITE_API_URL=http://localhost:8080` is inlined at build time — SSR code running in the client container cannot reach `localhost:8080` (that's the host, not the server container). The fix: add a private env var `API_SERVER_URL=http://server:8080` for SSR paths, and update all API modules to choose the correct base URL based on whether code runs in the browser or on the server.

2. The `localstack` service in docker-compose.yml is dead weight — it was planned for AWS emulation but was never needed (AppSync mock was built separately). Remove it along with its volume.

Purpose: SSR pages (lobby list, settings, etc.) that currently silently fail "Failed to fetch" will work correctly. Docker Compose will start faster with one fewer unused service.
Output: Updated docker-compose.yml (no localstack) and updated API modules (SSR-aware base URL).
</objective>

<execution_context>
@/home/mkornher/.claude/get-shit-done/workflows/execute-plan.md
@/home/mkornher/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/infra/docker-compose.yml

<interfaces>
<!-- SSR detection in SvelteKit -->
<!-- Import from '$app/environment': { browser } -->
<!-- browser === true  → running in the real browser (use VITE_API_URL / localhost:8080) -->
<!-- browser === false → running during SSR inside the Docker container (use API_SERVER_URL / server:8080) -->

<!-- Current pattern in all six API files: -->
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

<!-- Target pattern: -->
import { browser } from '$app/environment';
const API_BASE = browser
  ? (import.meta.env.VITE_API_URL || 'http://localhost:8080')
  : (import.meta.env.API_SERVER_URL || 'http://server:8080');

<!-- Note: private env vars (no VITE_ prefix) are NOT inlined by Vite — they are
     available via import.meta.env on the server side of SvelteKit SSR. -->

<!-- Files to update (6 API modules + 1 component): -->
<!-- apps/client/src/lib/api/lobbyApi.ts         line 18 -->
<!-- apps/client/src/lib/api/gameApi.ts          line 17 -->
<!-- apps/client/src/lib/api/socialApi.ts        line 16 -->
<!-- apps/client/src/lib/api/friendApi.ts        line 21 -->
<!-- apps/client/src/lib/api/notificationApi.ts  line 15 -->
<!-- apps/client/src/lib/components/ChatPanel.svelte  line 26 -->

<!-- The invite page (routes/invite/[token]/+page.server.ts) already uses
     process.env.API_URL || 'http://server:8080' — do NOT change it. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove LocalStack from docker-compose.yml and add API_SERVER_URL to client</name>
  <files>apps/infra/docker-compose.yml</files>
  <action>
Make two edits to apps/infra/docker-compose.yml:

1. Remove the entire `localstack` service block (lines 92-109, the block between the db service and appsync-mock service). Remove its associated volume `localstack_data` from the top-level `volumes:` section.

2. In the `client` service `environment:` block, add a new private env var after the existing VITE_ vars:
   ```yaml
   API_SERVER_URL: "http://server:8080"
   ```
   This gives SSR code a Docker-network-resolvable hostname for the C# server.

Do NOT touch any other services or configuration. Verify the YAML remains valid (proper indentation, no dangling volume reference).
  </action>
  <verify>
    <automated>docker compose -f apps/infra/docker-compose.yml config --quiet 2>&1 || echo "INVALID YAML"</automated>
  </verify>
  <done>
`localstack` service and `localstack_data` volume are gone. `client` environment has `API_SERVER_URL: "http://server:8080"`. `docker compose config` reports no errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update API modules to use SSR-aware base URL</name>
  <files>
    apps/client/src/lib/api/lobbyApi.ts,
    apps/client/src/lib/api/gameApi.ts,
    apps/client/src/lib/api/socialApi.ts,
    apps/client/src/lib/api/friendApi.ts,
    apps/client/src/lib/api/notificationApi.ts,
    apps/client/src/lib/components/ChatPanel.svelte
  </files>
  <action>
In each of the six files, make two changes:

**A. Add import at the top of the imports block:**
```typescript
import { browser } from '$app/environment';
```

**B. Replace the existing `API_BASE` constant:**

Old (all six files have this pattern, just at slightly different line numbers):
```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
```

New:
```typescript
const API_BASE = browser
  ? (import.meta.env.VITE_API_URL || 'http://localhost:8080')
  : (import.meta.env.API_SERVER_URL || 'http://server:8080');
```

For `ChatPanel.svelte`, the `API_BASE` is defined inside `<script lang="ts">` — the same change applies there. The import goes at the top of the script block with the other imports.

Do NOT change anything else in any file. Do NOT modify the invite page server load (`routes/invite/[token]/+page.server.ts`) — it already has the correct `process.env.API_URL || 'http://server:8080'` pattern.

After editing, run the TypeScript check to confirm no new errors:
```bash
docker compose -f apps/infra/docker-compose.yml exec client npx tsc --noEmit
```
  </action>
  <verify>
    <automated>docker compose -f apps/infra/docker-compose.yml exec -T client npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <done>
All six files import `browser` from `$app/environment` and use the ternary for `API_BASE`. TypeScript check passes (no new errors beyond any pre-existing ones).
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `docker compose config` validates the updated docker-compose.yml with no errors.
2. `localstack` does not appear anywhere in docker-compose.yml.
3. `localstack_data` does not appear in the volumes section.
4. `API_SERVER_URL: "http://server:8080"` appears in the client service environment.
5. All six API files contain `import { browser } from '$app/environment'` and the ternary `API_BASE`.
6. TypeScript check passes.
</verification>

<success_criteria>
- No `localstack` or `localstack_data` references in docker-compose.yml
- Client service has `API_SERVER_URL: "http://server:8080"` in its environment
- All API modules use `browser` to select the correct base URL at runtime
- `docker compose config` exits 0
- `tsc --noEmit` exits clean
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-vite-api-url-docker-networking-and-r/3-SUMMARY.md` following the summary template.
</output>
