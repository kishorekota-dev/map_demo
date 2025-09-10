# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port 3001 for backend API
EXPOSE 3001

# Default command runs the full demo
CMD ["node", "index.js", "demo"]

# Add labels for documentation
LABEL description="MCP Sample Demo - Model Context Protocol demonstration"
LABEL version="1.0.0"
LABEL maintainer="demo@example.com"
