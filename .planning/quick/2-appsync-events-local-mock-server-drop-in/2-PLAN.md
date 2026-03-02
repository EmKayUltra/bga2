---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/infra/appsync-mock/server.mjs
  - apps/infra/appsync-mock/package.json
  - apps/infra/appsync-mock/Dockerfile
  - apps/infra/docker-compose.yml
autonomous: true
requirements: [QUICK-2]

must_haves:
  truths:
    - "C# server publishes to mock HTTP endpoint and mock delivers to WebSocket subscribers"
    - "SvelteKit client connects via Amplify events.connect() and receives real-time updates"
    - "docker compose up starts the mock alongside existing services with zero host .env needed"
  artifacts:
    - path: "apps/infra/appsync-mock/server.mjs"
      provides: "Express + ws mock server implementing AppSync Events HTTP publish and WebSocket subscribe"
      min_lines: 100
    - path: "apps/infra/appsync-mock/package.json"
      provides: "Node dependencies (express, ws)"
    - path: "apps/infra/appsync-mock/Dockerfile"
      provides: "Simple Node 20 alpine container"
    - path: "apps/infra/docker-compose.yml"
      provides: "appsync-mock service + default env vars for client and server"
  key_links:
    - from: "apps/server/Services/AppSyncPublisher.cs"
      to: "apps/infra/appsync-mock/server.mjs"
      via: "HTTP POST {endpoint}/event with x-api-key header"
      pattern: "POST.*\/event"
    - from: "apps/client/src/lib/appsync.ts"
      to: "apps/infra/appsync-mock/server.mjs"
      via: "Amplify events.connect() WebSocket at /event/realtime"
      pattern: "events\\.connect"
---

<objective>
Create a local AppSync Events mock server that runs as a Docker Compose service, enabling real-time WebSocket subscriptions in local dev without AWS credentials.

Purpose: Currently real-time features (game state sync, chat) require AWS AppSync credentials in a host .env file. This mock removes that requirement so `docker compose up` gives a fully functional real-time dev environment out of the box.

