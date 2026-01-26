# Development Guide

This guide covers development workflows for the POC Banking Chat application.

## Project Structure

```
poc-banking-chat/
├── services/                  # Microservices (npm workspaces)
│   ├── frontend/             # React/Vite chat UI
│   ├── api-gateway/          # API Gateway
│   ├── chat-backend/         # Socket.IO chat server
│   ├── banking-service/      # Banking domain APIs
│   ├── nlu-service/          # DialogFlow NLU
│   ├── mcp-service/          # MCP tools
│   ├── ai-orchestrator/      # LangGraph workflows
│   └── agent-ui/             # Agent dashboard
├── docs/                      # Documentation
├── scripts/                   # Build/deploy scripts
├── docker/                    # Docker configurations
├── api-docs/                  # OpenAPI specifications
└── package.json              # Root monorepo config
```

## Development Setup

### Prerequisites

```bash
# Verify Node.js version
node -v  # Should be >= 18.0.0

# Verify npm version
npm -v   # Should be >= 9.0.0
```

### Initial Setup

```bash
# Clone and install
git clone https://github.com/kishorekota-dev/map_demo.git
cd map_demo
npm install

# Validate environment
npm run validate
```

### Environment Configuration

1. Copy the example environment file:
```bash
cp .env.example .env.development
```

2. Configure service-specific environments:
```bash
# Each service has its own .env.example
cp services/frontend/.env.example services/frontend/.env
cp services/banking-service/.env.example services/banking-service/.env
# ... repeat for other services
```

## Running Services

### Development Mode (Hot Reload)

```bash
# Start all services with live reload
npm run dev

# Start specific service
npm run dev:frontend
npm run dev:banking
npm run dev:chat
```

### Production Mode

```bash
# Build all services
npm run build

# Start all services
npm run start
```

## Workspace Commands

The project uses npm workspaces. Run commands in specific services:

```bash
# Run command in specific workspace
npm run <script> -w services/<service-name>

# Examples
npm run test -w services/banking-service
npm run lint -w services/frontend
npm install axios -w services/chat-backend
```

## Code Style

### TypeScript/JavaScript

- Use ESLint with project config
- Prettier for formatting
- TypeScript strict mode for frontend

```bash
# Lint all services
npm run lint

# Format code
npm run format
```

### React Components (Frontend)

Follow **Atomic Design** principles:

```
components/
├── atoms/        # Basic elements (Button, Input)
├── molecules/    # Combinations (SearchBox, FormField)
├── organisms/    # Complex components (ChatWindow, Header)
├── templates/    # Page layouts
└── pages/        # Full pages
```

### Node.js Services

- Express route handlers in `/routes`
- Business logic in `/services`
- Database queries in `/database` or `/models`
- Middleware in `/middleware`

## Testing

### Unit Tests

```bash
# Run all tests
npm run test

# Run specific service tests
npm run test -w services/banking-service

# Watch mode
npm run test -- --watch -w services/frontend
```

### Integration Tests

```bash
# Start services first
npm run dev

# Run integration tests
npm run test:integration
```

### End-to-End Tests

```bash
npm run test:e2e
```

## Database Development

### Migrations

```bash
# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Reset database
npm run db:reset
```

### Adding New Migrations

Create migration files in `services/banking-service/database/migrations/`:

```
V1__initial_schema.sql
V2__add_fraud_table.sql
V3__add_indexes.sql
```

## Adding a New Service

1. Create service directory:
```bash
mkdir -p services/new-service/src
```

2. Initialize package.json:
```bash
cd services/new-service
npm init -y
```

3. Add to workspace (automatic with `services/*` glob)

4. Create standard structure:
```
services/new-service/
├── src/
│   ├── server.js
│   ├── routes/
│   ├── services/
│   └── middleware/
├── package.json
├── .env.example
└── README.md
```

5. Add health endpoint:
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'new-service' });
});
```

## Debugging

### VS Code Launch Configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Banking Service",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/services/banking-service",
      "program": "${workspaceFolder}/services/banking-service/server.js",
      "env": { "NODE_ENV": "development" }
    }
  ]
}
```

### Debug Logging

Set log level in `.env`:
```
LOG_LEVEL=debug
```

### Common Issues

See [Troubleshooting Guide](../reference/troubleshooting.md)

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring

### Commit Messages

Follow conventional commits:
```
feat: add payment processing
fix: resolve session timeout issue
docs: update API documentation
refactor: simplify auth middleware
```

### Pull Request Process

1. Create feature branch
2. Make changes with tests
3. Run linting and tests
4. Create PR with description
5. Address review feedback
6. Merge after approval

## Deployment

See [Deployment Guide](deployment.md) for production deployment instructions.
