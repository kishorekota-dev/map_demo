# ===============================================
# Multi-stage Dockerfile for POC Chat Backend
# ===============================================

# Base stage - shared dependencies
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Development stage
FROM base AS development
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
RUN mkdir -p logs uploads
EXPOSE 3006
CMD ["npm", "run", "dev"]

# Dependencies stage - for production
FROM base AS dependencies
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production --omit=dev \
    && npm cache clean --force

# Production build stage
FROM base AS production
ENV NODE_ENV=production \
    PORT=3006 \
    NODE_OPTIONS="--max-old-space-size=512"

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application files
COPY --chown=node:node package*.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node database ./database
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services
COPY --chown=node:node middleware ./middleware
COPY --chown=node:node migrations ./migrations

# Create necessary directories
RUN mkdir -p logs uploads \
    && chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]
