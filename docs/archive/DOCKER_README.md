# Enterprise Banking Docker Compose Setup

This Docker Compose configuration provides a complete enterprise banking ecosystem with ChatBot UI, backend services, and supporting infrastructure.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Enterprise Banking Ecosystem                 │
├─────────────────────────────────────────────────────────────────┤
│  Frontend Applications                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐   │
│  │ ChatBot UI  │ │ Customer    │ │ Agent Portal            │   │
│  │ :3002       │ │ Portal :3003│ │ :3004                   │   │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Backend Services                                               │
│  ┌─────────────┐ ┌─────────────┐                              │
│  │ Banking API │ │ MCP Server  │                              │
│  │ :3000       │ │ :3001       │                              │
│  └─────────────┘ └─────────────┘                              │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure                                                │
│  ┌─────────────┐ ┌─────────────┐                              │
│  │ PostgreSQL  │ │ Redis Cache │                              │
│  │ :5432       │ │ :6379       │                              │
│  └─────────────┘ └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- 8GB+ RAM available
- 10GB+ disk space

### Start Complete Ecosystem
```bash
# Make the script executable (if not already done)
chmod +x docker-run-enterprise.sh

# Start all services
./docker-run-enterprise.sh start-all
```

### Start Specific Service Groups
```bash
# Start only ChatBot and dependencies
./docker-run-enterprise.sh start-chatbot

# Start only core backend services
./docker-run-enterprise.sh start-core

# Start only UI applications
./docker-run-enterprise.sh start-ui
```

## 📊 Service Details

### Port Mapping
| Service | Port | Description |
|---------|------|-------------|
| Backend API | 3000 | Enterprise banking REST API |
| MCP Server | 3001 | Model Context Protocol server |
| ChatBot UI | 3002 | AI-powered banking assistant |
| Customer Portal | 3003 | Customer self-service portal |
| Agent Portal | 3004 | Staff/agent management interface |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache and session store |
| PgAdmin | 8080 | Database administration (dev profile) |
| Redis Commander | 8081 | Redis administration (dev profile) |

### Service Dependencies
```
ChatBot UI → MCP Server → Backend API → PostgreSQL
                      ↘               ↗
                        Redis Cache ←
```

## 🎯 ChatBot UI Features

### Authentication Integration
- Secure session-based authentication
- Role-based access control (RBAC)
- Token-based API communication
- Multi-factor authentication support

### AI & NLP Integration
- **DialogFlow NLP**: Natural language understanding
- **LangChain Agents**: Intelligent conversation management
- **Intent Detection**: Banking-specific intent recognition
- **Context Management**: Conversation state retention

### Banking Operations
- Account balance inquiries
- Transaction history
- Payment processing
- Card management
- Dispute handling
- Fraud reporting

### Security Features
- End-to-end encryption
- PII data protection
- Audit logging
- Rate limiting
- Session management

## 🔧 Configuration

### Environment Variables

#### ChatBot UI (.env.production)
```bash
# API Integration
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001

# DialogFlow Configuration
GOOGLE_PROJECT_ID=enterprise-banking-chatbot
GOOGLE_APPLICATION_CREDENTIALS=/app/config/dialogflow-service-account.json

# Security
JWT_SECRET=enterprise_banking_jwt_secret_2024_secure_key_for_production
ENCRYPTION_KEY=enterprise_banking_encryption_key_2024_very_secure_for_pii
```

#### DialogFlow Setup
1. Create a Google Cloud Project
2. Enable DialogFlow API
3. Create service account credentials
4. Copy credentials to `config/dialogflow-service-account.json`

### Volume Mounts
- `postgres_data`: Database persistence
- `redis_data`: Cache persistence
- `./config/dialogflow-service-account.json`: DialogFlow credentials
- `./packages/chatbot-ui/.env.local`: ChatBot configuration override

## 📚 Usage Examples

### Starting Services
```bash
# Complete ecosystem
./docker-run-enterprise.sh start-all

# Just ChatBot with dependencies
./docker-run-enterprise.sh start-chatbot

# Core services only
./docker-run-enterprise.sh start-core
```

