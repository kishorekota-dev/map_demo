# 🏦 Enterprise Banking Platform

A comprehensive, BIAN-compliant enterprise banking system with advanced PII security, KYC/AML compliance, and real-time transaction processing.

## 🚀 Overview

This enterprise banking platform has been enhanced from a basic monorepo credit card application into a full-scale banking system following industry standards:

- **BIAN Compliance**: Banking Industry Architecture Network standards implementation
- **PII Security**: Advanced encryption for sensitive customer data (SSN, EIN, etc.)
- **KYC/AML**: Complete Know Your Customer and Anti-Money Laundering workflows
- **Real-time Processing**: Transaction authorization, fraud detection, and payment processing
- **Comprehensive Audit**: Complete audit trails for regulatory compliance

## 🏗️ Architecture

### Monorepo Structure
```
packages/
├── backend/           # Enterprise Banking API (Node.js/Express)
├── web-ui/           # Customer Portal (React)
├── agent-ui/         # Staff Portal (React)
├── chatbot-ui/       # AI Assistant (React)
└── shared/           # Shared utilities and types
```

### Database Schema
- **Enhanced PostgreSQL**: BIAN-compliant schema with comprehensive customer management
- **PII Encryption**: AES-256 encryption for sensitive data
- **Audit Logging**: Complete transaction and activity tracking
- **Performance**: Optimized indexes and triggers

### Services
- **PostgreSQL 15**: Primary database with enhanced security
- **Redis 7**: Caching and session management
- **Backend API**: Enterprise-grade REST API
- **Multiple UIs**: Customer, agent, and chatbot interfaces

## 🛡️ Security Features

### Data Protection
- **PII Encryption**: All sensitive data encrypted at rest
- **Secure Authentication**: JWT tokens with proper validation
- **Password Security**: bcrypt with 12 rounds
- **Rate Limiting**: API protection against abuse

### Compliance
- **BIAN Standards**: Banking industry architecture compliance
- **PCI DSS**: Credit card data security standards
- **GDPR**: Privacy regulation compliance
- **SOX**: Sarbanes-Oxley audit requirements

### Fraud Detection
- **Real-time Scoring**: Transaction risk assessment
- **Velocity Checking**: Pattern analysis for suspicious activity
- **Merchant Validation**: High-risk merchant category monitoring
- **Geographic Analysis**: International transaction flagging

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for development)
- Git

### 1. Clone and Setup
```bash
git clone <repository>
cd map_demo
```

### 2. Start Enterprise Banking Platform
```bash
# Start all services with enterprise configuration
docker-compose -f docker-compose-enterprise.yml up -d

# Or for development with admin tools
docker-compose -f docker-compose-enterprise.yml --profile development up -d
```

### 3. Verify Installation
```bash
# Check all services are healthy
docker-compose -f docker-compose-enterprise.yml ps

# Check API health
curl http://localhost:3000/health

# Check database status
curl http://localhost:3000/api/v1/admin/database/status
```

### 4. Run Comprehensive Tests
```bash
# Execute enterprise API test suite
./test-enterprise-api.sh
```

## 📋 API Endpoints

### Authentication & Customer Management
```
POST /api/v1/auth/register          # Customer registration with KYC
POST /api/v1/auth/login             # Customer/admin authentication
POST /api/v1/auth/change-password   # Password management
GET  /api/v1/auth/me                # Current user profile
```

### Customer Operations
```
GET  /api/v1/customers/profile      # Get own profile
PUT  /api/v1/customers/profile      # Update profile
GET  /api/v1/customers              # Search customers (admin)
PUT  /api/v1/customers/:id/kyc      # Update KYC status (admin)
```

### Account & Card Management
```
GET  /api/v1/accounts               # List customer accounts
GET  /api/v1/accounts/:id           # Account details
GET  /api/v1/accounts/:id/cards     # Account cards
GET  /api/v1/cards/:id              # Card details
```

### Transaction Processing
```
GET  /api/v1/accounts/:id/transactions    # Transaction history
POST /api/v1/transactions/authorize       # Transaction authorization
POST /api/v1/transactions/capture         # Transaction capture
GET  /api/v1/transactions/:id             # Transaction details
```

### Payment Processing
```
POST /api/v1/accounts/:id/payments   # Schedule payment
GET  /api/v1/accounts/:id/payments   # Payment history
GET  /api/v1/payments/:id            # Payment details
POST /api/v1/payments/:id/cancel     # Cancel payment
```

### Fraud & Risk Management
```
GET  /api/v1/accounts/:id/fraud-risk # Risk assessment
GET  /api/v1/fraud/alerts           # Fraud alerts
POST /api/v1/fraud/report           # Report fraud
```

## 🏦 Banking Features

### Customer Management
- **Individual & Business**: Support for personal and business customers
- **KYC Workflow**: Complete identity verification process
- **PII Protection**: Encrypted storage of sensitive information
- **Risk Assessment**: Automated risk rating and monitoring

