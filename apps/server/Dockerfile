# BGA2 C# API Server - Multi-stage Dockerfile
# Build context: workspace root (../../ from apps/server)

# ─── Stage 1: base ───────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS base

WORKDIR /app

# ─── Stage 2: dev ────────────────────────────────────────────────────────────
FROM base AS dev

WORKDIR /app/apps/server

# Copy project file first for layer caching
COPY apps/server/server.csproj ./

# Restore NuGet packages
RUN dotnet restore server.csproj

# Copy source (will be overridden by volume mount in dev)
COPY apps/server ./

# Expose API port
EXPOSE 8080

# Polling file watcher required for Docker volume mounts
ENV DOTNET_USE_POLLING_FILE_WATCHER=1
ENV ASPNETCORE_ENVIRONMENT=Development
ENV ASPNETCORE_URLS=http://0.0.0.0:8080

# Use dotnet watch for hot reload in dev
CMD ["dotnet", "watch", "run", "--project", "server.csproj"]
