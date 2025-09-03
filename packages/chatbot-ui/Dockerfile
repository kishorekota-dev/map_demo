# Enterprise Banking ChatBot UI Dockerfile
# Multi-stage build for production optimization

# Stage 1: Dependencies
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY packages/chatbot-ui/package*.json ./
COPY packages/shared/package*.json ../shared/

# Install dependencies
RUN npm ci --only=production

# Stage 2: Builder
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/../shared/node_modules ../shared/node_modules

# Copy shared package and build it
COPY packages/shared/ ../shared/
RUN cd ../shared && npm run build

# Copy chatbot-ui source code
COPY packages/chatbot-ui/ ./

# Copy production environment
COPY packages/chatbot-ui/.env.production ./.env.local

# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:18-alpine AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3002

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy necessary files from builder
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env.local ./.env.local

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static

# Copy shared package build
COPY --from=builder --chown=nodejs:nodejs /app/../shared/dist ../shared/dist

# Create config directory for DialogFlow credentials
RUN mkdir -p ./config && chown nodejs:nodejs ./config

# Change ownership and switch to non-root user
USER nodejs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "server.js"]
