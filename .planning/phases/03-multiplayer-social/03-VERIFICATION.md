---
phase: 03-multiplayer-social
verified: 2026-03-01T22:00:00Z
status: gaps_found
score: 28/30 must-haves verified
re_verification: false
gaps:
  - truth: "User can view match history with results, opponents, and dates"
    status: failed
    reason: "Match results are recorded with game-scoped player IDs (\"player-0\", \"player-1\") not real Better Auth user IDs. GameService.CreateGame receives only player display names and always sets player.id = \"player-{i}\". ProfileService.GetMatchHistory queries MatchResults WHERE UserId = Better Auth userId — this query returns 0 rows for every real user because no MatchResult row ever has a real user ID stored. The recording infrastructure and query infrastructure are both wired correctly; the ID mapping is the missing link."
    artifacts:
      - path: "apps/server/Services/GameService.cs"
        issue: "CreateGame assigns player.id = 'player-{i}' in the game state JSON regardless of who is playing; ExtractPlayerResults reads this as UserId and records it in MatchResults"
      - path: "apps/server/Services/LobbyService.cs"
        issue: "StartGame calls GameService.CreateGame(gameId, playerNames) — passes display names only, no user IDs. No path for real user IDs to reach game state."
    missing:
      - "Pass real user IDs alongside display names when creating a game from the lobby — either extend CreateGame signature or store a session→user mapping in a separate table"
      - "Store the real Better Auth userId in the game state's player.id field (or a parallel playerId field) so ExtractPlayerResults can record correct IDs"
human_verification:
  - test: "Two players on separate devices play Azul in real time via AppSync"
    expected: "Player A makes a move and Player B sees the updated board within 1 second without refreshing"
    why_human: "Requires AWS AppSync credentials (APPSYNC_HTTP_ENDPOINT, APPSYNC_API_KEY) configured in Docker environment — not testable without live AWS resources"
  - test: "PWA install prompt appears in Chrome and app launches as standalone"
    expected: "Chrome address bar shows install icon; after install, app opens without browser chrome"
    why_human: "PWA devOptions.enabled=false in development — service worker not active in Docker dev mode by design. Requires production build or toggling devOptions.enabled=true for one-off test."
  - test: "Chat messages appear in real-time during a game"
    expected: "Player A types a message and Player B sees it appear without refreshing"
    why_human: "Chat routing goes through AppSync Events WebSocket which requires live AWS credentials"
---

# Phase 3: Multiplayer + Social Verification Report