### Monitoring
```bash
# Check service status
./docker-run-enterprise.sh status

# View all logs
./docker-run-enterprise.sh logs

# View specific service logs
./docker-run-enterprise.sh logs chatbot-ui
./docker-run-enterprise.sh logs backend
./docker-run-enterprise.sh logs mcp-server
```

### Management
```bash
# Stop all services
./docker-run-enterprise.sh stop

# Restart all services
./docker-run-enterprise.sh restart

# Build images
./docker-run-enterprise.sh build

# Clean up everything
./docker-run-enterprise.sh cleanup
```

## 🔐 Default Credentials

### Application Access
| Role | Email | Password | Description |
|------|-------|----------|-------------|
| Super Admin | superadmin@creditcard.com | admin123 | Full system access |
| Demo Customer | demo@creditcard.com | admin123 | Customer account |
| Support Agent | agent@creditcard.com | admin123 | Agent account |

### Database Access
- **PostgreSQL**: banking_user / secure_banking_pass_2024
- **Redis**: redis_secure_pass_2024
- **PgAdmin**: admin@enterprise-banking.com / admin_secure_pass_2024

## 🏥 Health Checks

### Service Health Endpoints
- Backend API: `http://localhost:3000/health`
- MCP Server: `http://localhost:3001/health`
- ChatBot UI: `http://localhost:3002/api/health`

### Health Check Response
```json
{
  "status": "healthy",
  "timestamp": "2024-09-03T10:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "backend": "connected",
    "mcp": "connected",
    "dialogflow": "configured",
    "redis": "connected"
  },
  "uptime": 123456
}
```

## 🔧 Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check Docker status
docker info

# Check service logs
./docker-run-enterprise.sh logs [service-name]

# Restart specific service
docker-compose -f docker-compose-enterprise.yml restart [service-name]
```

#### Database Connection Issues
```bash
# Check PostgreSQL health
docker-compose -f docker-compose-enterprise.yml exec postgres pg_isready -U banking_user

# Reset database
docker-compose -f docker-compose-enterprise.yml down -v
./docker-run-enterprise.sh start-all
```

#### ChatBot UI Issues
```bash
# Check MCP server connectivity
curl http://localhost:3001/health

# Check backend connectivity
curl http://localhost:3000/health

# Verify DialogFlow credentials
ls -la config/dialogflow-service-account.json
```

### Performance Tuning

#### Resource Requirements
- **Minimum**: 4GB RAM, 2 CPU cores
- **Recommended**: 8GB RAM, 4 CPU cores
- **Production**: 16GB RAM, 8 CPU cores

#### Database Optimization
```sql
-- Monitor database performance
SELECT * FROM pg_stat_activity;

-- Check table sizes
SELECT schemaname,tablename,pg_size_pretty(size) as size 
FROM pg_tables_size 
ORDER BY size DESC;
```

## 📈 Monitoring & Logging

### Log Locations
- Application logs: Container stdout/stderr
- Database logs: PostgreSQL container logs
- Cache logs: Redis container logs

### Monitoring Commands
```bash
# Resource usage
docker stats

# Container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Service logs with timestamps
docker-compose -f docker-compose-enterprise.yml logs -t --tail=100
```

## 🔄 Development vs Production

### Development Profile
```bash
# Start with development tools
docker-compose -f docker-compose-enterprise.yml --profile development up -d
```

Includes:
- PgAdmin (database administration)
- Redis Commander (cache administration)
- Development logging
- Hot reloading

### Production Profile
```bash
# Production deployment
docker-compose -f docker-compose-enterprise.yml up -d
```

Features:
- Optimized builds
- Security hardening
- Production logging
- Health checks

## 📞 Support

### Getting Help
1. Check service logs: `./docker-run-enterprise.sh logs`
2. Verify health checks: `curl http://localhost:3000/health`
3. Review configuration files
4. Check Docker resources: `docker system df`

### Performance Issues
1. Monitor resource usage: `docker stats`
2. Check database performance
3. Review application logs
4. Scale services if needed

For additional support, check the individual service README files in their respective package directories.
