FROM node:18-alpine

WORKDIR /app

# Copy service files
COPY services/customer-service/package*.json ./
RUN npm install --only=production

COPY services/customer-service/ ./

# Expose port
EXPOSE 3010

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3010/health/live', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "server.js"]
