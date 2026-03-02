using Bga2.Server.Data;
using Bga2.Server.Endpoints;
using Bga2.Server.Services;
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

// ─── Application services ──────────────────────────────────────────────────────
builder.Services.AddScoped<HookExecutor>();
builder.Services.AddScoped<GameService>();

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
// EnsureCreated is appropriate for development/prototype; will be replaced with
// proper migrations before production deployment.
// NOTE: Better Auth tables (user, session, account, verification, jwks) are managed
// exclusively by @better-auth/cli migrate — NOT by this EnsureCreated call.
// GameDbContext does NOT include those entities to avoid conflicts.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
    db.Database.EnsureCreated();
}

// ─── Middleware pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("DevCors");

// Authentication and Authorization must be added BEFORE endpoint mapping
app.UseAuthentication();
app.UseAuthorization();

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

// ─── Startup ───────────────────────────────────────────────────────────────────
app.Logger.LogInformation("BGA2 Server starting on {Url}", "http://0.0.0.0:8080");

app.Run("http://0.0.0.0:8080");
