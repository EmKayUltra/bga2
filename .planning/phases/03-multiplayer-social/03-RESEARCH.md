# Phase 3: Multiplayer + Social - Research

**Researched:** 2026-03-01
**Domain:** Real-time WebSocket multiplayer, authentication, social graph, PWA
**Confidence:** MEDIUM-HIGH (core stack verified; LocalStack limitation is a critical blocker finding)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Lobby & table creation:**
- Table list as the default game-finding experience, with a "Quick Play" button that auto-joins the first available table or creates one
- Table creation settings: game selection, player count, public/private toggle, optional password, optional table display name, and game-specific configuration (variants/optional rules — game definitions must declare available options)
- Waiting room: simple player list (avatar + name), chat area, and "Start" button for host when enough players join
- Lobby list refreshes via polling (not real-time) — save WebSocket infra for gameplay

**Player profiles & identity:**
- Preset avatar system — curated set of icons players pick from (no uploads, no generation)
- Profile shows: username, avatar, member since, total games played, win rate, and scrollable match history (opponents, results, dates)
- Profiles are public by default with a privacy toggle to restrict visibility
- Usernames are unique and changeable (with appropriate cooldown/limits)

**Social connections:**
- Find friends via username search and post-game prompts (offer to add opponents after a game ends)
- Friend requests are mutual — both sides must accept
- Game invites work two ways: in-app notification for online friends, shareable link for external sharing (Discord, text, etc.)
- Online/offline presence indicator (simple green dot) on friends

**In-game communication:**
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

### Deferred Ideas (OUT OF SCOPE)
- Player profile credits for contributed games — depends on Phase 5 (AI Game Creation Toolkit)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MULT-01 | Real-time synchronous play via AppSync Events WebSocket | AppSync Events protocol, aws-amplify client, C# HTTP publish pattern |
| MULT-03 | Lobby with open and invite-only table creation | DB schema (GameTable entity), polling pattern, invite link flow |
| MULT-04 | Reconnection re-fetches server state before enabling interaction | Client state machine: disconnected → reconnecting → fetching → ready |
| MULT-05 | Idempotent move protocol with client-generated UUIDs | MoveRequest UUID field, server deduplication via played_move_ids or DB unique constraint |
| MULT-06 | Optimistic locking with state versioning prevents concurrent update corruption | Already in place via xmin + Version field in GameSession — needs validation at move endpoint |
| SOCL-01 | User can create profile with username and avatar | Better Auth username plugin + User/Profile entity, avatar enum stored in DB |
| SOCL-02 | User can view match history with results, opponents, dates | MatchResult entity linked to GameSession + User, API endpoint + profile page |
| SOCL-03 | User can add/remove friends | Friendship entity (bidirectional, status: pending/accepted), REST endpoints |
| SOCL-04 | User can invite friends to a game | In-app: AppSync Events notification channel; external: signed invite token in URL |
| SOCL-05 | User can create private invite-only tables | GameTable.IsPrivate + optional password, invite-only join validation |
| SOCL-06 | User can send text chat messages during and after games | Ephemeral: AppSync Events chat channel, no DB persistence; word filter on C# publish side |
| PLAT-02 | PWA installable from browser with service worker | @vite-pwa/sveltekit plugin, web manifest, standalone display mode |
</phase_requirements>

---

## Summary

Phase 3 is the largest phase in the roadmap, spanning four distinct technical areas: (1) authentication, (2) real-time WebSocket gameplay via AppSync Events, (3) social graph and lobby system, and (4) PWA installation. Each area can be built largely independently, making wave-based parallelization feasible.

The most important architectural finding is a **critical gap in local development infrastructure**: AppSync Events is supported in LocalStack only at the **Ultimate tier** (paid), not in the community edition currently in the Docker Compose stack. This means development against AppSync Events requires either a real AWS dev account, a LocalStack Pro/Ultimate subscription, or a lightweight custom mock WebSocket server that speaks the AppSync Events protocol. The recommended path is to use a real dev AWS account for the AppSync Events API during development (it is cheap at this scale) and run integration against that, while keeping all other services on LocalStack.

The authentication strategy is well-proven: Better Auth runs in the SvelteKit Node.js process, owns auth state (users, sessions) in the shared PostgreSQL database, and issues JWTs via its JWT plugin. The C# API validates those JWTs via Microsoft.AspNetCore.Authentication.JwtBearer using the JWKS endpoint Better Auth exposes. This avoids duplicating auth logic across the two runtimes.