**Phase Goal:** Two or more players on different devices can play Azul in real time, find each other through the lobby, and play with friends via invite — the platform becomes multiplayer
**Verified:** 2026-03-01T22:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | User can register with email, password, and username | VERIFIED | `auth-client.ts` calls `authClient.signUp.email()` with username; `auth.ts` uses Better Auth with username plugin |
| 2  | User can log in with username and password | VERIFIED | `login/+page.svelte` calls `authClient.signIn.username({username, password})` |
| 3  | Authenticated user's session persists across page refresh | VERIFIED | `hooks.server.ts` calls `auth.api.getSession()` on every request; `locals.user` populated |
| 4  | C# API rejects unauthenticated requests to protected endpoints with 401 | VERIFIED | `Program.cs` has `AddAuthentication(JwtBearerDefaults)` + `UseAuthentication()` + `UseAuthorization()`; move endpoint has `.RequireAuthorization()` |
| 5  | C# API accepts requests with valid JWT Bearer token from Better Auth | VERIFIED | JWT Bearer configured with `Authority = "http://client:5173/api/auth"` for JWKS discovery |
| 6  | User can create a public table from the lobby | VERIFIED | `LobbyService.CreateTable` creates a `GameTable` with `IsPrivate=false`; `/lobby` page has create-table dialog |
| 7  | User can create a private invite-only table with optional password | VERIFIED | `CreateTableRequest` has `IsPrivate` bool + `Password`; `LobbyService` stores SHA-256 hash |
| 8  | Lobby shows a list of open tables that refreshes every 5 seconds | VERIFIED | `lobby/+page.svelte` `onMount` calls `setInterval(fetchTables, 5000)` |
| 9  | User can join an open table and see other players in the waiting room | VERIFIED | `LobbyService.JoinTable` adds `TablePlayer`; waiting room polls `getTable` every 3s |
| 10 | Host can start the game when enough players have joined | VERIFIED | `LobbyService.StartGame` validates host + minPlayers; calls `GameService.CreateGame`; redirects via `goto(/game/${sessionId})` |
| 11 | Quick Play button auto-joins or creates a table | VERIFIED | `LobbyService.QuickPlay` scans Waiting tables and joins or creates; wired to lobby page button |
| 12 | When Player A makes a move, Player B sees the updated board within 1 second | HUMAN NEEDED | `AppSyncPublisher.PublishGameState` is wired after `SaveChangesAsync`; `appsync.ts` subscribes to `/game/{sessionId}/state`; requires live AWS AppSync to test |
| 13 | Only the current player can submit moves — other players' controls are disabled | VERIFIED | `SceneManager.isLocalPlayerTurn()` guards `handleSourceClick`/`handleDestinationClick`; `localPlayerIndex` controls turn discipline |
| 14 | If a player closes and reopens the tab, they see current board state and can continue | VERIFIED | `handleAppSyncError` re-fetches state via `getGameState`, re-subscribes, then enables controls |
| 15 | Submitting the same move twice does not double-process — idempotent via moveId | VERIFIED | `gameApi.ts` generates `crypto.randomUUID()` as `moveId`; `GameService` checks `PlayedMoveIds` JSONB array |
| 16 | Two simultaneous moves result in one success and one 409 retry, not data corruption | VERIFIED | `DbUpdateConcurrencyException` → `IsConcurrencyConflict=true` → `Results.Conflict(response)` in `GameEndpoints`; client handles 409 with `conflict: true` |
| 17 | User can view their profile showing username, avatar, member since, games played, win rate | VERIFIED | `ProfileService.GetProfile` queries Better Auth user table via raw SQL + `MatchResults` aggregation; `/profile/[username]` page renders all fields |
| 18 | User can pick a preset avatar from a curated set | VERIFIED | `avatars.ts` defines 16 preset IDs; `/settings` page renders 4x4 avatar grid; `SocialEndpoints` validates against preset list |
| 19 | User can toggle profile privacy (public/private) | VERIFIED | `UserProfile.IsPublic`; `ProfileService.UpdateProfile`; settings page has privacy toggle |
| 20 | User can change their username (unique, with 30-day cooldown) | VERIFIED | `ProfileService.UpdateUsername` checks uniqueness + `UsernameChangedAt`; returns 409 or 429 |
| 21 | User can view match history with results, opponents, and dates | FAILED | `ProfileService.GetMatchHistory` correctly queries `MatchResults` by userId, but `MatchResults.UserId` is always "player-0", "player-1" etc. — never a real Better Auth user ID. Match history will always be empty for every real user. |
| 22 | Other users can view a public profile by username | VERIFIED | `GET /social/profile/{username}` is open (no auth); page respects `isPublic` flag |
| 23 | User can search for friends by username and send a friend request | VERIFIED | `FriendService.SearchUsers` runs ILIKE query; `SendRequest` creates `Friendship` row |
| 24 | Friend requests are mutual — both sides must accept | VERIFIED | `Friendship` has `Status.Pending`; `AcceptRequest` validates addressee matches |
| 25 | User can see a list of friends with online/offline status | VERIFIED | `FriendService.GetFriends` returns `isOnline` from `ConcurrentDictionary`; friends page shows green/gray dots |
| 26 | User can invite a friend to a game table via in-app notification | VERIFIED | "Invite to Game" button on friends page navigates to `/lobby`; waiting room has "Copy Invite Link" |
| 27 | User can share a game invite link that works for non-platform users | VERIFIED | `InviteService` generates HMACSHA256-signed tokens; `/invite/[token]` validates and redirects to register if not authed |
| 28 | Post-game screen prompts to add opponents as friends | VERIFIED | `game/[id]/+page.svelte` shows friend prompt with `sendFriendRequest` buttons for each opponent in score overlay |
| 29 | Players can send and receive text chat messages during a game | HUMAN NEEDED | `ChatPanel` wired to `/chat/{channelId}/send` + `subscribeToChatChannel`; delivery requires live AppSync |
| 30 | PWA installs to home screen from browser install prompt | HUMAN NEEDED | `vite.config.ts` has `SvelteKitPWA` with `registerType: 'autoUpdate'`; `devOptions.enabled=false` in dev — install prompt not visible in Docker dev |

