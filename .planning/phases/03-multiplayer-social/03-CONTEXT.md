# Phase 3: Multiplayer + Social - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Two or more players on different devices play Azul in real time, find each other through the lobby, manage friends, and install as a PWA. The platform goes from single-browser hot-seat to networked multiplayer with social features. Real-time play uses AppSync Events WebSocket. Async play, notifications, and timers are Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Lobby & table creation
- Table list as the default game-finding experience, with a "Quick Play" button that auto-joins the first available table or creates one
- Table creation settings: game selection, player count, public/private toggle, optional password, optional table display name, and game-specific configuration (variants/optional rules — game definitions must declare available options)
- Waiting room: simple player list (avatar + name), chat area, and "Start" button for host when enough players join
- Lobby list refreshes via polling (not real-time) — save WebSocket infra for gameplay

### Player profiles & identity
- Preset avatar system — curated set of icons players pick from (no uploads, no generation)
- Profile shows: username, avatar, member since, total games played, win rate, and scrollable match history (opponents, results, dates)
- Profiles are public by default with a privacy toggle to restrict visibility
- Usernames are unique and changeable (with appropriate cooldown/limits)

### Social connections
- Find friends via username search and post-game prompts (offer to add opponents after a game ends)
- Friend requests are mutual — both sides must accept
- Game invites work two ways: in-app notification for online friends, shareable link for external sharing (Discord, text, etc.)
- Online/offline presence indicator (simple green dot) on friends

### In-game communication
- Freeform text chat (no quick-chat presets)
- Chat is ephemeral — gone when the game ends, not persisted with match history
- Moderation: basic word filter plus player report/block functionality
- Chat is active in both the waiting room and during gameplay

### Claude's Discretion
- Quick Play matching algorithm (first available vs. best fit)
- Exact polling interval for lobby refresh
- Avatar preset art style and count
- Username change cooldown/limit policy
- Word filter implementation approach
- PWA manifest, service worker, and install prompt behavior
- AppSync Events channel design and event schema
- Reconnection UX details
- Idempotent move protocol implementation (client UUID generation)

</decisions>

<specifics>
## Specific Ideas

- Game definitions should declare their available configuration options (variants, optional rules) so the table creation form can render game-specific settings dynamically
- Post-game screen is a natural social touchpoint — use it for friend requests
- Shareable invite links should work for people not yet on the platform (join → create account → land in the table)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gameApi.ts`: Client API layer with fetch-based calls — will need WebSocket companion for real-time gameplay
- `GameSession` entity: JSONB state + optimistic concurrency via xmin — foundation for multiplayer state management
- `GameEndpoints.cs`: REST endpoints for game CRUD + move validation — lobby/social endpoints follow same minimal API pattern
- `DevMenu.svelte`: Only existing Svelte component — patterns for new UI components

### Established Patterns
- C# minimal API with extension method endpoint registration (`MapGameEndpoints` pattern)
- EF Core with PostgreSQL + JSONB for flexible state storage
- SvelteKit file-based routing (`/game/[id]`, `/games`)
- Server-authoritative validation — client never enforces rules
- `HookExecutor` runs game logic server-side via Jint (JavaScript in C#)

### Integration Points
- New routes needed: `/lobby`, `/profile/[username]`, `/friends`
- New DB entities needed: User, Profile, Friendship, Table/Lobby, ChatMessage
- Auth middleware needed — currently no authentication at all (players are just name strings)
- AppSync Events WebSocket layer sits alongside existing REST API
- PWA manifest + service worker added to SvelteKit static/config

</code_context>

<deferred>
## Deferred Ideas

- Player profile credits for contributed games — depends on Phase 5 (AI Game Creation Toolkit)

</deferred>

---

*Phase: 03-multiplayer-social*
*Context gathered: 2026-03-01*