**Primary recommendation:** Implement in this wave order: (A) Auth + DB schema migration, (B) Lobby + polling + table CRUD, (C) AppSync Events real-time gameplay layer, (D) Social graph + profiles, (E) Chat + moderation, (F) PWA.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | latest (~1.x) | Email/password auth, session management, JWKS | Official SvelteKit integration, username plugin, PostgreSQL pg adapter — replaces hand-rolled auth |
| better-auth/plugins: username | (bundled) | Username field on user table, sign-in by username | First-class plugin, no custom DB code |
| better-auth/plugins: jwt | (bundled) | JWT issuance + JWKS endpoint for C# to validate | Eliminates cross-runtime session coupling |
| Microsoft.AspNetCore.Authentication.JwtBearer | 8.x | JWT Bearer validation on C# API | Standard ASP.NET Core middleware, validates Better Auth JWTs |
| aws-amplify | 6.x (latest ~6.16) | AppSync Events WebSocket client (connect/subscribe/publish) | Official AWS client; `events` export from `aws-amplify/data` |
| @vite-pwa/sveltekit | 1.x (latest ~1.1) | PWA manifest injection, service worker generation | Zero-config for SvelteKit, Workbox-backed, official integration |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg | 8.x | PostgreSQL pool for Better Auth | Better Auth's pg adapter requires `Pool` from `pg` |
| @better-auth/cli | latest | Schema generation and migration for auth tables | Run `npx @better-auth/cli@latest migrate` after config changes |
| leo-profanity | latest | Chat word filter | TypeScript types included, lightweight, customizable dictionary |
| crypto.randomUUID() | native | Client-generated move UUIDs for idempotency | Built into browser and Node.js 16+, no dep needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-auth | Lucia Auth | Lucia is unmaintained as of late 2024; better-auth is the community successor |
| better-auth | Auth.js (NextAuth) | Auth.js SvelteKit adapter works but has fewer built-in features and more ceremony |
| better-auth | Hand-rolled JWT auth in C# | Would duplicate the SvelteKit session layer; two sources of truth |
| aws-amplify events | Hand-rolled WebSocket protocol | Amplify abstracts the AppSync subprotocol, auth header encoding — save 3 days |
| @vite-pwa/sveltekit | Manual service worker | vite-pwa handles precaching, manifest injection, update prompts automatically |
| leo-profanity | bad-words | bad-words is unmaintained; leo-profanity is actively maintained with TypeScript |

**Installation (client container):**
```bash
npm install aws-amplify better-auth pg
npm install -D @vite-pwa/sveltekit
npm install leo-profanity
```

**Installation (server — NuGet):**
```xml
<PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.*" />
```

**Better Auth schema migration (run once in client container):**
```bash
npx @better-auth/cli@latest migrate
```

---

## Architecture Patterns

### Recommended Project Structure Additions

```
apps/
├── client/src/
│   ├── lib/
│   │   ├── auth.ts              # Better Auth instance (server-only)
│   │   ├── auth-client.ts       # Better Auth client (browser)
│   │   ├── appsync.ts           # Amplify configure + events helper
│   │   └── api/                 # Existing gameApi.ts + new endpoints
│   │       ├── gameApi.ts       # (exists) REST game API
│   │       ├── lobbyApi.ts      # Table CRUD, lobby list
│   │       ├── socialApi.ts     # Friends, profiles, match history
│   │       └── inviteApi.ts     # Shareable invite token create/redeem
│   └── routes/
│       ├── lobby/               # /lobby — table list + quick play
│       │   ├── +page.svelte
│       │   └── +page.server.ts
│       ├── table/[id]/          # /table/[id] — waiting room
│       │   ├── +page.svelte
│       │   └── +page.server.ts
│       ├── profile/[username]/  # /profile/[username] — user profile
│       │   ├── +page.svelte
│       │   └── +page.server.ts
│       ├── friends/             # /friends — friend list + requests
│       │   ├── +page.svelte
│       │   └── +page.server.ts
│       ├── auth/                # /auth/login, /auth/register
│       │   └── ...
│       └── invite/[token]/      # /invite/[token] — deep link join
│           └── +page.server.ts  # Validate token → redirect to table
└── server/
    ├── Endpoints/
    │   ├── GameEndpoints.cs     # (exists)
    │   ├── DevEndpoints.cs      # (exists)
    │   ├── LobbyEndpoints.cs    # Table CRUD, lobby list
    │   ├── SocialEndpoints.cs   # Friends, profiles, match history
    │   └── AuthEndpoints.cs     # (optional) User-context helpers
    ├── Data/
    │   ├── GameDbContext.cs     # (exists, extend with new DbSets)
    │   ├── GameSession.cs       # (exists)
    │   ├── User.cs              # Auth user reference (userId = Better Auth user id)
    │   ├── Profile.cs           # Extended profile (avatar, privacy toggle)
    │   ├── GameTable.cs         # Lobby table entity
    │   ├── TablePlayer.cs       # Player slots within a table
    │   ├── Friendship.cs        # Friend request + status
    │   └── MatchResult.cs       # Completed game result record
    └── Services/
        ├── GameService.cs       # (exists)
        ├── AppSyncPublisher.cs  # HTTP publish to AppSync Events API
        └── ChatFilter.cs        # Server-side word filter (P/Invoke or ported list)
```

