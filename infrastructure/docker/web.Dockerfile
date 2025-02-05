# Stage 1: Builder
FROM node:18-alpine AS builder

# Install pnpm globally with production optimizations
ENV PNPM_HOME="/app/.pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@8.0.0 --registry=https://registry.npmjs.org/

# Set working directory
WORKDIR /app

# Copy package files for dependency caching
COPY src/web/package.json src/web/pnpm-lock.yaml ./

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code and config files
COPY src/web/tsconfig.json ./
COPY src/web/vite.config.ts ./
COPY src/web/src ./src
COPY src/web/public ./public

# Run TypeScript compilation and build
RUN pnpm run typecheck && \
    pnpm run build

# Run security audit
RUN pnpm audit --prod --audit-level=high

# Remove dev dependencies and prune
RUN pnpm prune --prod && \
    rm -rf node_modules/.cache

# Stage 2: Production
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1000 node && \
    adduser -u 1000 -G node -s /bin/sh -D node

# Copy built assets from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Install production dependencies only
ENV PNPM_HOME="/app/.pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@8.0.0 --registry=https://registry.npmjs.org/ && \
    pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Security hardening
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/* && \
    chmod -R 755 /app && \
    chown -R node:node /app

# Set security limits
RUN echo "node soft nofile 1000" >> /etc/security/limits.conf && \
    echo "node hard nofile 1000" >> /etc/security/limits.conf && \
    echo "node soft nproc 50" >> /etc/security/limits.conf && \
    echo "node hard nproc 50" >> /etc/security/limits.conf

# Switch to non-root user
USER node

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set memory limits
ENV NODE_OPTIONS="--max-old-space-size=512"

# Start production server
CMD ["node", "dist/server.js"]