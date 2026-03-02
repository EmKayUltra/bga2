using Bga2.Server.Data;
using Bga2.Server.Endpoints;
using Bga2.Server.Services;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ─── Database ─────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__Default")
    ?? "Host=localhost;Database=bga2;Username=bga2;Password=secret";

builder.Services.AddDbContext<GameDbContext>(opts =>
    opts.UseNpgsql(connectionString));

// ─── Hangfire background job processing ───────────────────────────────────────
builder.Services.AddHangfire(config =>
    config.UsePostgreSqlStorage(opts =>
        opts.UseNpgsqlConnection(connectionString)));
builder.Services.AddHangfireServer();

// ─── HTTP client factory (used by AppSyncPublisher + PushServiceClient) ───────
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<Lib.Net.Http.WebPush.PushServiceClient>();

// ─── Resend email client ───────────────────────────────────────────────────────
builder.Services.Configure<Resend.ResendClientOptions>(o =>
{
    o.ApiToken = Environment.GetEnvironmentVariable("RESEND_APITOKEN") ?? "";
});
builder.Services.AddTransient<Resend.IResend, Resend.ResendClient>();

// ─── Application services ──────────────────────────────────────────────────────
builder.Services.AddScoped<HookExecutor>();
builder.Services.AddScoped<ProfileService>();
builder.Services.AddScoped<AppSyncPublisher>();
builder.Services.AddScoped<GameService>();
builder.Services.AddScoped<LobbyService>();
builder.Services.AddScoped<FriendService>();
builder.Services.AddScoped<InviteService>();
builder.Services.AddSingleton<ChatFilter>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<DeadlineService>();

// ─── JWT Bearer authentication ────────────────────────────────────────────────
// Better Auth exposes JWKS at /api/auth/jwks (via jwt plugin).
// The JwtBearer middleware fetches public keys from JWKS to validate tokens.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Better Auth JWKS endpoint — uses Docker service name in dev
        options.Authority = "http://client:5173/api/auth";
        options.RequireHttpsMetadata = false; // Docker dev only — no HTTPS in container network

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,   // Better Auth JWT may not set standard issuer
            ValidateAudience = false, // Skip audience check in dev — validate signature only
            ValidateLifetime = true,
        };
    });

builder.Services.AddAuthorization();

// ─── API infrastructure ────────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "BGA2 Game API", Version = "v1" });
});

// ─── CORS: allow SvelteKit dev server and any frontend origin in dev ───────────
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://client:5173",        // Docker Compose service name
                "http://localhost:4173")     // SvelteKit preview port
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

