# Configuration Guide

This guide covers all configuration options for POC Banking Chat.

## Environment Files

| File | Purpose |
|------|---------|
| `.env.example` | Template with all variables |
| `.env.development` | Local development |
| `.env.production` | Production deployment |
| `.env.test` | Test environment |

## Quick Setup

```bash
# Copy example file
cp .env.example .env.development

# Edit with your values
nano .env.development
```

## Configuration Reference

### General Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging verbosity | `info` |

### Database

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Full PostgreSQL connection URL | Yes |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | Yes |
| `DB_NAME` | Database name | `poc_banking` |

**Example:**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/poc_banking
```

### Redis

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |

### Security

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_EXPIRES_IN` | Token expiration | `24h` |
| `BCRYPT_ROUNDS` | Password hash rounds | `10` |

⚠️ **Important:** Change `JWT_SECRET` in production!

```env
# Generate secure secret
JWT_SECRET=$(openssl rand -hex 64)
```

### Service URLs

| Variable | Description | Default |
|----------|-------------|---------|
| `API_GATEWAY_URL` | API Gateway URL | `http://localhost:3001` |
| `CHAT_BACKEND_URL` | Chat service URL | `http://localhost:3006` |
| `BANKING_SERVICE_URL` | Banking API URL | `http://localhost:3005` |
| `NLU_SERVICE_URL` | NLU service URL | `http://localhost:3003` |
| `MCP_SERVICE_URL` | MCP service URL | `http://localhost:3004` |
| `AI_ORCHESTRATOR_URL` | AI service URL | `http://localhost:3007` |

### AI Services

#### OpenAI (AI Orchestrator)

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | For AI features |
| `OPENAI_MODEL` | Model to use | `gpt-4` |

Get your API key at: https://platform.openai.com/api-keys

#### DialogFlow (NLU Service)

| Variable | Description | Required |
|----------|-------------|----------|
| `DIALOGFLOW_PROJECT_ID` | GCP project ID | For NLU |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account path | For NLU |

Setup steps:
1. Create GCP project
2. Enable DialogFlow API
3. Create service account
4. Download JSON credentials
5. Set path in environment

```env
DIALOGFLOW_PROJECT_ID=my-project-id
GOOGLE_APPLICATION_CREDENTIALS=./credentials/dialogflow.json
```

### CORS

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Comma-separated origins | `http://localhost:3000` |

```env
# Multiple origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081,https://app.example.com
```

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `RATE_LIMIT_WINDOW_MS` | Window in milliseconds | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |

## Service-Specific Configuration

Each service can have its own `.env` file with service-specific settings.

### Frontend (`services/frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3006
VITE_BANKING_SERVICE_URL=http://localhost:3005/api/v1
```

### Banking Service (`services/banking-service/.env`)

```env
PORT=3005
DATABASE_URL=postgresql://postgres:password@localhost:5432/poc_banking
JWT_SECRET=your-secret
DAILY_TRANSFER_LIMIT=10000
FRAUD_THRESHOLD_AMOUNT=5000
```

### AI Orchestrator (`services/ai-orchestrator/.env`)

```env
PORT=3007
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://postgres:password@localhost:5432/poc_ai_orchestrator
MCP_SERVICE_URL=http://localhost:3004
```

## Docker Configuration

When using Docker, environment variables are set in:
- `docker/docker-compose.yml` - inline `environment` section
- `.env` file in project root - referenced with `${VARIABLE}`

```yaml
# docker-compose.yml
services:
  banking-service:
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/poc_banking
      - JWT_SECRET=${JWT_SECRET}  # From .env file
```

## Production Checklist

- [ ] Set strong `JWT_SECRET`
- [ ] Configure proper database credentials
- [ ] Set `NODE_ENV=production`
- [ ] Configure appropriate rate limits
- [ ] Set up SSL/TLS
- [ ] Configure CORS for production domains
- [ ] Set up logging aggregation
- [ ] Configure monitoring

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### JWT Secret Issues

```bash
# Verify JWT_SECRET is set
echo $JWT_SECRET

# Generate new secret
openssl rand -hex 64
```

### Service Cannot Connect

```bash
# Check service is running
curl http://localhost:3005/health

# Check firewall/network
nc -zv localhost 3005
```