### Pattern 1: Better Auth + C# JWT Validation

Better Auth lives in the SvelteKit Node process, manages sessions and cookie-based auth, and exposes a JWKS endpoint. The C# API validates JWTs from the `Authorization: Bearer <token>` header using the JWKS public key fetched from Better Auth.

**SvelteKit: `lib/auth.ts`**
```typescript
// Source: https://www.better-auth.com/docs/integrations/svelte-kit
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { username } from "better-auth/plugins";
import { jwt } from "better-auth/plugins";

export const auth = betterAuth({
  database: new Pool({
    connectionString: "postgres://bga2:secret@db:5432/bga2",
  }),
  emailAndPassword: { enabled: true },
  plugins: [
    username(),   // adds username field + sign-in-by-username
    jwt(),        // adds GET /api/auth/token and GET /api/auth/jwks
  ],
});
```

**SvelteKit: `hooks.server.ts`**
```typescript
// Source: https://www.better-auth.com/docs/integrations/svelte-kit
import { auth } from "$lib/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";

export async function handle({ event, resolve }) {
  // Populate locals.user for use in load functions
  const session = await auth.api.getSession({
    headers: event.request.headers,
  });
  if (session) {
    event.locals.user = session.user;
    event.locals.session = session.session;
  }
  return svelteKitHandler({ event, resolve, auth, building });
}
```

**C# `Program.cs` — JWT validation:**
```csharp
// Source: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Better Auth JWKS endpoint — C# fetches and caches the public key
        options.MetadataAddress = "http://client:5173/api/auth/.well-known/openid-configuration";
        // OR, for direct JWKS:
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = "http://client:5173",
            ValidAudience = "bga2",
        };
        // Fetch JWKS automatically via ConfigurationManager
    });

// Require auth on game routes
app.MapPost("/games/{sessionId:guid}/move", ValidateAndApplyMove)
    .RequireAuthorization();
```

**Key insight:** Better Auth's JWT plugin exposes `GET /api/auth/token` to get a short-lived JWT from a browser session cookie. The client calls this before making game API requests, then attaches `Authorization: Bearer <token>` to C# API calls.

### Pattern 2: AppSync Events Channel Design

**Channel namespace:** `/game`
**Channel paths:**
```
/game/{sessionId}/state     — game state updates (subscribe: both players; publish: C# server only)
/game/{sessionId}/chat      — in-game chat (subscribe: both players; publish: any authenticated player)
/user/{userId}/invites      — invite notifications (subscribe: one user; publish: C# server)
```

