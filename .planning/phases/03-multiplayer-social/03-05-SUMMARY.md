---
phase: 03-multiplayer-social
plan: "05"
subsystem: social
tags: [friends, invites, hmac, csharp, svelte5, postgresql, online-status]

# Dependency graph
requires:
  - phase: 03-multiplayer-social
    plan: "01"
    provides: Friendship entity, JWT auth, GameDbContext, UserProfile entity

provides:
  - FriendService: user search, send/accept/decline/remove/block, friends list with online status
  - InviteService: HMACSHA256 signed invite tokens with 24h expiry
  - FriendEndpoints: /friends CRUD + search + block
  - InviteEndpoints: /invites create and validate
  - /friends page: search, requests, friends list with online dots, 30s polling
  - /invite/[token]: server-side validation and redirect
  - Post-game friend prompt on /game/[id]
  - Copy Invite Link button on /table/[id]

affects:
  - apps/client/src/routes/game/[id]/+page.svelte (post-game prompt)
  - apps/client/src/routes/table/[id]/+page.svelte (invite link button)

# Tech tracking
tech-stack:
  added:
    - HMACSHA256 via System.Security.Cryptography for invite token signing
    - ConcurrentDictionary<string, DateTime> for in-memory presence tracking

  patterns:
    - Friend requests are directional (Requester → Addressee) but removal is bidirectional (either party)
    - Blocked users normalised to requester=blocker, addressee=blocked in Friendship row
    - InviteService token: base64url({tableId}:{expiresAt}:{hmacSig}) — split from right to handle ISO date colons
    - Online presence: static ConcurrentDictionary updated in UseMiddleware after auth resolution; IsOnline = lastSeen < 60s
    - Client: 300ms debounce on search input, 30s interval + visibilitychange polling on friends page

key-files:
  created:
    - apps/server/Services/FriendService.cs
    - apps/server/Services/InviteService.cs
    - apps/server/Endpoints/FriendEndpoints.cs
    - apps/server/Endpoints/InviteEndpoints.cs
    - apps/client/src/lib/api/friendApi.ts
    - apps/client/src/routes/friends/+page.svelte
    - apps/client/src/routes/invite/[token]/+page.server.ts
    - apps/client/src/routes/invite/[token]/+page.svelte
  modified:
    - apps/server/Program.cs (register FriendService+InviteService, last-seen middleware, endpoint mapping)
    - apps/client/src/routes/game/[id]/+page.svelte (post-game friend prompt)
    - apps/client/src/routes/table/[id]/+page.svelte (Copy Invite Link button + toast)

key-decisions:
  - "In-memory ConcurrentDictionary for online presence — acceptable for dev; production would use Redis or DynamoDB TTL"
  - "HMAC token split from the right (lastIndexOf) to handle ISO 8601 dates which contain colons in the payload"
  - "BlockUser normalises the row so blocker is always requesterId — simplifies query for blocked check in SearchUsers"
  - "Post-game friend prompt matches by player.name (display name) not userId — game state does not carry Better Auth userIds in hot-seat mode"
  - "Invite link validate endpoint requires no auth — link recipients may not be logged in yet"

# Metrics
duration: 8min
completed: 2026-03-02
---

# Phase 3 Plan 05: Friends + Invite System Summary

**HMAC-signed invite links, mutual friend requests with online/offline presence, friends page with debounced search, post-game friend prompt, and copy-invite-link from waiting room**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-02T01:49:01Z
- **Completed:** 2026-03-02T01:57:08Z
- **Tasks:** 2
- **Files created:** 8
- **Files modified:** 3

## Accomplishments

- FriendService: user search (ILIKE prefix, excludes blockers), SendRequest checks both directions for existing friendships, AcceptRequest/DeclineRequest/RemoveFriend with ownership checks, BlockUser normalizes rows, GetFriends with batch user detail fetch, online status via 60s threshold ConcurrentDictionary
- InviteService: HMACSHA256 tokens `base64url({tableId}:{isoExpiry}:{sig})`, 24h expiry, constant-time signature comparison (CryptographicOperations.FixedTimeEquals), correct ISO date parsing
- FriendEndpoints: 8 endpoints mapped under /friends group with RequireAuthorization
- InviteEndpoints: POST /invites (auth), GET /invites/{token}/validate (no auth)
- Program.cs: services registered, last-seen middleware (after auth), endpoint groups mapped
- /friends page: full UI with search debounce, incoming/outgoing request cards, friends list with green/gray online dots, avatar emoji, 30s polling + visibility polling
- /invite/[token]: SSR load validates token server-to-server, redirects authed users to /table/{id}, unauthed to /auth/register?next=, error page for invalid tokens
- Post-game friend prompt: shows "Add Friend" buttons for each opponent in score modal when user is logged in
- Table waiting room: "Copy Invite Link" creates signed token and writes to clipboard with toast feedback

## Task Commits

1. **Task 1: Friends service, endpoints, and invite system** - `34f12cc` (feat)
2. **Task 2: Friends page, invite links, and post-game friend prompt** - `d97c2a8` (feat)

## Files Created/Modified

- `apps/server/Services/FriendService.cs` — 350 lines: search, request CRUD, block, friends list with online tracking
- `apps/server/Services/InviteService.cs` — HMACSHA256 token generation and validation
- `apps/server/Endpoints/FriendEndpoints.cs` — 8 friend endpoints under /friends MapGroup
- `apps/server/Endpoints/InviteEndpoints.cs` — POST /invites + GET /invites/{token}/validate
- `apps/server/Program.cs` — registered FriendService+InviteService, added last-seen middleware, added MapFriendEndpoints + MapInviteEndpoints
- `apps/client/src/lib/api/friendApi.ts` — getFriends, getPendingRequests, searchUsers, sendFriendRequest, accept/decline/remove, createInviteLink, validateInviteToken
- `apps/client/src/routes/friends/+page.svelte` — full friends page with all features
- `apps/client/src/routes/invite/[token]/+page.server.ts` — SSR load with server-to-server validation + redirect
- `apps/client/src/routes/invite/[token]/+page.svelte` — error page for invalid tokens
- `apps/client/src/routes/game/[id]/+page.svelte` — post-game friend prompt added to score overlay
- `apps/client/src/routes/table/[id]/+page.svelte` — Copy Invite Link button with clipboard API + toast

## Decisions Made

- **In-memory ConcurrentDictionary for online presence:** Production-viable approach would use Redis or DynamoDB TTL, but in-memory is correct for dev where single-instance is guaranteed. Static dictionary persists across DI scoped lifetime correctly.
- **HMAC token split from the right:** ISO 8601 datetimes like `2026-03-03T01:49:01.000+00:00` contain colons. Token structure is `{tableId}:{isoDate}:{sig}` where sig is always the last `:` segment.
- **BlockUser normalization:** When blocking, the row is normalized so requester=blocker/addressee=blocked regardless of prior friendship direction. This simplifies the search exclusion query.
- **Post-game prompt uses player.name:** The game state contains player names (display names), not Better Auth userIds. The friend request API accepts a username and looks up the addressee — matching display names works for users who set their display name to their username (default behavior).
- **Invite validate requires no auth:** GET /invites/{token}/validate has no RequireAuthorization so that link recipients who aren't logged in can still validate. The SvelteKit SSR load performs server-to-server validation.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

All 8 created files exist and both commits are present.
