---
phase: quick-2
plan: "01"
subsystem: infra
tags: [appsync, websocket, mock, docker, real-time]
dependency_graph:
  requires: []
  provides: [appsync-mock-service]
  affects: [docker-compose, client-appsync, server-appsync]
tech_stack:
  added: [express@4.18, ws@8.16, node:20-alpine]
  patterns: [http-to-websocket-bridge, channel-subscription-map]
key_files:
  created:
    - apps/infra/appsync-mock/server.mjs
    - apps/infra/appsync-mock/package.json
    - apps/infra/appsync-mock/package-lock.json
    - apps/infra/appsync-mock/Dockerfile
  modified:
    - apps/infra/docker-compose.yml
decisions:
  - "Client VITE_APPSYNC_HTTP_ENDPOINT defaults to http://localhost:4006 (browser-accessible host) while server AppSync__HttpEndpoint defaults to http://appsync-mock:4006 (Docker network) — separate env var APPSYNC_HTTP_ENDPOINT_SERVER for server-side override"
  - "package-lock.json committed alongside package.json so npm ci works in Docker build (no internet access needed at image build time)"
metrics:
  duration: "~10 min"
  completed: "2026-03-02"
  tasks_completed: 3
  files_created: 4
  files_modified: 1
---

# Quick Task 2: AppSync Events Local Mock Server Summary

**One-liner:** Express + ws mock bridging HTTP publish from C# server to WebSocket subscribers via Amplify `events.connect()`, running as a Docker Compose service on port 4006 with zero host `.env` required.

## What Was Built

A single-file Node.js mock server (`server.mjs`) that implements the AppSync Events wire protocol locally:

- **HTTP POST `/event`** — accepts `{ channel, events[] }` with `x-api-key` header from C# `AppSyncPublisher`. Finds all WebSocket subscribers on matching channel and delivers `{ type: "data", id, event }` messages.
- **WebSocket `/event/realtime`** — Amplify `events.connect()` connects here. Handles `connection_init` → `connection_ack`, `subscribe` → `subscribe_success`, `unsubscribe`. Subprotocol: `aws-appsync-event-ws`.
- **Keep-alive** — `{ type: "ka" }` sent every 30s to all connected clients.
- **GET `/`** health check returns `{ status: "ok" }`.

## Docker Compose Changes

The `appsync-mock` service was added and both `client` and `server` services updated:

| Service | Env var | Default value |
|---------|---------|---------------|
| client | `VITE_APPSYNC_HTTP_ENDPOINT` | `http://localhost:4006` (browser) |
| client | `VITE_APPSYNC_API_KEY` | `mock-api-key` |
| server | `AppSync__HttpEndpoint` | `http://appsync-mock:4006` (Docker network) |
| server | `AppSync__ApiKey` | `mock-api-key` |

Setting real AWS credentials in `.env` overrides all defaults — fully backward compatible.

## Smoke Test Results

- Build: `docker compose build appsync-mock` — success
- Start: `docker compose up -d appsync-mock` — started in <1s
- Health: `GET http://localhost:4006/` → `{"status":"ok"}`
- Publish: `POST http://localhost:4006/event` with x-api-key → `{"success":true}`
- Logs: `AppSync Events mock listening on port 4006` + publish log with channel and subscriber count

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generated package-lock.json for npm ci**
- **Found during:** Task 3 build attempt
- **Issue:** `npm ci` requires package-lock.json but one wasn't created with package.json
- **Fix:** Ran `npm install --package-lock-only` inside node:20-alpine container to generate lock file without modifying package.json
- **Files modified:** apps/infra/appsync-mock/package-lock.json (created)
- **Commit:** fcefaca

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 18a0961 | feat(quick-2): add AppSync Events mock server |
| Task 2 | 870a735 | feat(quick-2): wire appsync-mock into docker-compose with default env vars |
| Task 3 | fcefaca | feat(quick-2): smoke-test appsync-mock — builds, starts, health check passes |

## Self-Check

- [x] apps/infra/appsync-mock/server.mjs exists (143 lines)
- [x] apps/infra/appsync-mock/package.json exists
- [x] apps/infra/appsync-mock/Dockerfile exists
- [x] apps/infra/appsync-mock/package-lock.json exists
- [x] apps/infra/docker-compose.yml contains appsync-mock service
- [x] Commits 18a0961, 870a735, fcefaca all present
- [x] Mock built and smoke-tested successfully