Output: A new `appsync-mock` Docker service that bridges HTTP publish (from C# server) to WebSocket delivery (to SvelteKit client via Amplify), plus docker-compose.yml wired with default env vars.
</objective>

<execution_context>
@/home/emkayultra/.claude/get-shit-done/workflows/execute-plan.md
@/home/emkayultra/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/infra/docker-compose.yml
@apps/client/src/lib/appsync.ts
@apps/server/Services/AppSyncPublisher.cs

<interfaces>
<!-- AppSyncPublisher.cs sends HTTP POST to {endpoint}/event -->
POST {AppSync:HttpEndpoint}/event
Headers: x-api-key: {AppSync:ApiKey}
Body: { "channel": "/game/{sessionId}/state", "events": ["json-string", ...] }

<!-- ChatEndpoints.cs sends same format to /game/{channelId}/chat -->
POST {AppSync:HttpEndpoint}/event
Body: { "channel": "/game/{channelId}/chat", "events": ["json-string"] }

<!-- Amplify client calls: -->
Amplify.configure({ API: { Events: { endpoint, apiKey, region, defaultAuthMode } } })
events.connect("/game/{sessionId}/state")  // WebSocket subscribe
events.connect("/game/{channelId}/chat")   // WebSocket subscribe

<!-- Amplify derives WS URL from HTTP endpoint:
     For AWS: https://xxx.appsync-api.region.amazonaws.com -> wss://xxx.appsync-realtime-api.region.amazonaws.com/event/realtime
     For local: http://localhost:4006 -> ws://localhost:4006/event/realtime
     The mock must handle WS upgrade at /event/realtime path -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create the AppSync Events mock server</name>
  <files>apps/infra/appsync-mock/server.mjs, apps/infra/appsync-mock/package.json, apps/infra/appsync-mock/Dockerfile</files>
  <action>
Create three files for the mock server:

**package.json** — minimal Node project with `express` and `ws` dependencies. No build step needed. `"type": "module"` for ESM. Start script: `node server.mjs`.

**server.mjs** (~130-150 lines) — single-file Express + ws server on port 4006:

1. **HTTP POST `/event`** — accepts `{ channel: string, events: string[] }`. Validates `x-api-key` header exists (any non-empty value accepted). For each event string in the `events` array, finds all WebSocket subscribers whose `channel` matches, and sends them a message in AppSync Events format: `{ type: "data", id: "subscription-uuid", event: "the-event-string" }`. Returns 200 with `{ "success": true }`. Log each publish with channel and subscriber count.

2. **WebSocket upgrade at path `/event/realtime`** — use `ws` library with `handleUpgrade` on the HTTP server, filtering by `request.url === '/event/realtime'`. Require subprotocol `aws-appsync-event-ws` (set in ws server config via `handleProtocols` that returns `'aws-appsync-event-ws'`). Handle these message types:
   - `connection_init` -> respond `{ type: "connection_ack", connectionTimeoutMs: 300000 }`
   - `subscribe` with `{ id, channel, authorization }` -> store `{ id, channel }` in a per-connection Set, respond `{ type: "subscribe_success", id }`
   - `unsubscribe` with `{ id }` -> remove from Set

3. **Keep-alive** — send `{ type: "ka" }` to all connected WebSocket clients every 30 seconds.

4. **Channel matching** — subscriber channel is a namespace like `/game/uuid/state`. HTTP publish channel is the same format. Match by exact string equality. Use a Map<WebSocket, Set<{id, channel}>> to track subscriptions.

5. **Cleanup** — on WebSocket `close`, remove from the subscriptions map.

6. **Health check** — GET `/` returns 200 `{ status: "ok" }`.

7. **Startup log** — `console.log("AppSync Events mock listening on port 4006")`.

**Dockerfile** — Node 20 alpine. WORKDIR /app. COPY package*.json, RUN npm ci --production. COPY server.mjs. EXPOSE 4006. CMD ["node", "server.mjs"].
  </action>
  <verify>
    <automated>cd /var/home/emkayultra/code/personal/bga2 && cat apps/infra/appsync-mock/server.mjs | head -5 && cat apps/infra/appsync-mock/package.json && cat apps/infra/appsync-mock/Dockerfile</automated>
  </verify>
  <done>Three files exist: server.mjs implements HTTP publish + WebSocket subscribe with AppSync Events protocol, package.json has express+ws deps, Dockerfile builds a Node 20 container.</done>
</task>

<task type="auto">
  <name>Task 2: Wire mock into Docker Compose with default env vars</name>
  <files>apps/infra/docker-compose.yml</files>
  <action>
Add `appsync-mock` service to docker-compose.yml and update env var defaults so real-time works out of the box:

**New service `appsync-mock`:**
```yaml
  appsync-mock:
    build:
      context: ../..
      dockerfile: apps/infra/appsync-mock/Dockerfile
    ports:
      - "4006:4006"
    networks:
      - bga2
```

Place it between the `db` and `localstack` services (or after localstack, before volumes).

**Update `client` environment** — change the AppSync env var defaults from empty to the mock:
```yaml
      VITE_APPSYNC_HTTP_ENDPOINT: "${APPSYNC_HTTP_ENDPOINT:-http://localhost:4006}"
      VITE_APPSYNC_API_KEY: "${APPSYNC_API_KEY:-mock-api-key}"
```
Note: client uses `localhost:4006` because these VITE_ vars are used browser-side (not inside Docker network).

Add `appsync-mock` to client's `depends_on` list (simple form, no condition needed — mock starts instantly).

**Update `server` environment** — change the AppSync env var defaults from empty to the mock:
```yaml
      AppSync__HttpEndpoint: "${APPSYNC_HTTP_ENDPOINT_SERVER:-http://appsync-mock:4006}"
      AppSync__ApiKey: "${APPSYNC_API_KEY:-mock-api-key}"
```
Note: server uses `appsync-mock:4006` (Docker network hostname) because it runs inside Docker. Use a separate env var `APPSYNC_HTTP_ENDPOINT_SERVER` so the server-side default differs from the client-side default. If the user sets a real AWS endpoint in `.env`, they set `APPSYNC_HTTP_ENDPOINT` (for client) and `APPSYNC_HTTP_ENDPOINT_SERVER` (for server) — or just override both in `.env`.

Add `appsync-mock` to server's `depends_on` list (simple form).
  </action>
  <verify>
    <automated>cd /var/home/emkayultra/code/personal/bga2 && docker compose -f apps/infra/docker-compose.yml config --services | sort</automated>
  </verify>
  <done>docker-compose.yml has appsync-mock service on port 4006, client env defaults to http://localhost:4006 with mock-api-key, server env defaults to http://appsync-mock:4006 with mock-api-key. `docker compose config --services` lists appsync-mock.</done>
</task>

<task type="auto">
  <name>Task 3: Build and smoke-test the mock server</name>
  <files></files>
  <action>
Build and start just the appsync-mock service to verify it works:

1. Build the image: `docker compose -f apps/infra/docker-compose.yml build appsync-mock`
2. Start it: `docker compose -f apps/infra/docker-compose.yml up -d appsync-mock`
3. Wait 3 seconds for startup, then:
4. Health check: `curl -s http://localhost:4006/` — expect `{"status":"ok"}`
5. Publish test: `curl -s -X POST http://localhost:4006/event -H "Content-Type: application/json" -H "x-api-key: test-key" -d '{"channel":"/game/test/state","events":["{\"state\":\"hello\",\"version\":1}"]}'` — expect 200 with `{"success":true}`
6. Check logs: `docker compose -f apps/infra/docker-compose.yml logs appsync-mock` — should show startup message and publish log
7. Stop: `docker compose -f apps/infra/docker-compose.yml stop appsync-mock`

If any step fails, fix the issue in server.mjs or Dockerfile and retry.
  </action>
  <verify>
    <automated>cd /var/home/emkayultra/code/personal/bga2 && docker compose -f apps/infra/docker-compose.yml build appsync-mock 2>&1 | tail -3 && docker compose -f apps/infra/docker-compose.yml up -d appsync-mock && sleep 3 && curl -sf http://localhost:4006/ && docker compose -f apps/infra/docker-compose.yml stop appsync-mock</automated>
  </verify>
  <done>Mock server builds, starts, responds to health check at GET /, accepts HTTP POST /event with correct response format. Container logs show startup message.</done>
</task>

</tasks>

<verification>
1. `docker compose -f apps/infra/docker-compose.yml config --services` includes `appsync-mock`
2. Mock builds and starts: health check at http://localhost:4006/ returns 200
3. HTTP publish endpoint accepts POST /event with x-api-key header and returns success
4. Client env defaults point to localhost:4006 (browser-accessible)
5. Server env defaults point to appsync-mock:4006 (Docker-network-accessible)
6. No changes to appsync.ts or AppSyncPublisher.cs — existing code works as-is against the mock
</verification>

<success_criteria>
- `docker compose up` starts all services including appsync-mock with zero .env configuration
- C# server can POST to http://appsync-mock:4006/event and mock accepts it
- Browser client can connect WebSocket to ws://localhost:4006/event/realtime with aws-appsync-event-ws subprotocol
- Mock bridges HTTP publishes to WebSocket subscribers by channel matching
- Setting real AWS credentials in .env overrides the mock defaults (backward compatible)
</success_criteria>

<output>
After completion, create `.planning/quick/2-appsync-events-local-mock-server-drop-in/2-SUMMARY.md`
</output>
