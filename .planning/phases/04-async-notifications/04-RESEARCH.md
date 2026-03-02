# Phase 4: Async + Notifications - Research

**Researched:** 2026-03-02
**Domain:** Async turn-based gaming, background job scheduling, transactional email, Web Push PWA notifications
**Confidence:** HIGH (core stack verified), MEDIUM (iOS Web Push limitations), LOW (exact Hangfire cron for deadline escalation)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Turn timers & deadlines**
- 3 timer presets: Fast (12h/turn), Normal (24h/turn), Slow (72h/turn)
- Timeout behavior: skip + stack penalty with configurable threshold (host sets at table creation, default 3 consecutive skips = forfeit, setting 0 disables auto-forfeit)
- Mutual pause: either player can request a pause, other player must accept; timer freezes until resumed
- Timer display: compact countdown next to current player's name in the existing toolbar; color shifts green → yellow → red as deadline approaches

**Notification channels & triggers**
- All three channels supported: email, Web Push, in-app badge/indicator
- Single configurable reminder before deadline (player chooses how far in advance)
- "Your turn" notification fires immediately when opponent submits their move
- Transactional email via Resend

**Player preferences UI**
- Notification preferences added as a new section on the existing /settings page (alongside avatar, username, privacy)
- Global preferences only — no per-game overrides in v1
- No quiet hours in v1 — players use device Do Not Disturb
- Push notification opt-in: auto-prompt the browser permission dialog on first async game start

**Async lobby experience**
- Unified lobby with filter/toggle for "Real-time" vs "Async" — icon or badge distinguishes game type
- Table creation: explicit "Game mode: Real-time / Async" toggle; selecting Async reveals timer preset picker (Fast/Normal/Slow) and skip threshold setting
- Quick Play stays real-time only — async games are intentional (create a table, set timer)
- Dedicated "My Games" section showing all active async games with turn status, timer remaining, and opponent

### Claude's Discretion
- Background job framework choice (Quartz vs Hangfire vs IHostedService)
- Email template design and content
- Web Push VAPID key management approach
- "My Games" section placement (lobby page vs separate /games route)
- In-app badge placement and design
- Pause request/accept UI flow details

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MULT-02 | Async turn-based play with configurable timer presets (fast/normal/slow/unlimited) | Timer state in GameTable/GameSession, Hangfire recurring deadline checker, GameService.ValidateAndApplyMove extension points |
| NOTF-01 | User receives email notification when it's their turn (async games) | Resend .NET SDK (package: Resend 0.2.1), IResend DI service, immediate send from GameService after move |
| NOTF-02 | Turn timer enforces deadlines with escalating reminders (48h, 24h, final hour) | Hangfire delayed jobs for per-deadline reminders, Hangfire recurring job scans expired deadlines hourly |
| NOTF-03 | User receives Web Push notification via PWA service worker | Lib.Net.Http.WebPush 3.3.1, VAPID key pair, PushSubscription storage, service worker push event handler |
| NOTF-04 | User can configure notification preferences (immediate vs digest, per-game) | NotificationPreference entity in PostgreSQL, API endpoints, settings page section |
</phase_requirements>

---

## Summary

Phase 4 adds three interlocking systems to the existing .NET 8 / SvelteKit stack: (1) async game mode with deadline tracking in the database, (2) server-side background job scheduling for deadline enforcement and escalating reminders, and (3) multi-channel notifications (email via Resend, Web Push via VAPID, in-app badge).

The existing codebase already has strong foundations: `GameTable` holds game metadata, `GameSession` holds state as JSONB, `LobbyService.CreateTable/StartGame` are the entry points to extend, `GameService.ValidateAndApplyMove` is where "your turn" notifications get triggered, and `@vite-pwa/sveltekit` already configures a PWA with Workbox — ready for push subscriptions.

