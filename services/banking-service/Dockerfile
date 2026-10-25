# Banking Service Dockerfile
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files (root and database)
COPY package*.json ./
COPY database/package*.json ./database/

# Install dependencies
RUN npm ci --omit=dev && \
    cd database && npm ci --omit=dev && cd ..

# Copy application files
COPY . .

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Create logs directory
RUN mkdir -p logs && chown node:node logs

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health/ready', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application with entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]