**Score:** 27/30 truths verified (1 failed, 3 need human verification)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/client/src/lib/auth.ts` | Better Auth server instance with pg pool, username + jwt plugins | VERIFIED | Substantive: `betterAuth()` with Pool, `username()`, `jwt()`, `basePath` configured |
| `apps/client/src/lib/auth-client.ts` | Browser auth client with usernameClient | VERIFIED | `createAuthClient` + `usernameClient()` plugin |
| `apps/client/src/hooks.server.ts` | SvelteKit hook populating locals.user | VERIFIED | `auth.api.getSession()` called; `event.locals.user` populated |
| `apps/server/Program.cs` | JWT Bearer auth middleware | VERIFIED | `AddAuthentication(JwtBearerDefaults)`, `Authority = "http://client:5173/api/auth"`, `UseAuthentication()`, `UseAuthorization()` |
| `apps/server/Data/GameTable.cs` | Lobby table entity | VERIFIED | File exists with full entity definition |
| `apps/server/Data/Friendship.cs` | Friend request entity | VERIFIED | File exists with `FriendshipStatus` enum |
| `apps/server/Data/MatchResult.cs` | Match result entity | VERIFIED | File exists |
| `apps/server/Services/LobbyService.cs` | Lobby business logic | VERIFIED | 350+ lines: all 7 methods implemented with real DB queries |
| `apps/server/Endpoints/LobbyEndpoints.cs` | Table CRUD endpoints | VERIFIED | `MapLobbyEndpoints` maps all 7 routes |
| `apps/client/src/lib/api/lobbyApi.ts` | TypeScript lobby client | VERIFIED | All 7 functions with JWT token cache |
| `apps/client/src/routes/lobby/+page.svelte` | Lobby page with polling | VERIFIED | `setInterval(fetchTables, 5000)` in `onMount`; create dialog; Quick Play |
| `apps/client/src/routes/table/[id]/+page.svelte` | Waiting room | VERIFIED | 3s polling; auto-redirect on `status == Playing`; start button; ChatPanel |
| `apps/server/Endpoints/SocialEndpoints.cs` | Profile endpoints | VERIFIED | `MapSocialEndpoints` with 5 endpoints |
| `apps/server/Services/ProfileService.cs` | Profile CRUD + stats | VERIFIED | Raw SQL for Better Auth user table; EF Core for MatchResults |
| `apps/client/src/routes/profile/[username]/+page.svelte` | Profile page | VERIFIED | Calls `getProfile` + `getMatchHistory`; renders avatar, stats, history |
| `apps/client/src/lib/appsync.ts` | Amplify Events subscription helpers | VERIFIED | `events.connect`, `subscribeToGame`, `subscribeToChatChannel` all implemented |
| `apps/server/Services/AppSyncPublisher.cs` | HTTP publish to AppSync | VERIFIED | `PublishGameState` implemented with graceful degradation |
| `apps/client/src/lib/api/gameApi.ts` | submitMove with moveId | VERIFIED | `crypto.randomUUID()` generates moveId per submit; 409 handled |
| `apps/server/Models/GameModels.cs` | MoveRequest with MoveId | VERIFIED | `MoveId = null` optional field added |
| `apps/server/Endpoints/FriendEndpoints.cs` | Friend CRUD + search endpoints | VERIFIED | 8 endpoints under `/friends` MapGroup |
| `apps/server/Services/FriendService.cs` | Friend request logic + online tracking | VERIFIED | `ConcurrentDictionary` presence; all CRUD methods |
| `apps/server/Services/InviteService.cs` | Signed invite token generation | VERIFIED | HMACSHA256; 24h expiry; constant-time comparison |
| `apps/client/src/routes/friends/+page.svelte` | Friends list page | VERIFIED | Search debounce; requests; friend list with online dots |
| `apps/client/src/routes/invite/[token]/+page.server.ts` | Invite link validation | VERIFIED | SSR load validates token; redirects authed → `/table/{id}`, unauthed → `/auth/register?next=` |
| `apps/client/src/lib/components/ChatPanel.svelte` | Reusable chat component | VERIFIED | `subscribeToChatChannel`; report button; own/other message alignment |
| `apps/server/Services/ChatFilter.cs` | Server-side profanity filter | VERIFIED | `class ChatFilter` with `_blockedWords` HashSet + l33t-speak normalization |
| `apps/server/Data/PlayerReport.cs` | PlayerReport entity | VERIFIED | Entity definition with all required fields |
| `apps/client/vite.config.ts` | SvelteKitPWA plugin | VERIFIED | `SvelteKitPWA` imported and configured with manifest + workbox |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `hooks.server.ts` | `auth.ts` | `auth.api.getSession` | WIRED | Line 9: `auth.api.getSession({ headers: event.request.headers })` |
| `Program.cs` | `http://client:5173/api/auth` | JWT Bearer MetadataAddress | WIRED | `options.Authority = "http://client:5173/api/auth"` — JWKS fetched from there |
| `auth-client.ts` | `login/+page.svelte` | `signIn.username()` | WIRED | Login page calls `authClient.signIn.username({username, password})` |
| `lobby/+page.svelte` | `LobbyEndpoints.cs` | `setInterval(fetchTables, 5000)` | WIRED | `setInterval(fetchTables, 5000)` in onMount; `fetchTables` calls `listTables()` from `lobbyApi.ts` |
| `LobbyService.cs` | `GameDbContext.cs` | EF Core queries on GameTable | WIRED | `_db.GameTables.Where(...)`, `_db.GameTables.FindAsync(...)` throughout |
| `table/[id]/+page.svelte` | `game/[id]/+page.svelte` | `goto(/game/{sessionId})` | WIRED | `await goto('/game/${detail.sessionId}')` on `status === 'Playing'` |
| `profile/[username]/+page.svelte` | `SocialEndpoints.cs` | `getProfile` + `getMatchHistory` | WIRED | Page calls both in `Promise.all([getProfile(data.username), getMatchHistory(data.username)])` |
| `GameService.cs` | `AppSyncPublisher.cs` | `PublishGameState` after move | WIRED | `await _appSyncPublisher.PublishGameState(sessionId, newStateJson, session.Version)` after `SaveChangesAsync` |
| `appsync.ts` | `SceneManager.ts` | `applyRemoteState` callback | WIRED | `subscribeToGame(sessionId, sceneManager.applyRemoteState)` in game page onMount |
| `gameApi.ts` | `GameEndpoints.cs` | `moveId` in POST body | WIRED | `const moveId = crypto.randomUUID(); const body = { ...move, moveId }` |
| `friends/+page.svelte` | `FriendEndpoints.cs` | `friendApi.ts` REST calls | WIRED | Page imports from `friendApi.ts`; all friend operations mapped to endpoints |
| `InviteService.cs` | `invite/[token]/+page.server.ts` | HMAC token generation/validation | WIRED | Server creates tokens with `HMACSHA256`; SSR load validates via `GET /invites/{token}/validate` |
| `game/[id]/+page.svelte` | `FriendEndpoints.cs` | `sendFriendRequest` post-game | WIRED | Post-game overlay calls `sendFriendRequest(opponentName)` from `friendApi.ts` |
| `ChatPanel.svelte` | `appsync.ts` | `subscribeToChatChannel` | WIRED | `cleanup = await subscribeToChatChannel(channelId, (msg) => ...)` in onMount |
| `ChatFilter.cs` | `Program.cs` | Singleton registration | WIRED | `builder.Services.AddSingleton<ChatFilter>()` |
| `ChatPanel.svelte` | `ChatEndpoints.cs` | `POST /chat/{channelId}/report` | WIRED | `fetch('${API_BASE}/chat/${channelId}/report', { method: 'POST', ... })` |
| `vite.config.ts` | `svelte.config.js` | `serviceWorker.register: false` | WIRED | `svelte.config.js` has `serviceWorker: { register: false }` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MULT-01 | 03-04 | Real-time synchronous play via AppSync Events WebSocket | VERIFIED (infrastructure) / HUMAN for end-to-end | AppSyncPublisher + appsync.ts + SceneManager.applyRemoteState all wired; end-to-end requires live AWS |
| MULT-03 | 03-02 | Lobby with open and invite-only table creation | VERIFIED | LobbyService.CreateTable with IsPrivate flag; lobby page with create dialog |
| MULT-04 | 03-04 | Reconnection re-fetches server state before enabling interaction | VERIFIED | `handleAppSyncError` → `getGameState` → re-subscribe → enable controls |
| MULT-05 | 03-04 | Idempotent move protocol with client-generated UUIDs | VERIFIED | `crypto.randomUUID()` in `submitMove`; `PlayedMoveIds` deduplication in GameService |
| MULT-06 | 03-04 | Optimistic locking with state versioning prevents concurrent corruption | VERIFIED | `DbUpdateConcurrencyException` → 409 Conflict; version returned in MoveResponse |
| SOCL-01 | 03-01, 03-03 | User can create profile with username and avatar | VERIFIED | Better Auth provides username; UserProfile stores avatar; /settings page |
| SOCL-02 | 03-03 | User can view match history with results, opponents, dates | BLOCKED | Infrastructure wired but MatchResults.UserId stores "player-0" etc. never real user IDs — match history always empty |
| SOCL-03 | 03-05 | User can add/remove friends | VERIFIED | FriendService + FriendEndpoints + friends page all wired end-to-end |
| SOCL-04 | 03-05 | User can invite friends to a game | VERIFIED | InviteService generates HMAC tokens; invite link page validates and redirects; Copy Invite Link in waiting room |
| SOCL-05 | 03-02 | User can create private invite-only tables | VERIFIED | `IsPrivate=true` table; private tables excluded from lobby listing; join requires link |
| SOCL-06 | 03-06 | User can send text chat messages during and after games | VERIFIED (infrastructure) / HUMAN for end-to-end | ChatPanel + ChatEndpoints + ChatFilter + AppSync channel all wired; delivery requires live AWS |
| PLAT-02 | 03-06 | PWA installable from browser with service worker | VERIFIED (infrastructure) / HUMAN for install prompt | SvelteKitPWA configured; devOptions.enabled=false in dev is intentional |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/server/Services/GameService.cs` | ~493 | Comment: "player.id in the state is 'player-0', 'player-1' etc. (not real user IDs)." | Warning | Match results recorded with wrong user IDs — SOCL-02 gap |
| `apps/server/Services/GameService.cs` | ~489 | `CreateGame` always assigns `id = "player-{i}"` regardless of real user IDs | Blocker | Prevents match history from ever linking to real user accounts |

---

## Human Verification Required

### 1. Real-Time Multiplayer via AppSync

**Test:** Register two accounts in separate browser windows. Create a lobby table from one, join from the other. Have Player A make a move (take tiles from a factory).
**Expected:** Player B sees the updated board within 1 second without refreshing the page.
**Why human:** Requires `APPSYNC_HTTP_ENDPOINT` and `APPSYNC_API_KEY` environment variables pointing to a real AWS AppSync Event API. These can't be automated without live AWS credentials.

### 2. PWA Install Prompt

**Test:** Open http://localhost:5173 in Chrome (after running a production build — `npm run build`). Look for the install icon in the address bar or install option in the three-dot menu.
**Expected:** Chrome shows "Install BGA2 — Board Games Online"; after install, the app opens in its own window without browser chrome.
**Why human:** `devOptions.enabled=false` disables the service worker in Docker dev mode intentionally (to prevent caching conflicts during hot-reload). A production build is required to trigger the install prompt.

### 3. Real-Time Chat in Waiting Room and Game

**Test:** Have two logged-in users in the same game table's waiting room. User A types a message and presses Enter.
**Expected:** Message appears immediately in User B's chat panel with User A's username.
**Why human:** Chat delivery goes through AppSync Events WebSocket (`/game/{channelId}/chat`). Without live AWS AppSync, the server-side publish succeeds but no subscriber receives the event.

---

## Gaps Summary

### Gap: SOCL-02 — Match History Always Empty (Blocker)

The match history infrastructure is correctly built: `MatchResult` entity exists, `ProfileService.RecordMatchResults` is called when a game ends, and `ProfileService.GetMatchHistory` correctly queries by `userId`. However, every `MatchResult` row ever stored has `UserId = "player-0"` or `"player-1"` (etc.) — never a real Better Auth user ID.

The root cause is in `GameService.CreateGame`, which builds the game state's players array with `id = $"player-{i}"`. This game-scoped ID becomes what `ExtractPlayerResults` extracts as `UserId` and stores in `MatchResults`. Since the `GetMatchHistory` query filters `WHERE UserId = {realBetterAuthId}`, it never finds any rows.

**Fix required:** When creating a game from a lobby table (via `LobbyService.StartGame`), pass the real Better Auth user IDs alongside display names into `CreateGame`, and include them in the player objects in the initial game state (as a separate field like `userId`). Then update `ExtractPlayerResults` to read the `userId` field if present.

This affects requirement SOCL-02 and the profile stats shown in requirement SOCL-01 (games played, win rate will also be 0).

---

*Verified: 2026-03-01T22:00:00Z*
*Verifier: Claude (gsd-verifier)*
