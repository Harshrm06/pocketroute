# Multi-stage Dockerfile for @pocketroute/web
# PRD Section 13, 16, 17.5

# --- Stage 1: Build stage ---
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

# Copy root configuration and lockfiles
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY apps/web/package.json ./apps/web/

# Install workspace dependencies
RUN pnpm install

# Copy source code and build configs
COPY packages/shared ./packages/shared
COPY packages/engine ./packages/engine
COPY apps/web ./apps/web

# Build arguments for Vite environment variables
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/bright
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL

# Build web application bundle
RUN pnpm --filter @pocketroute/shared build && \
    pnpm --filter @pocketroute/engine build && \
    pnpm --filter @pocketroute/web build

# --- Stage 2: Runtime stage ---
FROM nginx:alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built web distribution files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
