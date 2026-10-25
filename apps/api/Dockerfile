# Multi-stage Dockerfile for @pocketroute/api
# PRD Section 12.1, 13, and Task Requirement 5

# --- Stage 1: Build stage ---
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

# Copy root configuration and lockfiles
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY apps/api/package.json ./apps/api/

# Install all workspace dependencies
RUN pnpm install

# Copy source code and build configs
COPY packages/shared ./packages/shared
COPY packages/engine ./packages/engine
COPY apps/api ./apps/api

# Build TypeScript packages
RUN pnpm --filter @pocketroute/shared build && \
    pnpm --filter @pocketroute/engine build && \
    pnpm --filter @pocketroute/api build

# Prune and deploy production bundle for apps/api
RUN pnpm --filter @pocketroute/api deploy --prod /prod/api

# --- Stage 2: Runtime stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Install curl for HEALTHCHECK
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Copy production files and transit data pack
COPY --from=builder /prod/api ./
COPY data ./data

# Ensure non-root node user ownership
RUN chown -R node:node /app

# Run as non-root user
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
