# Local Development Setup

This guide helps you run the Enterprise Banking application locally for debugging purposes, excluding Web-UI and Agent-UI.

## 🏗️ Architecture

**Local Services:**
- **Backend API** (Port 3000) - Express.js REST API
- **MCP Server** (Port 3001) - Model Context Protocol server
- **ChatBot UI** (Port 3002) - Next.js chat interface

**Docker Services:**
- **PostgreSQL** (Port 5432) - Database
- **Redis** (Port 6379) - Cache & sessions

## 🚀 Quick Start

### 1. Start Database Services
```bash
# Start PostgreSQL and Redis in Docker
docker compose up -d postgres redis
```

### 2. Start All Local Services
```bash
# Start all services with one command
./start-local.sh
```

### 3. Access Applications
- **ChatBot UI**: http://localhost:3002
- **Backend API**: http://localhost:3000/api/v1
- **MCP Server**: http://localhost:3001
- **API Health Check**: http://localhost:3000/api/v1/health

## 🛠️ Individual Service Management

### Start Individual Services
```bash
# Start only the backend
./dev.sh backend

# Start only the MCP server
./dev.sh mcp

# Start only the chatbot UI
./dev.sh chatbot
```

### Stop All Services
```bash
./stop-local.sh
```

### Restart All Services
```bash
./restart-local.sh
```

## 📁 Project Structure

```
packages/
├── backend/           # Express.js API & MCP Server
│   ├── server.js      # Main API server
│   ├── mcp-server.js  # MCP protocol server
│   ├── .env.local     # Local environment config
│   └── package.json
├── chatbot-ui/        # Next.js Chat Interface
│   ├── pages/         # Next.js pages
│   ├── src/           # React components
│   ├── .env.local     # Local environment config
│   └── package.json
└── shared/            # Shared utilities
```

## 🔧 Environment Configuration

Environment files are automatically created:
- **Root**: `.env.local` - Global settings
- **Backend**: `packages/backend/.env.local` - API config
- **ChatBot**: `packages/chatbot-ui/.env.local` - UI config

### Key Environment Variables

**Database:**
- `DATABASE_URL`: PostgreSQL connection
- `REDIS_URL`: Redis connection

**API:**
- `PORT`: Service port (3000, 3001, 3002)
- `API_PREFIX`: API route prefix (/api/v1)
- `JWT_SECRET`: Authentication secret

**Debugging:**
- `LOG_LEVEL`: debug
- `NODE_ENV`: development

## 📊 Monitoring & Debugging

### Service Logs
```bash
# View real-time logs
tail -f logs/backend.log
tail -f logs/mcp-server.log
tail -f logs/chatbot-ui.log

# View all logs together
tail -f logs/*.log
```

### Health Checks
```bash
# Check backend API
curl http://localhost:3000/api/v1/health

# Check MCP server
curl http://localhost:3001/health

# Check chatbot UI
curl http://localhost:3002
```

### Process Management
```bash
# Check running processes
ps aux | grep node

# Check port usage
lsof -i :3000
lsof -i :3001
lsof -i :3002
```

## 🗄️ Database Management

### Database Access
```bash
# Connect to PostgreSQL
psql postgresql://credit_card_user:credit_card_password@localhost:5432/credit_card_enterprise

# Connect to Redis
redis-cli
```

### Database Operations
```bash
# Reset and seed database
cd packages/backend
npm run db:reset

# Seed enterprise data
npm run enterprise:setup
```

## 🐛 Debugging Tips

### Authentication Issues
1. Check JWT configuration in `.env.local` files
2. Verify database seeding completed successfully
3. Test login with demo credentials:
   - **Customer**: john.doe@example.com / password123
   - **Admin**: admin@enterprise-banking.com / admin123

### API Connection Issues
1. Verify all services are running: `./status-local.sh`
2. Check CORS configuration in backend `.env.local`
3. Ensure `NEXT_PUBLIC_API_BASE_URL` points to correct backend

### MCP Server Issues
1. Check MCP server logs: `tail -f logs/mcp-server.log`
2. Verify MCP server health: `curl http://localhost:3001/health`
3. Check backend → MCP communication

### Hot Reloading
- **Backend**: Uses `nodemon` - auto-restarts on file changes
- **ChatBot UI**: Uses Next.js dev mode - hot reloads on changes
- **MCP Server**: Uses `nodemon` - auto-restarts on file changes

## 🧪 Testing

### API Testing
```bash
# Test authentication
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.doe@example.com","password":"password123"}'

# Test account balance (with auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/accounts/balance
```

### Integration Testing
```bash
# Run backend tests
cd packages/backend
npm test

# Run chatbot UI tests
cd packages/chatbot-ui
npm test
```

## 🔄 Development Workflow

1. **Make Code Changes** - Edit files in `packages/*/src/`
2. **Auto Reload** - Services automatically restart/reload
3. **Check Logs** - Monitor `logs/*.log` for issues
4. **Test Changes** - Use browser dev tools + API testing
5. **Debug Issues** - Use Node.js debugger or console.log

### VS Code Debug Configuration
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/packages/backend/server.js",
      "env": {
        "NODE_ENV": "development"
      },
      "cwd": "${workspaceFolder}/packages/backend"
    }
  ]
}
```

## 🚨 Troubleshooting

### Common Issues

**Port Already in Use:**
```bash
# Kill process on specific port
lsof -ti:3000 | xargs kill -9
```

**Database Connection Failed:**
```bash
# Restart PostgreSQL
docker compose restart postgres
```

**Redis Connection Failed:**
```bash
# Restart Redis
docker compose restart redis
```

**Module Not Found:**
```bash
# Reinstall dependencies
cd packages/backend && npm install
cd packages/chatbot-ui && npm install
cd packages/shared && npm install
```

### Reset Everything
```bash
# Stop all local services
./stop-local.sh

# Stop Docker services
docker compose down

# Clear logs
rm -rf logs/

# Restart everything
docker compose up -d postgres redis
./start-local.sh
```

## 📞 Support

If you encounter issues:
1. Check service logs in `logs/` directory
2. Verify environment variables in `.env.local` files
3. Ensure Docker services are running
4. Check port availability
5. Review this README for troubleshooting steps
