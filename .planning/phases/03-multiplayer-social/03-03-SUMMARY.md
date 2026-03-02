---
phase: 03-multiplayer-social
plan: "03"
subsystem: social
tags: [csharp, svelte5, svelte, postgresql, rawsql, betterauth, avatars, profile, match-history]

# Dependency graph
requires:
  - phase: 03-multiplayer-social
    plan: "01"
    provides: Better Auth JWT, MatchResult entity, GameDbContext, JWT Bearer auth middleware

provides:
  - UserProfile entity (avatar, isPublic, usernameChangedAt) with EF Core + EnsureCreated
  - ProfileService: GetProfile, GetMatchHistory, UpdateProfile, UpdateUsername, RecordMatchResults
  - SocialEndpoints: GET/PUT /social/profile/{username}, GET /social/profile/{username}/history, GET /social/avatars, PUT /social/profile/username
  - Match result auto-recording when GameService detects finished==true in game state
  - Client socialApi.ts with getProfile, getMatchHistory, updateProfile, updateUsername, getAvatars, formatRelativeDate
  - avatars.ts utility with 16 preset avatar emoji mappings
  - /profile/[username] SvelteKit page with avatar, stats, match history, privacy notice
  - /settings SvelteKit page with avatar grid selector, username change (30-day cooldown), privacy toggle
  - Nav bar updated with profile link and settings link

affects:
  - 03-04-realtime (can show opponent profile on game screen)
  - 03-05-friends (friends list can link to profiles)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Raw SQL via IDbConnection against Better Auth's user table for username read/write (Better Auth owns that table — no EF Core entity)
    - UserProfile as a separate extension entity referenced by userId string FK to Better Auth user.id
    - Preset avatar identifiers (strings) map to emoji in client avatars.ts — art-swappable in Phase 6
    - Token cache (30s) for /api/auth/token JWT fetch in API clients to avoid hammering auth endpoint

key-files:
  created:
    - apps/server/Data/UserProfile.cs
    - apps/server/Services/ProfileService.cs
    - apps/server/Endpoints/SocialEndpoints.cs
    - apps/client/src/lib/api/socialApi.ts
    - apps/client/src/lib/avatars.ts
    - apps/client/src/routes/profile/[username]/+page.svelte
    - apps/client/src/routes/profile/[username]/+page.server.ts
    - apps/client/src/routes/settings/+page.svelte
  modified:
    - apps/server/Data/GameDbContext.cs (added DbSet<UserProfile> with model config)
    - apps/server/Services/GameService.cs (added ProfileService dep, IsGameFinished + ExtractPlayerResults, RecordMatchResults call)
    - apps/server/Program.cs (registered ProfileService as scoped, added MapSocialEndpoints)
    - apps/client/src/routes/+layout.svelte (nav: username links to profile, settings link added)

key-decisions:
  - "UserProfile stored as separate entity (not Better Auth user table) — Better Auth owns user/username/id; C# only extends with avatar/isPublic/usernameChangedAt"
  - "Username updates go via raw SQL against Better Auth's user table — preserves Better Auth's session consistency without reimplementing auth logic"
  - "Match result auto-recording uses player.id ('player-0' etc.) as UserId until lobby integration (Plan 02) provides real user IDs — non-fatal if recording fails"
  - "30-day username cooldown enforced server-side via UserProfile.UsernameChangedAt; 429 status returned with retryAfterDays in body for client display"
  - "Avatar set as 16 preset string identifiers; emoji mapping lives in client avatars.ts — allows Phase 6 art replacement without API changes"

patterns-established:
  - "Social API auth: reuse same /api/auth/token + 30s cache pattern from lobbyApi.ts"
  - "Profile privacy: server returns limited ProfileResponse when isPublic=false and viewer != owner; 403 on history endpoint"
  - "Settings page auth guard: $effect watches session and calls goto('/auth/login?next=/settings') when unauthenticated"

requirements-completed: [SOCL-01, SOCL-02]

# Metrics
duration: 10min
completed: 2026-03-02
---

# Phase 3 Plan 03: User Profiles + Match History Summary

**UserProfile entity + social API endpoints (GET/PUT /social/profile, avatar list, match history) with SvelteKit profile page, avatar selector grid, and settings page featuring 30-day username cooldown**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-02T01:35:00Z
- **Completed:** 2026-03-02T01:45:05Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- C# ProfileService with full CRUD: profile reads (raw SQL + EF Core join), match history with opponent lookup, avatar validation, username change with 30-day cooldown enforcement, match result recording on game end
- SocialEndpoints wired into the existing MapGroup pattern — 5 endpoints covering all profile and avatar operations
- GameService now auto-records match results (per-player won/score/rank) when `finished==true` appears in state after any move
- SvelteKit /profile/[username] page showing avatar emoji, stats cards, and match history with result badges and opponent names
- /settings page with 4x4 avatar selector grid (border highlight on selection), username change with cooldown notice, privacy toggle, and auth guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Profile service, endpoints, and match result recording** - `7d9902b` (feat)
2. **Task 2: Profile page, avatar selector, and settings page** - `e5babb7` (feat)