**Channel design rules:**
- UUIDs are 36 chars; namespace prefix `/game/` is 6 chars; total = 42 chars < 50 char limit per segment
- C# server publishes state updates via HTTP POST to AppSync Events endpoint after move validation
- Clients subscribe via Amplify `events.connect()`; publish chat messages via Amplify `events.post()`
- Auth mode: API key (client subscribes with key; C# server publishes with key)

**SvelteKit: `lib/appsync.ts`**
```typescript
// Source: https://docs.amplify.aws/react/build-a-backend/data/connect-event-api/
import { Amplify } from "aws-amplify";
import { events } from "aws-amplify/data";

Amplify.configure({
  API: {
    Events: {
      endpoint: import.meta.env.VITE_APPSYNC_HTTP_ENDPOINT,
      region: "us-east-1",
      defaultAuthMode: "apiKey",
      apiKey: import.meta.env.VITE_APPSYNC_API_KEY,
    }
  }
});

export async function subscribeToGame(
  sessionId: string,
  onStateUpdate: (data: unknown) => void,
  onChat: (data: unknown) => void
) {
  const stateChannel = await events.connect(`/game/${sessionId}/state`);
  stateChannel.subscribe({ next: onStateUpdate, error: console.error });

  const chatChannel = await events.connect(`/game/${sessionId}/chat`);
  chatChannel.subscribe({ next: onChat, error: console.error });

  return () => { stateChannel.close(); chatChannel.close(); };
}
```

**C# `Services/AppSyncPublisher.cs`**
```csharp
// Source: https://docs.aws.amazon.com/appsync/latest/eventapi/publish-http.html
public class AppSyncPublisher(IHttpClientFactory factory, IConfiguration config)
{
    public async Task PublishGameState(Guid sessionId, string stateJson)
    {
        var client = factory.CreateClient();
        var endpoint = config["AppSync:HttpEndpoint"];
        var apiKey   = config["AppSync:ApiKey"];

        var body = JsonSerializer.Serialize(new {
            channel = $"/game/{sessionId}/state",
            events  = new[] { stateJson }     // already a JSON string
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/event");
        request.Headers.Add("x-api-key", apiKey);
        request.Content = new StringContent(body, Encoding.UTF8, "application/json");

        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
    }
}
```

### Pattern 3: Idempotent Move Protocol (MULT-05)

Client generates a UUID per move attempt. Server stores `PlayedMoveIds` (or a DB unique index on `(session_id, move_id)`) and returns the cached result on duplicate. This prevents double-processing on network retry.

**Client:**
```typescript
const moveId = crypto.randomUUID();  // native browser API, no dep
await api.submitMove(sessionId, { ...move, moveId });
```

**Server MoveRequest model addition:**
```csharp
public record MoveRequest(
    string PlayerId,
    string Action,
    string? MoveId = null,    // client-generated UUID for idempotency
    string? Source = null,
    string? Target = null,
    string? PieceId = null,
    Dictionary<string, object>? Data = null
);
```

**Server deduplication — simplest approach:**
Add a `PlayedMoveIds` JSONB array to `GameSession` (already JSONB state). Before processing a move, check if `MoveId` appears in the session's `playedMoveIds`. If yes, return the cached response. If no, process and append.

### Pattern 4: Reconnection Flow (MULT-04)

```
1. Client opens game page → connects AppSync channel
2. AppSync connect fails or client was offline
3. onError / onOffline handler fires → set UI state = "reconnecting"
4. Client calls GET /games/{sessionId}/state → server returns current state
5. Re-initialize board from fetched state
6. Re-subscribe AppSync channel
7. UI state = "ready" → enable move controls
```

Do NOT enable move controls until step 7. Disable all interactive elements during steps 2-6.

### Pattern 5: Lobby Polling

Lobby list polls every 5 seconds using `setInterval` + `fetch`. This is explicitly the decided approach (WebSocket save for gameplay).

```typescript
// +page.svelte (lobby)
import { onMount, onDestroy } from "svelte";

let tables = $state([]);
let pollInterval: ReturnType<typeof setInterval>;

onMount(() => {
  fetchTables();
  pollInterval = setInterval(fetchTables, 5000);
});

onDestroy(() => clearInterval(pollInterval));

async function fetchTables() {
  const res = await fetch("/api/tables");
  tables = await res.json();
}
```

### Pattern 6: PWA Setup (@vite-pwa/sveltekit)

```typescript
// vite.config.ts
import { SvelteKitPWA } from "@vite-pwa/sveltekit";

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: "autoUpdate",
      manifest: {
        name: "BGA2 — Board Games Online",
        short_name: "BGA2",
        description: "Play board games online with friends",
        theme_color: "#1a1a2e",
        display: "standalone",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      }
    })
  ]
});
```

```javascript
// svelte.config.js — disable manual service worker registration
export default {
  kit: {
    serviceWorker: { register: false }
  }
};
```

```svelte
<!-- +layout.svelte — inject web manifest link -->
<script>
  import { pwaInfo } from "virtual:pwa-info";
  $: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : "";
</script>
<svelte:head>
  {@html webManifestLink}
</svelte:head>
```

### Pattern 7: Shareable Invite Links

Server generates a signed token (HMACSHA256 over `tableId:expiresAt`) stored in the URL as `/invite/{token}`. The `+page.server.ts` at `/invite/[token]` validates the token, then:

- If user is authenticated → redirect to `/table/[id]`
- If user is not authenticated → store token in session → redirect to `/auth/register?next=/invite/${token}` → after registration, redeem token → join table

### Anti-Patterns to Avoid

- **Storing AppSync API key in VITE_ env as a secret:** The API key controls subscription auth mode. Use `API_KEY` auth for subscribe/publish. Never expose IAM credentials to the client. The API key IS meant to be client-visible (access control is enforced in AppSync channel namespace handlers).
- **Publishing game state from the client via AppSync:** Only the C# server publishes state updates to `/game/{id}/state`. Clients can publish chat to `/game/{id}/chat` but never game state.
- **Blocking move input until WebSocket ACK:** Use optimistic UI — apply the move locally, send it to REST, on success the REST response contains new state + AppSync fires to the opponent. Never rely on AppSync delivery to gate the UI for the active player.
- **Running `db.Database.EnsureCreated()` alongside Better Auth tables:** Better Auth runs its own migrations via `@better-auth/cli migrate`. The C# `EnsureCreated()` call only creates tables in its `DbContext`. These two migration systems must not conflict — Better Auth tables (user, session, account, verification) are managed exclusively by Better Auth CLI; C# EF Core manages GameSession, GameTable, etc.
- **Using LocalStack community edition for AppSync Events:** AppSync Events requires LocalStack **Ultimate tier**. The current `localstack/localstack:latest` community image does NOT support it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management + signup/login | Custom session table, bcrypt, cookie logic | better-auth | Handles CSRF, rotation, secure cookies, device sessions — dozens of edge cases |
| JWT issuance + JWKS | Custom RSA keygen + JWKS server | better-auth jwt plugin | Gets crypto right; exposes standard OIDC-compatible JWKS endpoint |
| Service worker + cache manifest | Custom Workbox config + manifest.json | @vite-pwa/sveltekit | Precaching, update strategy, hash invalidation — complex to get right |
| WebSocket connection management | Raw WebSocket with reconnect logic | aws-amplify events | Auth header encoding, keep-alive, exponential backoff, multiple subs on one connection |
| Profanity detection | Custom regex wordlist | leo-profanity | Leet-speak variants, Unicode normalization, maintained word lists |
| Signed invite tokens | JWT for invites | HMACSHA256 token (built-in) | JWTs for invites are over-engineered; signed URL tokens are simpler and sufficient |

**Key insight:** Authentication and WebSocket management are each independently complex enough to consume an entire phase. Using well-integrated libraries brings both down to configuration tasks.

---

## Common Pitfalls

### Pitfall 1: LocalStack Does Not Support AppSync Events (Community Edition)
**What goes wrong:** Developer runs `docker compose up`, tries to provision AppSync Events, gets `UnsupportedOperation` or feature not found.
**Why it happens:** AppSync Events was added to LocalStack in 4.7 but is an **Ultimate tier** (paid) feature. The current Docker Compose uses `localstack/localstack:latest` (community).
**How to avoid:** Use a real AWS dev account for AppSync Events during development. Create the `EventApi` via CDK/CLI in a `dev` AWS account and put the HTTP endpoint + API key in `.env.local`. The cost at dev scale (< 250k operations/month free tier) is zero.
**Warning signs:** `ServiceNotAvailableError` or 404 on `/_localstack/health` for `appsync`.

### Pitfall 2: Better Auth Tables and EF Core `EnsureCreated()` Conflict
**What goes wrong:** `EnsureCreated()` in C# runs on startup. Better Auth's pg adapter expects the `user` / `session` / `account` tables to exist with specific schema. If C# creates a conflicting `user` table, Better Auth breaks.
**Why it happens:** Both systems need tables in the same PostgreSQL database.
**How to avoid:** Keep Better Auth tables in the `public` schema managed by `@better-auth/cli migrate` only. C# `DbContext` must NOT include `User`/`Session` entities. C# references user identity only by `userId` string (foreign key to Better Auth's `user.id`). Replace `EnsureCreated()` with EF Core migrations before production.
**Warning signs:** `column "email" of relation "user" does not exist` or unique constraint violations at startup.

### Pitfall 3: AppSync API Key in Environment — CORS and SSR
**What goes wrong:** `VITE_APPSYNC_API_KEY` is exposed in client bundle. On SSR, `Amplify.configure()` runs server-side and may fail because AppSync WebSocket uses browser WebSocket API.
**Why it happens:** Amplify's `events.connect()` uses `WebSocket` from the browser global. Node.js < 22 does not have native `WebSocket`.
**How to avoid:** Call `Amplify.configure()` and `events.connect()` only inside `onMount()` (browser-only). Guard with `if (browser) { ... }` from `$app/environment`. The API key exposure is acceptable for subscriber auth — AppSync access control is enforced at channel namespace level. Node.js 20 (the current container version) lacks native WebSocket; if Amplify needs it server-side, polyfill with `ws` package: `globalThis.WebSocket = WebSocket` from `ws`. But the simplest fix is browser-only.
**Warning signs:** `WebSocket is not defined` in server console; Amplify calls in `+page.server.ts` instead of `+page.svelte`.

### Pitfall 4: Optimistic Locking — DbUpdateConcurrencyException Not Handled
**What goes wrong:** Two moves race; second writer gets `DbUpdateConcurrencyException`. Without a catch + retry, the C# API returns 500.
**Why it happens:** `xmin` concurrency token is already configured (`UseXminAsConcurrencyToken()`). It works but the exception must be caught.
**How to avoid:** Wrap `SaveChanges` in a `try/catch(DbUpdateConcurrencyException)`. Return HTTP 409 Conflict with a message asking the client to re-fetch state and retry. Client should re-subscribe to AppSync to get the current state before re-issuing move.
**Warning signs:** 500 errors under parallel move load in tests.

### Pitfall 5: Channel Path Length Limit
**What goes wrong:** AppSync Events channel path validation rejects paths > 50 chars per segment (with 1-5 total segments).
**Why it happens:** A GUID is 36 chars. `/game/` prefix = 6 chars. Total for the first segment after `/game` = 36. This fits. But if the namespace is part of the segment, check the regex: `^/?[A-Za-z0-9](?:[A-Za-z0-9-]{0,48}...`. Each segment max is ~50 chars.
**How to avoid:** Use `/game` as the namespace and `{sessionId}` as the channel: path = `/game/{36-char-uuid}`. Total = 43 chars. This fits the constraint.
**Warning signs:** `ValidationException: Invalid channel path` from AppSync.

### Pitfall 6: Better Auth JWKS URL — Container vs Browser
**What goes wrong:** C# server tries to fetch JWKS from `http://localhost:5173/api/auth/jwks` — fails because in Docker, `localhost` in the server container does not resolve to the client container.
**Why it happens:** Containers use Docker bridge network; service names are the hostnames.
**How to avoid:** Configure C# JWT validation with `MetadataAddress = "http://client:5173/api/auth/.well-known/openid-configuration"` (uses Docker service name `client`). Add this to server environment variables in `docker-compose.yml`.
**Warning signs:** `IDX20803: Unable to obtain configuration` exception at C# startup or on first auth-protected request.

---

## Code Examples

### Auth: Better Auth client for login/register
```typescript
// Source: https://www.better-auth.com/docs/integrations/svelte-kit
// lib/auth-client.ts
import { createAuthClient } from "better-auth/svelte";
import { usernameClient } from "better-auth/plugins/username";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

// Usage in +page.svelte:
// await authClient.signUp.email({ email, password, name, username })
// await authClient.signIn.username({ username, password })
```

### Auth: Get JWT for C# API calls
```typescript
// Fetch short-lived JWT from Better Auth JWT plugin
async function getApiToken(): Promise<string> {
  const res = await fetch("/api/auth/token");
  const { token } = await res.json();
  return token;
}

// Attach to C# API call
const token = await getApiToken();
const res = await fetch(`http://server:8080/games/${id}/move`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify(move),
});
```

### AppSync Events: Subscribe + disconnect on unmount
```typescript
// Source: https://docs.amplify.aws/react/build-a-backend/data/connect-event-api/
import { onMount, onDestroy } from "svelte";
import { browser } from "$app/environment";
import { events } from "aws-amplify/data";

