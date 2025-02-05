# -----------------------------
# Stage 1: Builder
# -----------------------------
FROM node:18-alpine AS builder

# Build arguments
ARG PNPM_VERSION=8.9.0
ARG NODE_ENV=production

# Environment variables for build
ENV NODE_ENV=${NODE_ENV} \
    PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

# Install build dependencies and pnpm
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

# Set working directory
WORKDIR /build

# Copy package files with checksums
COPY src/backend/package.json src/backend/pnpm-lock.yaml ./

# Install dependencies with cache optimization
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

# Copy source code and configs
COPY src/backend/tsconfig.json ./
COPY src/backend/src ./src

# Type check and build
RUN pnpm run typecheck && \
    pnpm run build

# -----------------------------
# Stage 2: Production
# -----------------------------
FROM node:18-alpine

# Build arguments
ARG NODE_ENV=production
ARG PORT=3000

# Environment variables
ENV NODE_ENV=${NODE_ENV} \
    PORT=${PORT} \
    NODE_OPTIONS="--max-old-space-size=2048" \
    TZ=UTC

# Create non-root user
RUN addgroup -g 1001 nodeusr && \
    adduser -u 1001 -G nodeusr -s /bin/sh -D nodeusr

# Install production dependencies
RUN apk add --no-cache \
    tini \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy built files and dependencies from builder
COPY --from=builder --chown=nodeusr:nodeusr /build/dist ./dist
COPY --from=builder --chown=nodeusr:nodeusr /build/package.json /build/pnpm-lock.yaml ./

# Install production dependencies only
RUN corepack enable && \
    corepack prepare pnpm@8.9.0 --activate && \
    pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Security hardening
RUN chmod -R 550 /app && \
    chmod -R 770 /app/dist && \
    rm -rf /tmp/* /var/cache/apk/* && \
    echo "nodeusr:x:1001:1001::/app:/sbin/nologin" >> /etc/passwd

# Switch to non-root user
USER nodeusr

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Container metadata
LABEL org.opencontainers.image.title="Unbanked Backend" \
      org.opencontainers.image.description="Backend services for the Unbanked financial platform" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Unbanked" \
      org.opencontainers.image.licenses="Private" \
      org.opencontainers.image.created=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

# Set resource limits
EXPOSE ${PORT}

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]