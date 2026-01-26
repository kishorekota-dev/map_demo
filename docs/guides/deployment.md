# Deployment Guide

This guide covers deploying the POC Banking Chat application.

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|------------|
| Docker Compose | Development, Testing | Low |
| Docker Swarm | Small Production | Medium |
| Kubernetes | Large Scale Production | High |
| PM2 | Simple Production | Low |

## Docker Compose Deployment

### Quick Start

```bash
# Start all services
docker-compose -f docker/docker-compose.yml up -d

# View logs
docker-compose -f docker/docker-compose.yml logs -f

# Stop services
docker-compose -f docker/docker-compose.yml down
```

### Full Stack Deployment

```bash
# Build and start with all dependencies
docker-compose -f docker/docker-compose.full.yml up -d --build
```

### Environment Configuration

Create `.env.production`:
```env
NODE_ENV=production
JWT_SECRET=your-secure-secret-key
DATABASE_URL=postgresql://user:pass@postgres:5432/banking
OPENAI_API_KEY=your-openai-key
```

## PM2 Deployment

### Installation

```bash
npm install -g pm2
```

### Configuration

The `ecosystem.config.js` file defines all services:

```javascript
module.exports = {
  apps: [
    {
      name: 'api-gateway',
      cwd: './services/api-gateway',
      script: 'server.js',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    // ... other services
  ]
};
```

### Commands

```bash
# Start all services
pm2 start ecosystem.config.js --env production

# View status
pm2 status

# View logs
pm2 logs

# Restart all
pm2 restart all

# Stop all
pm2 stop all

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

## Manual Deployment

### Build Process

```bash
# Install dependencies
npm ci --production

# Build frontend
npm run build:frontend

# Build other services if needed
npm run build
```

### Running Services

```bash
# Set environment
export NODE_ENV=production

# Start each service
cd services/api-gateway && node server.js &
cd services/banking-service && node server.js &
cd services/chat-backend && node server.js &
# ... etc
```

## Database Setup

### PostgreSQL Setup

```bash
# Create databases
createdb poc_banking
createdb poc_ai_orchestrator

# Run migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

### Production Database

```bash
# Set database URL
export DATABASE_URL=postgresql://user:password@host:5432/poc_banking

# Run migrations
npm run db:migrate
```

## SSL/TLS Configuration

### Using Nginx as Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name chat.yourdomain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
    }

    location /socket.io {
        proxy_pass http://localhost:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

## Health Monitoring

### Health Check Endpoints

All services expose `/health`:
```bash
curl http://localhost:3001/health  # API Gateway
curl http://localhost:3005/health  # Banking Service
curl http://localhost:3006/health  # Chat Backend
```

### Monitoring Script

```bash
#!/bin/bash
# Add to crontab: */5 * * * * /path/to/health-check.sh

SERVICES=("3001" "3003" "3004" "3005" "3006" "3007")

for port in "${SERVICES[@]}"; do
    if ! curl -sf "http://localhost:$port/health" > /dev/null; then
        echo "Service on port $port is down!"
        # Send alert
    fi
done
```

## Logging

### Log Aggregation

Configure services to output JSON logs:
```env
LOG_FORMAT=json
LOG_LEVEL=info
```

### Centralized Logging with Docker

```yaml
# docker-compose.yml
services:
  banking-service:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Scaling

### Horizontal Scaling with PM2

```javascript
// ecosystem.config.js
{
  name: 'api-gateway',
  instances: 'max',  // Use all CPUs
  exec_mode: 'cluster'
}
```

### Load Balancing

Use nginx upstream for load balancing:
```nginx
upstream api_gateway {
    server 127.0.0.1:3001;
    server 127.0.0.1:3011;
    server 127.0.0.1:3021;
}
```

## Backup and Recovery

### Database Backup

```bash
# Backup
pg_dump poc_banking > backup_$(date +%Y%m%d).sql

# Restore
psql poc_banking < backup_20240101.sql
```

### Automated Backups

```bash
# Add to crontab
0 2 * * * pg_dump poc_banking | gzip > /backups/poc_banking_$(date +\%Y\%m\%d).sql.gz
```

## Security Checklist

- [ ] Change default JWT secret
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable database encryption
- [ ] Configure firewall rules
- [ ] Set up monitoring alerts
- [ ] Regular security updates

## Troubleshooting

See [Troubleshooting Guide](../reference/troubleshooting.md) for common deployment issues.