let cleanup: (() => void) | undefined;

onMount(async () => {
  if (!browser) return;
  const channel = await events.connect(`/game/${sessionId}/state`);
  channel.subscribe({
    next: (data) => applyServerState(data),
    error: (err) => handleReconnect(err),
  });
  cleanup = () => channel.close();
});

onDestroy(() => cleanup?.());
```

### C# AppSync Publish (after move validated)
```csharp
// Source: https://docs.aws.amazon.com/appsync/latest/eventapi/publish-http.html
// Inject AppSyncPublisher via DI; call after GameService.ValidateAndApplyMove succeeds
await appSyncPublisher.PublishGameState(sessionId, result.NewState!);
```

### Idempotent Move: client UUID generation
```typescript
// No import needed — crypto.randomUUID() is native in all modern browsers
async function submitMove(sessionId: string, move: Move) {
  const moveId = crypto.randomUUID();
  return await api.post(`/games/${sessionId}/move`, { ...move, moveId });
}
```

### DB Schema: GameTable entity (C# EF Core)
```csharp
public class GameTable
{
    public Guid Id { get; set; }
    public string GameId { get; set; } = "azul";       // references game definition
    public string HostUserId { get; set; } = "";        // Better Auth user.id (string)
    public string DisplayName { get; set; } = "";
    public int MaxPlayers { get; set; } = 2;
    public bool IsPrivate { get; set; }
    public string? PasswordHash { get; set; }           // bcrypt, null if public
    public TableStatus Status { get; set; } = TableStatus.Waiting;
    public Guid? SessionId { get; set; }                // set when game starts
    public DateTime CreatedAt { get; set; }
}