## Files Created/Modified

- `apps/server/Data/UserProfile.cs` - Profile extension entity: avatar, isPublic, usernameChangedAt (PK = Better Auth userId)
- `apps/server/Services/ProfileService.cs` - GetProfile (raw SQL + EF join), GetMatchHistory with opponent lookup, UpdateProfile (avatar upsert), UpdateUsername (uniqueness + 30-day cooldown via raw SQL), RecordMatchResults
- `apps/server/Endpoints/SocialEndpoints.cs` - 5 social endpoints with auth guards; 409 for taken username, 429 with retryAfterDays for cooldown
- `apps/server/Data/GameDbContext.cs` - Added DbSet<UserProfile> with HasKey(UserId), defaults for avatar/isPublic
- `apps/server/Services/GameService.cs` - Added ProfileService dependency, IsGameFinished(), ExtractPlayerResults(), RecordMatchResults call after move save
- `apps/server/Program.cs` - ProfileService registered as scoped before GameService (which depends on it); MapSocialEndpoints added
- `apps/client/src/lib/api/socialApi.ts` - Full social API client with types, token cache, getProfile/getMatchHistory/updateProfile/updateUsername/getAvatars, formatRelativeDate
- `apps/client/src/lib/avatars.ts` - AVATAR_MAP record, getAvatarEmoji(), PRESET_AVATAR_IDS const array, AvatarId type
- `apps/client/src/routes/profile/[username]/+page.svelte` - Profile page: header with avatar+username+member-since, stats cards, match history list, privacy notice, edit button for own profile
- `apps/client/src/routes/profile/[username]/+page.server.ts` - Pass username param to page for SSR-friendly routing
- `apps/client/src/routes/settings/+page.svelte` - Settings page: username change field + cooldown display, 16-avatar grid selector, privacy toggle, save profile button, auth guard
- `apps/client/src/routes/+layout.svelte` - Nav updated: username is clickable link to /profile/{username}, Settings link added

## Decisions Made

- **UserProfile extension table:** Better Auth fully owns the `user` table (id/email/name/username). C# only manages a `UserProfile` extension row keyed by userId. This avoids EF Core conflicts with Better Auth's schema while storing avatar/privacy/cooldown data.
- **Raw SQL for username operations:** `UPDATE "user" SET username = @newUsername WHERE id = @userId` — direct raw SQL preserves Better Auth's session state without going through Better Auth's API layer, which has no admin endpoint for username updates.
- **Match result player IDs:** Currently uses game-scoped player IDs ("player-0" etc.) not real auth user IDs. Lobby integration (Plan 02 complete) would need a session→user mapping to record real match results. The hook is in place; the IDs are placeholder.
- **29/409/429 status codes:** Username taken → 409 Conflict; cooldown active → 429 Too Many Requests with `retryAfterDays` in JSON body (not just Retry-After header) for client display.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Program.cs had already been updated by Plan 02 (lobby) with LobbyService registration and MapLobbyEndpoints — adapted by inserting ProfileService registration before GameService (which depends on it for match recording). No conflicts.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Profile endpoint ready for Plan 04 (real-time): game over screen can link to player profiles
- Match history endpoint ready for Plan 05 (friends): friend activity feeds can show recent games
- Avatar selection working: game lobby can display avatar emoji next to player name
- Username change cooldown stored in DB: ready for production enforcement
- Match result recording wired but using game-scoped player IDs — Plan 02 lobby integration should pass real userId when creating game sessions for full stat tracking

---
*Phase: 03-multiplayer-social*
*Completed: 2026-03-02*

## Self-Check: PASSED

- FOUND: apps/server/Data/UserProfile.cs
- FOUND: apps/server/Services/ProfileService.cs
- FOUND: apps/server/Endpoints/SocialEndpoints.cs
- FOUND: apps/client/src/lib/api/socialApi.ts
- FOUND: apps/client/src/lib/avatars.ts
- FOUND: apps/client/src/routes/profile/[username]/+page.svelte
- FOUND: apps/client/src/routes/settings/+page.svelte
- FOUND: 7d9902b (Task 1 commit)
- FOUND: e5babb7 (Task 2 commit)
- Server build: 0 errors, 0 warnings
- TypeScript check: 0 errors
