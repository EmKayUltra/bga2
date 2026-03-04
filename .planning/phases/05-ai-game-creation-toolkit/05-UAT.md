---
status: testing
phase: 05-ai-game-creation-toolkit
source: 05-01a-SUMMARY.md, 05-01b-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md
started: 2026-03-03T01:30:00Z
updated: 2026-03-03T01:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Hive Unit Tests Pass
expected: |
  Run `docker compose -f apps/infra/docker-compose.yml exec client npx nx test games-hive` — all 29 tests pass covering placement rules, movement for all 5 piece types (Queen, Beetle, Grasshopper, Spider, Ant), One Hive Rule, Freedom-to-Move, beetle stacking, and win condition.
awaiting: user response

## Tests

### 1. Hive Unit Tests Pass
expected: Run `docker compose -f apps/infra/docker-compose.yml exec client npx nx test games-hive` — all 29 tests pass covering placement rules, movement for all 5 piece types, One Hive Rule, Freedom-to-Move, beetle stacking, and win condition.
result: [pending]

### 2. CLI Tool Builds Successfully
expected: Run `docker compose -f apps/infra/docker-compose.yml exec server dotnet build apps/tools/game-creator/game-creator.csproj` — builds with 0 errors. The tool has ingest, generate, and deploy subcommands registered.
result: [pending]

### 3. Test Harness Page Loads
expected: Navigate to http://localhost:5173/dev/harness in your browser. Page loads with a game selector dropdown, a renderer area (PixiJS canvas or JSON viewer), dev panel controls, and bot validator section. Red "DEV" badge visible.
result: [pending]

### 4. Test Harness Discovers Hive
expected: The game selector dropdown on /dev/harness lists "hive" as an available game (alongside "azul"). Selecting Hive loads its game.json and shows schema validation results.
result: [pending]

### 5. Create Hive Game Session
expected: Run `curl -s -X POST http://localhost:8080/games -H 'Content-Type: application/json' -d '{"gameId":"hive","playerNames":["Alice","Bob"]}'` — returns a JSON response with a session ID. The session has an empty freeform board zone and 11 pieces per player in their hand zones.
result: [pending]

### 6. Hive Valid Moves Include Coordinates
expected: After creating a Hive session, GET the valid moves. First player's moves should include placement options with `data: { q: 0, r: 0 }` for the initial placement at the origin hex. Each valid move carries q/r coordinate data.
result: [pending]

### 7. Bot Validation Completes Without Deadlock
expected: Using the test harness bot validator (or via API calls to `/dev/{sessionId}/move`), a random bot can play through a Hive game without deadlocking. Game either ends normally (queen surrounded) or reaches the move limit. No crashes or zero-valid-moves errors.
result: [pending]

### 8. Deploy Command Creates Package
expected: Run `docker compose -f apps/infra/docker-compose.yml exec server dotnet run --project apps/tools/game-creator/game-creator.csproj -- deploy hive libs/games/hive --version 1.0.0` — creates a zip file containing game.json and hooks.ts with Jint validation passing (0 warnings).
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0

## Gaps

[none yet]
