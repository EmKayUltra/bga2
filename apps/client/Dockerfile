# BGA2 SvelteKit Client - Multi-stage Dockerfile
# Build context: workspace root (../../ from apps/client)

# ─── Stage 1: base ───────────────────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Copy workspace package manifests for dependency install
# (uses workspace root as build context)
COPY package.json package-lock.json ./

# Copy workspace member package files before install
COPY apps/client/package.json ./apps/client/
COPY libs/engine/core/package.json ./libs/engine/core/
COPY libs/shared-types/package.json ./libs/shared-types/
COPY libs/games/azul/package.json ./libs/games/azul/

# Install all workspace dependencies
RUN npm install

# ─── Stage 2: dev ────────────────────────────────────────────────────────────
FROM base AS dev

WORKDIR /app

# Copy source (will be overridden by volume mount in dev)
COPY tsconfig.base.json nx.json ./
COPY apps/client ./apps/client
COPY libs ./libs

# Expose SvelteKit dev port + HMR port
EXPOSE 5173
EXPOSE 24678

# Use polling for file watching in Docker volume mounts
ENV CHOKIDAR_USEPOLLING=true
ENV VITE_CJS_IGNORE_WARNING=true

WORKDIR /app/apps/client

CMD ["npm", "run", "dev"]
