using Bga2.Server.Data;
using Bga2.Server.Endpoints;
using Bga2.Server.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

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

// ─── Middleware pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("DevCors");

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

// ─── Startup ───────────────────────────────────────────────────────────────────
app.Logger.LogInformation("BGA2 Server starting on {Url}", "http://0.0.0.0:8080");

app.Run("http://0.0.0.0:8080");