// ─── Database setup ────────────────────────────────────────────────────────────
// Ensure the DB schema exists — creates tables if they don't exist.
// EnsureCreated only works on first run; for incremental table additions we use
// raw SQL with IF NOT EXISTS. Will be replaced with proper migrations before production.
// NOTE: Better Auth tables (user, session, account, verification, jwks) are managed
// exclusively by @better-auth/cli migrate — NOT by this call.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
    db.Database.EnsureCreated();
    // Create any tables added after initial DB creation (EnsureCreated is all-or-nothing)
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "GameTables" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "GameId" varchar(64) NOT NULL,
            "HostUserId" varchar(64) NOT NULL,
            "DisplayName" varchar(128) NOT NULL,
            "IsPrivate" boolean NOT NULL DEFAULT false,
            "PasswordHash" varchar(256),
            "Status" integer NOT NULL DEFAULT 0,
            "MinPlayers" integer NOT NULL DEFAULT 2,
            "MaxPlayers" integer NOT NULL DEFAULT 4,
            "SessionId" uuid,
            "CreatedAt" timestamptz NOT NULL DEFAULT NOW(),
            "UpdatedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_GameTables" PRIMARY KEY ("Id")
        );
        CREATE INDEX IF NOT EXISTS "IX_GameTables_Status" ON "GameTables" ("Status");

        CREATE TABLE IF NOT EXISTS "TablePlayers" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "TableId" uuid NOT NULL,
            "UserId" varchar(64) NOT NULL,
            "DisplayName" varchar(128) NOT NULL,
            "SeatIndex" integer NOT NULL DEFAULT 0,
            "IsReady" boolean NOT NULL DEFAULT false,
            "JoinedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_TablePlayers" PRIMARY KEY ("Id"),
            CONSTRAINT "FK_TablePlayers_GameTables" FOREIGN KEY ("TableId") REFERENCES "GameTables" ("Id") ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_TablePlayers_TableId_UserId" ON "TablePlayers" ("TableId", "UserId");

        CREATE TABLE IF NOT EXISTS "Friendships" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "RequesterId" varchar(64) NOT NULL,
            "AddresseeId" varchar(64) NOT NULL,
            "Status" integer NOT NULL DEFAULT 0,
            "CreatedAt" timestamptz NOT NULL DEFAULT NOW(),
            "UpdatedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_Friendships" PRIMARY KEY ("Id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_Friendships_RequesterId_AddresseeId" ON "Friendships" ("RequesterId", "AddresseeId");

        CREATE TABLE IF NOT EXISTS "UserProfiles" (
            "UserId" varchar(64) NOT NULL,
            "Avatar" varchar(64) NOT NULL DEFAULT 'default',
            "IsPublic" boolean NOT NULL DEFAULT true,
            "UsernameChangedAt" timestamptz,
            "CreatedAt" timestamptz NOT NULL DEFAULT NOW(),
            "UpdatedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_UserProfiles" PRIMARY KEY ("UserId")
        );

        CREATE TABLE IF NOT EXISTS "MatchResults" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "SessionId" uuid NOT NULL,
            "UserId" varchar(64) NOT NULL,
            "GameId" varchar(64) NOT NULL,
            "Score" integer NOT NULL DEFAULT 0,
            "Placement" integer NOT NULL DEFAULT 0,
            "IsWinner" boolean NOT NULL DEFAULT false,
            "CompletedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_MatchResults" PRIMARY KEY ("Id"),
            CONSTRAINT "FK_MatchResults_GameSessions" FOREIGN KEY ("SessionId") REFERENCES "GameSessions" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_MatchResults_UserId" ON "MatchResults" ("UserId");
        CREATE INDEX IF NOT EXISTS "IX_MatchResults_SessionId" ON "MatchResults" ("SessionId");

        CREATE TABLE IF NOT EXISTS "PlayerReports" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "ReporterUserId" varchar(64) NOT NULL,
            "ReportedUserId" varchar(64) NOT NULL,
            "ChannelId" varchar(128),
            "MessageText" varchar(1024),
            "Reason" varchar(512),
            "CreatedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_PlayerReports" PRIMARY KEY ("Id")
        );
        CREATE INDEX IF NOT EXISTS "IX_PlayerReports_ReportedUserId" ON "PlayerReports" ("ReportedUserId");
        CREATE INDEX IF NOT EXISTS "IX_PlayerReports_ReporterUserId_CreatedAt" ON "PlayerReports" ("ReporterUserId", "CreatedAt");

        ALTER TABLE "GameSessions" ADD COLUMN IF NOT EXISTS "PlayedMoveIds" jsonb NOT NULL DEFAULT '[]';

        -- Phase 4: Add async game mode columns to GameTables (safe if already exist)
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "IsAsync" boolean NOT NULL DEFAULT false;
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "TimerMode" varchar(16);
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "SkipThreshold" integer NOT NULL DEFAULT 3;
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "TurnDeadline" timestamptz;
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "ConsecutiveSkipsCurrentPlayer" integer NOT NULL DEFAULT 0;
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "IsPaused" boolean NOT NULL DEFAULT false;
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "PauseRequestedByUserId" varchar(64);
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "PendingReminderJobId" varchar(128);
        ALTER TABLE "GameTables" ADD COLUMN IF NOT EXISTS "PendingReminderJobIds" jsonb;
        CREATE INDEX IF NOT EXISTS "IX_GameTables_TurnDeadline" ON "GameTables" ("TurnDeadline");

        -- Phase 4: Web Push subscriptions
        CREATE TABLE IF NOT EXISTS "PushSubscriptions" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "UserId" varchar(64) NOT NULL,
            "Endpoint" varchar(2048) NOT NULL,
            "P256dh" varchar(256) NOT NULL,
            "Auth" varchar(256) NOT NULL,
            "CreatedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_PushSubscriptions" PRIMARY KEY ("Id")
        );
        CREATE INDEX IF NOT EXISTS "IX_PushSubscriptions_UserId" ON "PushSubscriptions" ("UserId");

        -- Phase 4: Notification preferences per user
        CREATE TABLE IF NOT EXISTS "NotificationPreferences" (
            "UserId" varchar(64) NOT NULL,
            "EmailEnabled" boolean NOT NULL DEFAULT true,
            "PushEnabled" boolean NOT NULL DEFAULT true,
            "ReminderHoursBeforeDeadline" integer NOT NULL DEFAULT 4,
            "UpdatedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_NotificationPreferences" PRIMARY KEY ("UserId")
        );

        -- Phase 4: Notification send log for idempotency
        CREATE TABLE IF NOT EXISTS "NotificationLogs" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "SessionId" uuid NOT NULL,
            "TurnVersion" integer NOT NULL DEFAULT 0,
            "UserId" varchar(64) NOT NULL,
            "Channel" varchar(16) NOT NULL,
            "SentAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_NotificationLogs" PRIMARY KEY ("Id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_NotificationLogs_Idempotency" ON "NotificationLogs" ("SessionId", "TurnVersion", "UserId", "Channel");
        CREATE INDEX IF NOT EXISTS "IX_NotificationLogs_SessionId" ON "NotificationLogs" ("SessionId");

        -- Phase 4 gap closure: Delivery mode on notification preferences
        ALTER TABLE "NotificationPreferences" ADD COLUMN IF NOT EXISTS "DeliveryMode" varchar(16) NOT NULL DEFAULT 'immediate';

        -- Phase 4 gap closure: Per-game notification opt-out
        CREATE TABLE IF NOT EXISTS "NotificationOptOuts" (
            "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "UserId" varchar(64) NOT NULL,
            "TableId" uuid NOT NULL,
            "CreatedAt" timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT "PK_NotificationOptOuts" PRIMARY KEY ("Id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_NotificationOptOuts_UserId_TableId" ON "NotificationOptOuts" ("UserId", "TableId");
        """);
}

// ─── Middleware pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Hangfire dashboard — available at /hangfire in dev
app.UseHangfireDashboard("/hangfire");

// Recurring job: check for expired async game deadlines every 5 minutes
RecurringJob.AddOrUpdate<DeadlineService>(
    "deadline-checker",
    svc => svc.ProcessExpiredDeadlines(),
    "*/5 * * * *");

// Recurring job: send daily digest emails at 09:00 UTC
RecurringJob.AddOrUpdate<NotificationService>(
    "digest-sender",
    svc => svc.SendDigestBatch(),
    "0 9 * * *");

app.UseCors("DevCors");

// Authentication and Authorization must be added BEFORE endpoint mapping
app.UseAuthentication();
app.UseAuthorization();

// ─── Last-seen middleware ───────────────────────────────────────────────────────
// Updates in-memory presence tracking for any authenticated request.
// FriendService.IsOnline() uses this to determine online status.
app.Use(async (context, next) =>
{
    await next();
    // Update last-seen after the request completes so auth claims are resolved
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var userId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? context.User.FindFirst("sub")?.Value;
        if (userId != null)
        {
            // FriendService is scoped — use the existing request scope
            var friendService = context.RequestServices.GetService<FriendService>();
            friendService?.UpdateLastSeen(userId);
        }
    }
});

// ─── Endpoints ─────────────────────────────────────────────────────────────────

// Health check
app.MapGet("/", () => new
{
    status = "ok",
    service = "bga2-server",
    version = "0.1.0",
    environment = app.Environment.EnvironmentName
})
.WithName("HealthCheck");

// Detailed health (used by Docker healthcheck and monitoring)
app.MapGet("/health", () => new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
})
.WithName("Health");

// Game endpoints (POST /games, POST /games/{id}/move, GET /games/{id}/state)
app.MapGameEndpoints();

// Dev endpoints (POST /dev/{id}/trigger-round-end, /trigger-game-end, /set-state)
app.MapDevEndpoints();

// Lobby endpoints (GET/POST /tables, /tables/{id}/join|leave|start, /tables/quick-play)
app.MapLobbyEndpoints();

// Social endpoints (GET /social/profile/{username}, PUT /social/profile, etc.)
app.MapSocialEndpoints();

// Friend endpoints (GET/POST /friends, /friends/requests, /friends/search, etc.)
app.MapFriendEndpoints();

// Invite endpoints (POST /invites, GET /invites/{token}/validate)
app.MapInviteEndpoints();

// Chat endpoints (POST /chat/{channelId}/send, /chat/{channelId}/report)
app.MapChatEndpoints();

// Notification endpoints (POST /notifications/push/subscribe|unsubscribe, GET+PUT /notifications/preferences)
app.MapNotificationEndpoints();

// ─── Startup ───────────────────────────────────────────────────────────────────
app.Logger.LogInformation("BGA2 Server starting on {Url}", "http://0.0.0.0:8080");

app.Run("http://0.0.0.0:8080");