The main architectural decision (Claude's discretion) is the background job framework. **Hangfire with PostgreSQL storage is the right choice** for this workload: deadline enforcement and escalating reminders require persistent, retryable, scheduled delayed jobs — exactly Hangfire's strength. `IHostedService` timers are in-memory and lost on restart; Quartz.NET is more complex with no material benefit at this scale. The existing PostgreSQL database (already running via Docker) absorbs the Hangfire schema with minimal overhead.

**Primary recommendation:** Use Hangfire 1.x + Hangfire.PostgreSql for background scheduling, Resend SDK for transactional email, Lib.Net.Http.WebPush for Web Push server-side, and add a custom `push` event handler to the SvelteKit service worker via the `injectManifest` strategy.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hangfire.AspNetCore | 1.x (latest) | Background job engine — fire-and-forget, delayed, recurring | Persistent retry, dashboard, zero external process needed |
| Hangfire.PostgreSql | 1.21.1 | PostgreSQL storage provider for Hangfire | Reuses existing DB; actively maintained (Feb 2026) |
| Resend | 0.2.1 | Transactional email via Resend REST API | Locked decision; official .NET SDK; minimal setup |
| Lib.Net.Http.WebPush | 3.3.1 | Web Push Protocol client with VAPID | Actively maintained (Mar 2025), 1.2M downloads |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vite-pwa/sveltekit | ^1.1.0 (already installed) | PWA manifest + Workbox cache | Already configured; switch to `injectManifest` strategy to add custom push handler |
| workbox-precaching | latest (Workbox 7) | Precache manifest in custom service worker | Required when using `injectManifest` strategy |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hangfire | Quartz.NET | More complex (JobStore, triggers, schedulers); no simpler than Hangfire for this use case |
| Hangfire | IHostedService + Timer | No persistence — jobs lost on server restart; no retry; no dashboard |
| Resend | SendGrid / Mailgun | Resend is locked decision; resend-dotnet SDK is simpler |
| Lib.Net.Http.WebPush | WebPush (web-push-csharp 1.0.12) | WebPush 1.0.12 last updated July 2021; Lib.Net.Http.WebPush updated March 2025 — prefer maintained library |

**Installation (server):**
```bash
dotnet add package Hangfire.AspNetCore
dotnet add package Hangfire.PostgreSql
dotnet add package Resend
dotnet add package Lib.Net.Http.WebPush --version 3.3.1
```

**Installation (client — no new packages needed; workbox is transitive via @vite-pwa/sveltekit):**
```bash
# No new npm packages — @vite-pwa/sveltekit is already installed
```

---

## Architecture Patterns

### Recommended Project Structure (server additions)

```
apps/server/
├── Data/
│   ├── GameTable.cs           # ADD: IsAsync, TimerMode, SkipThreshold, TurnDeadline, ConsecutiveSkips, IsPaused
│   ├── PushSubscription.cs    # NEW entity: UserId, Endpoint, P256dh, Auth
│   ├── NotificationPreference.cs  # NEW entity: UserId, EmailEnabled, PushEnabled, ReminderHours
│   └── GameDbContext.cs       # ADD: PushSubscriptions, NotificationPreferences DbSets
├── Services/
│   ├── NotificationService.cs  # NEW: orchestrates email + push; respects preferences
│   ├── DeadlineService.cs      # NEW: Hangfire job methods for deadline enforcement & reminders
│   └── GameService.cs          # EXTEND: call NotificationService after move applied
├── Endpoints/
│   ├── NotificationEndpoints.cs  # NEW: subscribe/unsubscribe push, get/update preferences
│   └── LobbyEndpoints.cs         # EXTEND: pass IsAsync, TimerMode, SkipThreshold in CreateTable
└── Program.cs                    # ADD: Hangfire registration, service DI

apps/client/src/
├── service-worker.ts           # NEW: custom SW with push + notificationclick handlers
├── lib/
│   ├── api/notificationApi.ts  # NEW: subscribe push, save preferences
│   └── pushSubscription.ts    # NEW: VAPID subscribe helper
├── routes/
│   ├── settings/+page.svelte   # EXTEND: add Notifications section
│   ├── lobby/+page.svelte      # EXTEND: add async toggle, My Games section
│   └── game/[id]/+page.svelte  # EXTEND: show timer countdown in toolbar
└── vite.config.ts              # CHANGE: add injectManifest strategy, srcDir/filename
```

---

### Pattern 1: Hangfire Background Job Setup (Program.cs)

**What:** Register Hangfire with PostgreSQL storage and add server-side workers. The recurring deadline checker runs every 5 minutes.
**When to use:** Any time you need persistent scheduled work that survives server restarts.

```csharp
// Source: https://github.com/hangfire-postgres/Hangfire.PostgreSql (v1.21.1, Feb 2026)
// + https://docs.hangfire.io/en/latest/getting-started/aspnet-core-applications.html

// Program.cs — add after EF Core setup
builder.Services.AddHangfire(config =>
    config.UsePostgreSqlStorage(opts =>
        opts.UseNpgsqlConnection(
            builder.Configuration.GetConnectionString("Default"))));

builder.Services.AddHangfireServer();

// ... after app.Build():
app.UseHangfireDashboard("/hangfire"); // dev only — add auth middleware for prod

// Recurring job: check for expired deadlines every 5 minutes
RecurringJob.AddOrUpdate<DeadlineService>(
    "deadline-checker",
    svc => svc.ProcessExpiredDeadlines(),
    "*/5 * * * *");
```

---

### Pattern 2: Async Timer State in GameTable

**What:** Extend `GameTable` with async metadata. Extend `GameSession` state JSON with `turnDeadline`. The deadline is stored both on `GameTable` (indexed, queryable by Hangfire) and in the `GameSession` JSONB state (for client display).

```csharp
// New fields on GameTable entity
public bool IsAsync { get; set; }

// "fast" | "normal" | "slow" | null
public string? TimerMode { get; set; }

// 0 = disable auto-forfeit; default 3
public int SkipThreshold { get; set; } = 3;

// UTC deadline for current player's turn; null if real-time or timer paused
public DateTime? TurnDeadline { get; set; }

// Count of consecutive skips for the current player
public int ConsecutiveSkipsCurrentPlayer { get; set; }

// Pause state
public bool IsPaused { get; set; }
public string? PauseRequestedByUserId { get; set; }
```

Timer hours by mode:
- fast → 12h
- normal → 24h
- slow → 72h

---

### Pattern 3: Triggering Notifications After a Move

**What:** After `ValidateAndApplyMove` saves state, call `NotificationService` to notify the next player. This is fire-and-forget from the HTTP request's perspective.

```csharp
// GameService.ValidateAndApplyMove — add at Step 5b, after AppSync publish
if (isAsyncGame)
{
    // Enqueue immediate "your turn" notification as a Hangfire fire-and-forget job
    BackgroundJob.Enqueue<NotificationService>(
        svc => svc.NotifyYourTurn(sessionId, nextPlayerId));

    // Schedule escalating reminders via delayed Hangfire jobs
    // Store job IDs so they can be cancelled if the player moves first
    var deadline = CalculateNewDeadline(timerMode);
    var reminderHours = preferencesCache.GetReminderHours(nextPlayerId); // e.g., 4
    if (reminderHours < GetTotalHours(timerMode))
    {
        var reminderAt = deadline.AddHours(-reminderHours);
        BackgroundJob.Schedule<NotificationService>(
            svc => svc.SendDeadlineReminder(sessionId, nextPlayerId),
            reminderAt - DateTime.UtcNow);
    }
}
```

---

### Pattern 4: VAPID Key Management

**What:** Generate VAPID key pair ONCE at project setup (not at runtime). Store in environment variables / Docker Compose environment block. Never regenerate — it invalidates all existing subscriptions.

**Generate (one-time CLI, .NET):**
```csharp
// Run once in a scratch console app or via VapidHelper CLI
using WebPush; // or Lib.Net.Http.WebPush equivalent
var keys = VapidHelper.GenerateVapidKeys();
Console.WriteLine($"VAPID_PUBLIC_KEY={keys.PublicKey}");
Console.WriteLine($"VAPID_PRIVATE_KEY={keys.PrivateKey}");
```

**Store in Docker Compose / environment:**
```yaml
# apps/infra/docker-compose.yml — server service environment
VAPID_PUBLIC_KEY: "${VAPID_PUBLIC_KEY}"
VAPID_PRIVATE_KEY: "${VAPID_PRIVATE_KEY}"
VAPID_SUBJECT: "mailto:admin@bga2.dev"
```

---

### Pattern 5: Push Subscription (Server-side Send)

**What:** PushServiceClient from Lib.Net.Http.WebPush sends push messages to browser endpoints using VAPID.

```csharp
// Source: https://www.nuget.org/packages/Lib.Net.Http.WebPush 3.3.1
// Program.cs registration:
builder.Services.AddHttpClient<PushServiceClient>();

// NotificationService.cs — send push notification
public async Task SendPushAsync(string userId, string title, string body)
{
    var subscriptions = await _db.PushSubscriptions
        .Where(s => s.UserId == userId)
        .ToListAsync();

    foreach (var sub in subscriptions)
    {
        var pushSubscription = new PushSubscription
        {
            Endpoint = sub.Endpoint,
            Keys = { ["p256dh"] = sub.P256dh, ["auth"] = sub.Auth }
        };

        var message = new PushMessage(JsonSerializer.Serialize(new { title, body }))
        {
            Topic = "turn-notification",
            Urgency = PushMessageUrgency.High
        };

        try
        {
            await _pushClient.RequestPushMessageDeliveryAsync(
                pushSubscription, message,
                new VapidAuthentication(
                    _vapidPublicKey, _vapidPrivateKey) { Subject = _vapidSubject });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Push delivery failed for {UserId}", userId);
            // Non-fatal; subscription may be expired — consider removing
        }
    }
}
```

---

### Pattern 6: Client Push Subscription + Service Worker

**What:** vite-pwa `injectManifest` strategy with `src/service-worker.ts` allows custom push event handling alongside Workbox precaching.

**vite.config.ts change:**
```typescript
// Source: https://vite-pwa-org.netlify.app/frameworks/sveltekit
SvelteKitPWA({
    strategies: 'injectManifest',  // CHANGED from default (generateSW)
    srcDir: 'src',
    filename: 'service-worker.ts',
    manifest: { /* existing manifest stays */ },
    // workbox: { runtimeCaching: [...] }  // REMOVE — move into custom SW file
    devOptions: { enabled: false }
})
```

**svelte.config.js change (disable SK auto-register):**
```javascript
kit: {
    serviceWorker: {
        register: false  // Let @vite-pwa/sveltekit handle registration
    }
}
```

**src/service-worker.ts (new file):**
```typescript
// Source: https://vite-pwa-org.netlify.app/guide/inject-manifest
// + https://learn.microsoft.com/en-us/aspnet/core/blazor/progressive-web-app/push-notifications
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Network-first caching for API calls (was in vite.config.ts workbox.runtimeCaching)
// ... registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkFirst())

// Handle push messages from server
self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json() as { title: string; body: string; url?: string };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            data: { url: data.url ?? '/' },
        })
    );
});

// Open app/game when notification is clicked
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
```

**Client-side subscription (pushSubscription.ts):**
```typescript
// Source: https://web.dev/articles/push-notifications-subscribing-a-user
function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export async function subscribeToPush(vapidPublicKey: string) {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
}
```

---

### Pattern 7: Resend Email (server-side)

```csharp
// Source: https://resend.com/docs/send-with-dotnet
// Program.cs:
builder.Services.AddOptions();
builder.Services.AddHttpClient<ResendClient>();
builder.Services.Configure<ResendClientOptions>(o => {
    o.ApiToken = Environment.GetEnvironmentVariable("RESEND_APITOKEN")!;
});
builder.Services.AddTransient<IResend, ResendClient>();

// NotificationService.cs:
public async Task SendYourTurnEmailAsync(string toEmail, string playerName, string gameUrl)
{
    var msg = new EmailMessage
    {
        From = "BGA2 <noreply@bga2.dev>",
        Subject = "It's your turn!",
    };
    msg.To.Add(toEmail);
    msg.HtmlBody = $"""
        <p>Hi {playerName},</p>
        <p>It's your turn in your Azul game.</p>
        <p><a href="{gameUrl}">Play now</a></p>
        """;

    await _resend.EmailSendAsync(msg);
}
```

---

### Anti-Patterns to Avoid

- **Storing VAPID keys in code or DB:** Store in environment variables only; keys must be stable across deployments
- **Re-generating VAPID keys on startup:** Invalidates all browser subscriptions silently; generate once at setup
- **Firing email/push synchronously in HTTP request:** Use Hangfire `BackgroundJob.Enqueue` to avoid blocking move response
- **Not cancelling scheduled reminders when player moves:** Track scheduled Hangfire job IDs in the deadline record so they can be deleted when the player takes their turn
- **Missing idempotency on notification jobs:** Hangfire retries failed jobs; ensure email/push sends are idempotent (check if notification was already sent for this turn/version)
- **Polling for deadlines more frequently than needed:** Every 5 minutes is fine for async games measured in hours; polling every 1 minute wastes DB resources
- **Forgetting iOS push requires home screen install:** Must educate user before prompting permission on iOS

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent background jobs | Custom `IHostedService` timer with DB polling | Hangfire | Hangfire handles persistence, retry, monitoring dashboard, cron scheduling out of box; hand-rolled timers lose jobs on restart |
| Push message encryption/VAPID signing | Custom crypto for RFC 8291/8292 | Lib.Net.Http.WebPush 3.3.1 | ECE + ECDH key agreement is subtle; library is the reference implementation |
| Email delivery | Custom SMTP client | Resend SDK | SPF/DKIM, bounce handling, deliverability — Resend handles all of this |
| Cron expressions | Custom scheduler | Hangfire's `Cron` class | `Cron.HourInterval(5)` is clearer than `"*/5 * * * *"` and less error-prone |
| Service worker precache manifest | Manual asset list | Workbox `precacheAndRoute(self.__WB_MANIFEST)` | Manifest is injected at build time; hand-maintained lists get stale |

**Key insight:** The notification domain has dozens of edge cases per layer (push subscription expiry, email bounce handling, job deduplication, timer cancellation on move). Use purpose-built libraries for each layer; hand-rolled equivalents will miss edge cases.

---

## Common Pitfalls

### Pitfall 1: VAPID Key Churn Breaks All Push Subscriptions
**What goes wrong:** Developer regenerates VAPID keys (e.g., resets Docker volume, redeploys without key persistence). All existing browser push subscriptions silently become invalid. Sends fail with 410 Gone.
**Why it happens:** VAPID keys are part of the browser's stored subscription; changing them invalidates the cryptographic proof.
**How to avoid:** Generate key pair ONCE, store in `.env` file (not committed), mount via Docker Compose environment. Document this in onboarding.
**Warning signs:** Push sends returning 401/410 for all subscriptions after a config change.

### Pitfall 2: iOS Push Requires Home Screen Install (Not Just Browser Visit)
**What goes wrong:** Push permission prompt appears, user grants it, but push notifications never arrive because the PWA isn't installed on the iOS home screen.
**Why it happens:** iOS Safari (16.4+) only delivers Web Push to installed PWAs. Browser tab context does not receive pushes.
**How to avoid:** Before prompting for push permission on iOS, check `navigator.standalone` to detect home screen installation. Show an install prompt/guide first. Note: `display: "standalone"` in manifest is required (already set in vite.config.ts).
**Warning signs:** Push delivery works on Chrome desktop/Android but fails silently on iOS.

### Pitfall 3: Hangfire Jobs Lost Due to Serialization
**What goes wrong:** Hangfire serializes job arguments to JSON. If a method signature uses complex objects (EF entities, DTOs with circular refs), deserialization fails on retry and the job is permanently lost.
**How to avoid:** Pass only primitive IDs (Guid, string) to Hangfire job methods. Resolve services and load data inside the job body.
**Warning signs:** Jobs fail on second attempt with `JsonException` in Hangfire dashboard.

### Pitfall 4: Duplicate "Your Turn" Emails/Pushes
**What goes wrong:** Network timeout causes client to retry the move POST; server processes it twice (or Hangfire retries the notification job). Player receives two emails.
**Why it happens:** Move is idempotent (PlayedMoveIds handles this), but the notification job may still fire twice if the Hangfire job itself is retried.
**How to avoid:** Add a notification record to DB before sending: `NotificationLog { TurnVersion, UserId, Channel }` with unique constraint. Check existence before sending. Hangfire's at-least-once guarantee means idempotency is the job's responsibility.
**Warning signs:** Players complaining about double emails; NotificationLog shows two rows for same turn+user.

### Pitfall 5: Deadline Reminders Not Cancelled After Player Moves
**What goes wrong:** Player A's 4h reminder is scheduled as a Hangfire delayed job. Player A takes their turn 6h before deadline. The reminder fires anyway.
**How to avoid:** When scheduling reminders, store the Hangfire `jobId` (returned by `BackgroundJob.Schedule`) in the GameTable or a `ScheduledNotification` table. When the player moves, call `BackgroundJob.Delete(jobId)` to cancel pending reminders.
**Warning signs:** Players receiving reminders even after they've already played.

### Pitfall 6: Service Worker Transition from generateSW to injectManifest Breaks Existing Install
**What goes wrong:** Switching from `generateSW` (current) to `injectManifest` changes the service worker file name or scope, causing browsers with old SW cached to fail to update cleanly.
**How to avoid:** Keep the output filename as `service-worker.js` (SvelteKit's default). Test with "Update on reload" in DevTools. Clear caches explicitly in the `activate` handler for the first version.
**Warning signs:** Chrome DevTools shows old service worker still active after deploy.

### Pitfall 7: Hangfire Schema Creation vs Existing DB
**What goes wrong:** Hangfire tries to create its schema (tables, indexes) in the `bga2` database at startup. If the DB user lacks DDL permissions or the schema prefix conflicts, server fails to start.
**How to avoid:** In dev, the `bga2` user has full access (Docker Compose). In production, run Hangfire DDL migration separately. The `UsePostgreSqlStorage` call creates Hangfire schema with prefix `"hangfire"` by default — no conflict with app tables.
**Warning signs:** `HangfireException` at startup; missing `hangfire.job` table in DB.

---

## Code Examples

### Entity Schemas (New/Extended)

```csharp
// Data/PushSubscription.cs (NEW)
public class PushSubscription
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = "";     // Better Auth user.id
    public string Endpoint { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

// Data/NotificationPreference.cs (NEW)
public class NotificationPreference
{
    public string UserId { get; set; } = "";     // PK — one row per user
    public bool EmailEnabled { get; set; } = true;
    public bool PushEnabled { get; set; } = true;
    // Hours before deadline to send reminder (e.g., 4 = 4h before deadline)
    // 0 = disabled
    public int ReminderHoursBeforeDeadline { get; set; } = 4;
    public DateTime UpdatedAt { get; set; }
}

// Data/GameTable.cs extensions (ADD to existing entity)
// IsAsync, TimerMode ("fast"|"normal"|"slow"), SkipThreshold, TurnDeadline (UTC), IsPaused, PauseRequestedByUserId, ConsecutiveSkipsCurrentPlayer
```

### DeadlineService (Hangfire job class)

```csharp
// Services/DeadlineService.cs
public class DeadlineService
{
    private readonly GameDbContext _db;
    private readonly NotificationService _notifications;
    private readonly ILogger<DeadlineService> _logger;

    // Called by Hangfire recurring job every 5 minutes
    // Find tables where TurnDeadline has passed and apply timeout penalty
    [DisableConcurrentExecution(timeoutInSeconds: 60)]
    public async Task ProcessExpiredDeadlines()
    {
        var now = DateTime.UtcNow;
        var expired = await _db.GameTables
            .Where(t => t.IsAsync && !t.IsPaused &&
                        t.TurnDeadline <= now && t.Status == TableStatus.Playing)
            .ToListAsync();

        foreach (var table in expired)
        {
            await ApplyTimeoutPenalty(table);
        }
    }

    private async Task ApplyTimeoutPenalty(GameTable table)
    {
        // Load session, apply skip, check forfeit threshold, advance turn
        // Then schedule next deadline and send notifications
        // ...
    }
}
```

### Lobby Request Extensions

```csharp
// Services/LobbyService.cs — extend CreateTableRequest
public record CreateTableRequest(
    string GameId,
    string DisplayName,
    int MinPlayers,
    int MaxPlayers,
    bool IsPrivate,
    string? Password,
    bool IsAsync,           // NEW
    string? TimerMode,      // NEW: "fast" | "normal" | "slow" | null
    int SkipThreshold       // NEW: default 3, 0 = disable
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Quartz.NET for .NET scheduling | Hangfire (simpler) is ecosystem-preferred for web apps | ~2018 | Hangfire has built-in dashboard and simpler API for typical web job patterns |
| Web Push without VAPID | VAPID required by all major browsers | 2018-2020 | GCM/FCM key approach deprecated; VAPID is the only standard |
| iOS does not support Web Push | iOS 16.4+ supports Web Push in installed PWAs | March 2023 | Web Push now viable on iOS but requires home screen install |
| Separate service worker file from Vite PWA | `injectManifest` strategy lets you write custom SW + get precaching | vite-plugin-pwa ~2022 | Enables push event handling alongside Workbox caching |
| `generateSW` (auto-generated) | `injectManifest` (custom SW) | vite-plugin-pwa design | Required for push event handlers; auto-generated SW has no push listener |

**Deprecated/outdated:**
- GCM/FCM legacy server keys for Web Push: Replaced by VAPID. Do not use.
- Firebase Cloud Messaging for vanilla Web Push: Overkill; direct VAPID approach is simpler for this use case.

---

## Open Questions

1. **Email sending domain for Resend**
   - What we know: Resend requires a verified sending domain (or use `onboarding@resend.dev` for testing, which only sends to the account owner)
   - What's unclear: Does the project have a domain to verify? `bga2.dev`?
   - Recommendation: Use `onboarding@resend.dev` in dev; document that a real domain must be verified before production email delivery to players works.

2. **VAPID key provisioning in CI/CD**
   - What we know: Keys must be stable; `.env` not committed; Docker Compose uses `${VAPID_PUBLIC_KEY}` substitution
   - What's unclear: Where the canonical keys will be stored for future deploys
   - Recommendation: Generate keys in Phase 4 Wave 0, store in a `.env.local` file (gitignored), document generation steps in README. Production: use AWS SSM Parameter Store.

3. **iOS detection for push opt-in flow**
   - What we know: iOS requires home screen install before push permission is requestable; `navigator.standalone` detects this
   - What's unclear: Whether to show an iOS-specific install guide or just silently suppress the push opt-in if not standalone
   - Recommendation: Check `navigator.standalone`; if false on iOS, show a brief "Install the app to receive push notifications" message instead of the permission prompt.

4. **Hangfire dashboard security**
   - What we know: `app.UseHangfireDashboard("/hangfire")` is open by default
   - What's unclear: Whether the dashboard should be restricted in dev (it's fine open) vs. production
   - Recommendation: In dev, leave it open. Add `DashboardOptions { Authorization = [new LocalRequestsOnlyAuthorizationFilter()] }` initially; note in plan that prod needs real auth.

5. **Email address for async game players**
   - What we know: Better Auth stores email on the `user` table; the C# server uses JWT claims (`sub` = user ID); email is in JWT only if Better Auth includes it
   - What's unclear: Does the JWT issued by Better Auth include the `email` claim, or does the server need to query Better Auth's user table via the PostgreSQL connection?
   - Recommendation: Look up email via DB query using the user ID (`SELECT email FROM "user" WHERE id = $userId`). Better Auth's `user` table is in the same `bga2` database — a single SQL query is the simplest approach.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` — skipping validation architecture section.

---

## Sources

### Primary (HIGH confidence)
- [Hangfire.PostgreSql GitHub](https://github.com/hangfire-postgres/Hangfire.PostgreSql) — version 1.21.1, Feb 11 2026, setup code
- [Lib.Net.Http.WebPush NuGet](https://nuget.org/packages/Lib.Net.Http.WebPush) — version 3.3.1, Mar 9 2025, framework support
- [Resend .NET docs](https://resend.com/docs/send-with-dotnet) — official SDK setup, version 0.2.1
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) — PushManager.subscribe, PushSubscription shape
- [web.dev: Subscribing a User](https://web.dev/articles/push-notifications-subscribing-a-user) — client-side subscription code (authoritative Google source)
- [Microsoft Learn: Blazor PWA Push Notifications](https://learn.microsoft.com/en-us/aspnet/core/blazor/progressive-web-app/push-notifications?view=aspnetcore-10.0) — complete end-to-end code for push subscription and service worker handler
- [Vite PWA SvelteKit docs](https://vite-pwa-org.netlify.app/frameworks/sveltekit) — injectManifest strategy, svelte.config.js changes
- [Svelte.dev: Service Workers](https://svelte.dev/docs/kit/service-workers) — src/service-worker placement, $service-worker module

### Secondary (MEDIUM confidence)
- [boldsign.com: Hangfire vs IHostedService](https://boldsign.com/blogs/aspnet-core-background-jobs-hosted-services-hangfire-quartz/) — comparison verified against Hangfire official docs
- [kailashsblogs.com: Web Push in ASP.NET Core (Oct 2025)](https://www.kailashsblogs.com/2025/10/web-push-notifications-in-aspnet-core.html) — Lib.Net.Http.WebPush usage patterns

### Tertiary (LOW confidence — flag for validation)
- iOS PWA limitations (brainhub.eu, mobiloud.com) — iOS 16.4+ push support; home screen requirement. LOW: cross-verified by multiple sources but iOS behavior can change with Safari updates. **Validate on actual iOS device during Phase 4.**

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on NuGet, official docs fetched
- Architecture: HIGH — based on existing codebase analysis + official library patterns
- Pitfalls: MEDIUM — most derived from official docs + community cross-verification; iOS behavior is LOW
- iOS push support: LOW — documented by multiple sources but must be tested on real device (STATE.md blocker already flagged this)

**Research date:** 2026-03-02
**Valid until:** 2026-05-02 (Hangfire is stable; Resend SDK changes slowly; Web Push spec is stable)
