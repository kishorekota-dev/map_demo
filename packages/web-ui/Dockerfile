# Web UI Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY packages/web-ui/package*.json ./
COPY packages/shared/package*.json ../shared/

# Install dependencies
RUN npm install
RUN cd ../shared && npm install

# Copy shared package and build it
COPY packages/shared/ ../shared/
RUN cd ../shared && npm run build

# Copy web-ui source code
COPY packages/web-ui/ ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app ../shared
USER nodejs

# Expose port
EXPOSE 3000

# Start the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