### Credit Account Lifecycle
- **Product Management**: Multiple credit card products
- **Account Opening**: BIAN-compliant account creation
- **Credit Decisions**: Automated underwriting
- **Account Monitoring**: Real-time balance and limit management

### Transaction Processing
- **Authorization**: Real-time transaction approval
- **Capture & Settlement**: Multi-stage transaction processing
- **Fraud Detection**: Advanced risk scoring
- **International Support**: Multi-currency and foreign exchange

### Payment Processing
- **Multiple Methods**: ACH, wire transfer, debit card payments
- **Scheduled Payments**: Recurring payment management
- **Payment Allocation**: Intelligent payment distribution
- **Real-time Processing**: Instant payment confirmation

## 🔧 Development

### Local Development Setup
```bash
# Install dependencies
npm install

# Start development database
docker-compose up postgres redis -d

# Start backend in development mode
cd packages/backend
npm run dev

# Start frontend applications
cd packages/web-ui && npm start     # Port 3001
cd packages/agent-ui && npm start   # Port 3002
cd packages/chatbot-ui && npm start # Port 3003
```

### Database Management
```bash
# Connect to database
docker exec -it enterprise-banking-db psql -U banking_user -d enterprise_banking

# Run migrations
npm run migrate

# Seed data
npm run seed
```

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run API tests
./test-enterprise-api.sh

# Run security tests
npm run test:security
```

## 📊 Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Backend API | 3000 | Enterprise Banking API |
| Customer Portal | 3001 | Customer web interface |
| Agent Portal | 3002 | Staff web interface |
| AI Assistant | 3003 | Chatbot interface |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache and sessions |
| PgAdmin | 8080 | Database admin (dev) |
| Redis Commander | 8081 | Cache admin (dev) |

## 🔐 Default Credentials

### Admin Access
- **Email**: admin@enterprise-banking.com
- **Password**: AdminPass123!

### Test Customer (after seeding)
- **Email**: john.enterprise@testbank.com
- **Password**: SecurePass123!

## 📈 Monitoring & Observability

### Health Checks
```bash
# API Health
curl http://localhost:3000/health

# Database Status
curl http://localhost:3000/api/v1/admin/database/status

# Service Status
docker-compose -f docker-compose-enterprise.yml ps
```

### Logs
```bash
# View API logs
docker logs enterprise-banking-api -f

# View database logs
docker logs enterprise-banking-db -f

# View all service logs
docker-compose -f docker-compose-enterprise.yml logs -f
```

## 🚨 Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Check database status
docker exec enterprise-banking-db pg_isready -U banking_user

# Restart database
docker-compose -f docker-compose-enterprise.yml restart postgres
```

**Permission Errors**
```bash
# Fix file permissions
chmod +x test-enterprise-api.sh
chmod +x packages/backend/database/docker-init-enhanced.sh
```

**Port Conflicts**
```bash
# Check port usage
lsof -i :3000
lsof -i :5432

# Kill conflicting processes
sudo kill -9 <PID>
```

### Reset Environment
```bash
# Stop all services
docker-compose -f docker-compose-enterprise.yml down

# Remove volumes (WARNING: destroys data)
docker-compose -f docker-compose-enterprise.yml down -v

# Rebuild and restart
docker-compose -f docker-compose-enterprise.yml up --build -d
```

## 📚 Documentation

### API Documentation
- Interactive API docs available at: `/api/docs` (when enabled)
- Postman collection: `postman/Enterprise-Banking-API.json`

### Technical Documentation
- Architecture: `docs/architecture.md`
- Security: `docs/security.md`
- BIAN Implementation: `docs/bian-compliance.md`
- Data Model: `docs/data-model.md`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following coding standards
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎯 Roadmap

### Phase 1: Core Banking ✅
- Customer management with PII encryption
- Account and card management
- Transaction processing
- Payment processing
- Basic fraud detection

### Phase 2: Advanced Features
- [ ] Real-time notifications
- [ ] Advanced fraud ML models
- [ ] Open Banking APIs
- [ ] Mobile SDK
- [ ] Advanced reporting

### Phase 3: Enterprise Integration
- [ ] Core banking system integration
- [ ] Regulatory reporting
- [ ] Advanced analytics
- [ ] Multi-tenant support
- [ ] Global compliance

---

## 🏆 Enterprise Banking Platform Status

✅ **BIAN-Compliant Architecture**  
✅ **Advanced PII Encryption**  
✅ **KYC/AML Compliance**  
✅ **Real-time Transaction Processing**  
✅ **Comprehensive Fraud Detection**  
✅ **Multi-UI Architecture**  
✅ **Enterprise Security**  
✅ **Audit Logging**  
✅ **API Testing Suite**  
✅ **Docker Containerization**  

**🚀 Ready for Enterprise Banking Operations!**