public enum TableStatus { Waiting, Playing, Finished }
```

### DB Schema: Friendship entity
```csharp
public class Friendship
{
    public Guid Id { get; set; }
    public string RequesterId { get; set; } = "";      // Better Auth user.id
    public string AddresseeId { get; set; } = "";      // Better Auth user.id
    public FriendshipStatus Status { get; set; } = FriendshipStatus.Pending;
    public DateTime CreatedAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
}

public enum FriendshipStatus { Pending, Accepted, Blocked }
```

### DB Schema: MatchResult entity
```csharp
public class MatchResult
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }                // FK to GameSession
    public string UserId { get; set; } = "";           // Better Auth user.id
    public bool Won { get; set; }
    public int Score { get; set; }
    public int Rank { get; set; }
    public DateTime CompletedAt { get; set; }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lucia Auth | better-auth | Late 2024 — Lucia announced it's no longer maintained | better-auth is the community-adopted successor with same philosophy |
| Amplify v5 separate categories (API, Auth, etc.) | Amplify v6 unified `aws-amplify` package with subpath exports | 2023-2024 | `import { events } from "aws-amplify/data"` — one package |
| AppSync GraphQL subscriptions | AppSync Events (pub/sub without GraphQL schema) | Oct 2024 announcement, Mar 2025 WebSocket publish added | No GraphQL schema required for real-time — simpler for game state |
| LocalStack AppSync (GraphQL only) | LocalStack 4.7 AppSync Events (Ultimate tier only) | Released ~mid-2025 | Community edition still does NOT support Events — use real AWS for dev |
| AppSync CDK L1 constructs (CfnEventApi) | AppSync CDK L2 `EventApi` construct | Feb 2025 | `new appsync.EventApi(...)` — fully typed, 50% less code |

