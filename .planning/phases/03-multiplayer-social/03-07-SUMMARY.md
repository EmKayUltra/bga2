---
phase: 03-multiplayer-social
plan: 07
subsystem: api
tags: [csharp, match-history, better-auth, game-service, lobby-service, postgresql]

# Dependency graph
requires:
  - phase: 03-multiplayer-social
    provides: LobbyService with TablePlayers containing real Better Auth user IDs; ProfileService.RecordMatchResults and GetMatchHistory
provides:
  - GameService.CreateGame accepts optional string[]? userIds parameter
  - Player objects in game state JSON include userId field (real Better Auth ID for lobby games)
  - ExtractPlayerResults reads userId field first, falls back to id for hot-seat/legacy games
  - LobbyService.StartGame passes real Better Auth user IDs from TablePlayers to CreateGame
  - MatchResult rows now contain real user IDs for lobby-started games
affects: [04-game-library, profile, match-history]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional parameter with null default for backward compatibility: CreateGame(gameId, playerNames, string[]? userIds = null)"
    - "TryGetProperty with ValueKind check for safe JSON null vs absent field distinction"
    - "Prefer real auth ID over game-scoped ID in data extraction with explicit fallback chain"

key-files:
  created: []
  modified:
    - apps/server/Services/GameService.cs
    - apps/server/Services/LobbyService.cs

key-decisions:
  - "userId stored on player objects alongside id (not replacing it) — id stays as game-scoped 'player-{i}' for hooks.ts/FSM compatibility"
  - "ExtractPlayerResults uses TryGetProperty userId with ValueKind == String check — correctly handles JSON null (hot-seat) vs absent property (legacy)"
  - "GameEndpoints.cs hot-seat path unchanged — passes 2 args, userIds defaults to null, backward compatible"

patterns-established:
  - "Data flow: TablePlayer.UserId -> CreateGame userIds[] -> player.userId in state JSON -> ExtractPlayerResults -> MatchResult.UserId"

requirements-completed:
  - SOCL-02
  - SOCL-01
  - MULT-01
  - MULT-03
  - MULT-04
  - MULT-05
  - MULT-06
  - SOCL-03
  - SOCL-04
  - SOCL-05
  - SOCL-06
  - PLAT-02

# Metrics
duration: 6min
completed: 2026-03-02
---

# Phase 3 Plan 7: Wire Real User IDs for Match History Summary

**GameService.CreateGame extended with optional userIds[] so lobby-started games store real Better Auth IDs in player.userId, fixing the SOCL-02 gap where ProfileService.GetMatchHistory always returned empty results**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-02T03:36:04Z
- **Completed:** 2026-03-02T03:42:00Z
- **Tasks:** 2 (Task 1: code changes; Task 2: verification)
- **Files modified:** 2

## Accomplishments

- `GameService.CreateGame` signature extended with `string[]? userIds = null` — optional third parameter preserves hot-seat backward compatibility
- Player objects in game state JSON now carry a `userId` field: real Better Auth ID for lobby games, `null` for hot-seat games
- `ExtractPlayerResults` updated to prefer `userId` over `id` when recording MatchResult rows — lobby games now produce match history entries linked to real user profiles
- `LobbyService.StartGame` extracts `UserId` from `TablePlayers` (ordered by seat index) and passes as `userIds` array to `CreateGame`
- All verification criteria confirmed: build passes 0 errors/0 warnings, all call sites verified correct

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire real user IDs through CreateGame and ExtractPlayerResults** - `077b5ff` (feat)
2. **Task 2: Verify match result recording with real user IDs** - verification only, no additional code changes

## Files Created/Modified

- `apps/server/Services/GameService.cs` - Added `string[]? userIds = null` parameter to `CreateGame`; `userId` field on player objects; `ExtractPlayerResults` uses `TryGetProperty("userId")` with fallback to `id`
- `apps/server/Services/LobbyService.cs` - `StartGame` extracts `UserId` from `TablePlayers` and passes to `CreateGame` as third argument

## Decisions Made

- `userId` stored as a separate field alongside `id` (not replacing it) — the game-scoped `id` field (`"player-{i}"`) must remain intact for hooks.ts, FSM, and zone naming throughout the game engine
- `TryGetProperty("userId", out var userIdProp) && userIdProp.ValueKind == JsonValueKind.String` — the `ValueKind` check correctly distinguishes JSON `null` (hot-seat: `"userId": null`, kind=Null) from a real string ID (kind=String), ensuring hot-seat correctly falls back to `id`
- Only `LobbyService.StartGame` call site changed; `GameEndpoints.cs` (hot-seat POST /games) remains 2-argument and works via optional parameter default

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SOCL-02 gap is closed: lobby-started games now record MatchResult rows with real Better Auth user IDs
- `ProfileService.GetMatchHistory(userId)` will return actual results for users who have completed multiplayer lobby games
- Profile stats (games played, win rate) now reflect actual completed games for authenticated users
- Hot-seat games continue to work as before — no regression
- Ready for Phase 4

## Self-Check: PASSED

- FOUND: apps/server/Services/GameService.cs
- FOUND: apps/server/Services/LobbyService.cs
- FOUND: .planning/phases/03-multiplayer-social/03-07-SUMMARY.md
- FOUND: commit 077b5ff (feat(03-07): wire real user IDs through CreateGame and ExtractPlayerResults)
- Build: 0 errors, 0 warnings
- All CreateGame call sites verified correct

---
*Phase: 03-multiplayer-social*
*Completed: 2026-03-02*
