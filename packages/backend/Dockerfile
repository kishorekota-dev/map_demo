# Backend Dockerfile
FROM node:18-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY packages/backend/package*.json ./
COPY packages/shared/package*.json ../shared/

# Install dependencies (including dev dependencies for TypeScript)
RUN npm install
RUN cd ../shared && npm install

# Copy shared package and build it
COPY packages/shared/ ../shared/
RUN cd ../shared && npm run build

# Copy backend source code
COPY packages/backend/ ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app ../shared
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["npm", "run", "dev"]