**Deprecated/outdated:**
- `@aws-amplify/pubsub` (v5 pattern): Replaced by `events` from `aws-amplify/data` in v6.
- Lucia Auth: Maintainer announced stepping back late 2024; community migrated to better-auth.
- `vite-plugin-pwa` direct SvelteKit usage without `@vite-pwa/sveltekit`: Works but requires manual glob config; wrapper handles it automatically.
- `db.Database.EnsureCreated()` for production: Already noted as prototype-only in the codebase — Phase 3 is the right time to migrate to proper EF Core migrations.

---

## Open Questions

1. **AppSync Events local dev without LocalStack Ultimate**
   - What we know: LocalStack community edition does NOT support AppSync Events (Ultimate tier required). The free tier on real AWS is 250k operations/month.
   - What's unclear: Is the developer willing to use a real AWS dev account for AppSync, or is there budget for LocalStack Ultimate? Could a minimal mock WebSocket server be written to speak enough of the AppSync protocol for local dev?
   - Recommendation: **Decision needed before planning.** Default plan assumes real AWS dev account for AppSync Events during development. If that's unacceptable, plan for a thin WebSocket mock server in the `infra/` service.

2. **EF Core Migrations vs. EnsureCreated**
   - What we know: `EnsureCreated()` is in `Program.cs` and is noted as "prototype only." Better Auth manages its own tables separately.
   - What's unclear: Should Phase 3 introduce proper EF Core migrations for the C# tables (GameSession + new Phase 3 entities)? Or continue with `EnsureCreated()` for now?
   - Recommendation: Switch to `dotnet ef migrations` in Phase 3 Wave 0 to enable safe iterative schema changes. The `@better-auth/cli migrate` handles its own tables separately.

