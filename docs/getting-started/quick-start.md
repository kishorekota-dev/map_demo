# Quick Start Guide

Get the POC Banking Chat application running in under 5 minutes.

## Prerequisites

- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher
- **PostgreSQL** v15+ (optional, for full functionality)
- **Docker** (optional, for containerized deployment)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/kishorekota-dev/map_demo.git
cd map_demo
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all services in the monorepo.

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.development
```

Edit `.env.development` with your settings (see [Configuration](configuration.md)).

### 4. Start Services

**Option A: All services at once**
```bash
npm run dev
```

**Option B: Individual services**
```bash
# Start specific services
npm run dev:frontend    # React Chat UI (port 3000)
npm run dev:gateway     # API Gateway (port 3001)
npm run dev:banking     # Banking Service (port 3005)
npm run dev:chat        # Chat Backend (port 3006)
```

### 5. Verify Installation

```bash
npm run health
```

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Customer chat interface |
| API Gateway | http://localhost:3001 | Main API endpoint |
| Agent Dashboard | http://localhost:8081 | Support agent interface |
| API Docs | http://localhost:3005/api/docs | Banking API documentation |

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Customer | customer1@example.com | Password123! |
| Agent | agent@example.com | Password123! |
| Admin | admin@example.com | Password123! |

## Next Steps

- [Full Configuration Guide](configuration.md)
- [Architecture Overview](../architecture/overview.md)
- [Development Guide](../guides/development.md)
- [API Reference](../api/gateway.md)

## Troubleshooting

### Port Already in Use

```bash
# Find and kill process on specific port
lsof -ti:3000 | xargs kill -9
```

### Database Connection Issues

```bash
# Ensure PostgreSQL is running
docker-compose -f docker/docker-compose.yml up -d postgres

# Or start a local PostgreSQL
pg_ctl start
```

### Missing Dependencies

```bash
# Clean install
rm -rf node_modules
npm install
```

For more troubleshooting tips, see [Troubleshooting Guide](../reference/troubleshooting.md).
