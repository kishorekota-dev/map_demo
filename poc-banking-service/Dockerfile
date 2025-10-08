# Banking Service Dockerfile
FROM node:18-alpine

# Install netcat for database wait script
RUN apk add --no-cache netcat-openbsd

# Set working directory
WORKDIR /app

# Copy package files (root and database)
COPY package*.json ./
COPY database/package*.json ./database/

# Install dependencies
RUN npm install --production && \
    cd database && npm install --production && cd ..

# Copy application files
COPY . .

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application with entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]