3. **Online/offline presence: polling vs. real-time**
   - What we know: Context.md says "simple green dot" on friends. AppSync Events is reserved for gameplay, not lobby. Context.md says lobby uses polling.
   - What's unclear: Does the green dot on friends update in real-time or every N seconds via polling? Real-time presence requires a second AppSync subscription per friend or a roster-style channel.
   - Recommendation: Polling-based presence (refresh friend list on tab focus + every 30s). Keep WebSocket budget for gameplay only. True real-time presence is Phase 4 material.

4. **Chat moderation: client-side or server-side filter?**
   - What we know: Word filter is in Claude's Discretion. Leo-profanity is a client-side npm library.
   - What's unclear: Should the filter run on the client before sending or on the C# server before publishing to AppSync?
   - Recommendation: Server-side in C# `ChatFilter` service. Client-side-only is trivially bypassed. Port a minimal wordlist to C# or use the `leo-profanity` JS wordlist via Jint (already in the C# project).

5. **Better Auth JWT plugin token lifetime and refresh strategy**
   - What we know: Better Auth JWT plugin issues short-lived JWTs. The lifetime is configurable.
   - What's unclear: What should the JWT lifetime be? If a game session lasts 30 minutes, the JWT must not expire mid-game.
   - Recommendation: Set JWT lifetime to 1 hour in the plugin config. Client refreshes by calling `/api/auth/token` before each C# API request (token is cheap, no DB query). Alternatively, configure the token lifetime to match the session timeout.

---

## Sources

### Primary (HIGH confidence)
- AWS AppSync Events official docs — WebSocket protocol, publish-http, channel concepts: https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-websocket-protocol.html
- AWS CDK v2 docs — `EventApi` L2 construct: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_appsync-readme.html
- Better Auth official docs — SvelteKit integration, username plugin, JWT plugin: https://www.better-auth.com/docs/integrations/svelte-kit
- Better Auth PostgreSQL adapter: https://www.better-auth.com/docs/adapters/postgresql
- AWS Amplify docs — Connect to AppSync Events (framework-agnostic): https://docs.aws.amazon.com/appsync/latest/eventapi/build-amplify-app.html
- @vite-pwa/sveltekit official docs: https://vite-pwa-org.netlify.app/frameworks/sveltekit
- SvelteKit auth official docs: https://svelte.dev/docs/kit/auth
- LocalStack AppSync docs (tier verification): https://docs.localstack.cloud/aws/services/appsync/
- ASP.NET Core JWT Bearer middleware: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication

### Secondary (MEDIUM confidence)
- AppSync Events CDK L2 announcement (Feb 2025): https://aws.amazon.com/about-aws/whats-new/2025/02/aws-appsync-cdk-l2-simplify-websocket-apis/
- AppSync Events WebSocket publishing announcement (Mar 2025): https://aws.amazon.com/about-aws/whats-new/2025/03/appsync-events-publishing-websocket-real-time-pub-sub/
- LocalStack 4.7 release — AppSync Events addition: https://blog.localstack.cloud/localstack-for-aws-release-v-4-7-0/
- Better Auth username plugin docs: https://better-auth.com/docs/plugins/username
- Better Auth JWT plugin docs: https://www.better-auth.com/docs/plugins/jwt

### Tertiary (LOW confidence — needs validation)
- LocalStack Ultimate tier requirement for AppSync Events: verified via https://docs.localstack.cloud/aws/services/appsync/ (page header: "Included in Plans: Ultimate") — HIGH confidence actually
- leo-profanity as best npm profanity filter: community assessment, not official benchmark — LOW
- 5-second lobby polling interval: Claude's discretion; no authoritative source — recommendation only

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — better-auth, aws-amplify, @vite-pwa/sveltekit all verified against official docs
- Architecture: MEDIUM-HIGH — patterns derived from official docs; JWT integration between better-auth and C# is verified conceptually but not tested in this specific combination
- Pitfalls: HIGH — LocalStack limitation is verified from official source; Docker network pitfall is well-known EF Core pattern; others are derived from official docs
- AppSync Events local dev: HIGH confidence that it is blocked on LocalStack community; requires decision before planning

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days — stable APIs; re-check if LocalStack releases community AppSync Events support)
