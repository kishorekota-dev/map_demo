# 🏦 Credit Card Enterprise Monorepo

A comprehensive enterprise-grade credit card management system with multiple user interfaces and a robust backend API.

## 🏗️ Architecture Overview

This monorepo contains:

```
├── packages/
│   ├── backend/           # Enterprise API with MCP integration
│   ├── shared/            # Common utilities, types, and constants
│   ├── web-ui/            # Customer web portal (React + Vite)
│   ├── agent-ui/          # Agent/Admin dashboard (React + Vite)
│   └── chatbot-ui/        # Conversational interface (Next.js + MCP)
├── tools/                 # Development and deployment scripts
└── docs/                  # Documentation and guides
```

## 🎯 Applications

### 🔐 Backend API (`packages/backend`)
- **Technology**: Node.js + Express
- **Security**: Enterprise-grade RBAC with JWT authentication
- **Features**: 
  - 5-tier role hierarchy (SUPER_ADMIN → CUSTOMER)
  - Comprehensive credit card management
  - Model Context Protocol (MCP) integration
  - Complete audit logging
  - Advanced fraud detection

### 💻 Customer Web UI (`packages/web-ui`)
- **Technology**: React + TypeScript + Vite
- **Port**: 3000
- **Target Users**: Customers
- **Features**:
  - Account overview and management
  - Transaction history and search
  - Card management and controls
  - Dispute filing and tracking
  - Payment scheduling

### 👥 Agent UI (`packages/agent-ui`)
- **Technology**: React + TypeScript + Vite
- **Port**: 3001
- **Target Users**: Customer service agents, managers, admins
- **Features**:
  - Customer account management
  - Advanced transaction monitoring
  - Fraud case investigation
  - Dispute resolution tools
  - Analytics and reporting

### 🤖 ChatBot UI (`packages/chatbot-ui`)
- **Technology**: Next.js + TypeScript
- **Port**: 3002
- **Target Users**: All user types via conversational interface
- **Features**:
  - Natural language account queries
  - MCP-powered AI assistance
  - Context-aware responses
  - Multi-language support
  - Voice interface capabilities

### 📦 Shared Package (`packages/shared`)
- **Technology**: TypeScript
- **Purpose**: Common utilities, types, and constants
- **Features**:
  - Shared TypeScript interfaces
  - Common validation schemas
  - Utility functions
  - API client configurations

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/kishorekota-dev/map_demo.git
cd map_demo

# Install all dependencies
npm run install:all

# Migrate existing backend files (if upgrading)
npm run migrate:backend

# Build shared package
npm run build:shared
```

### Development

```bash
# Start all applications in development mode
npm run dev

# Or start individual applications
npm run dev:backend    # Backend API (port 3000)
npm run dev:web        # Customer Web UI (port 5173)
npm run dev:agent      # Agent UI (port 3001) 
npm run dev:chatbot    # ChatBot UI (port 3002)
```

### Production

```bash
# Build all packages
npm run build

# Start all applications
npm run start

# Or start individual applications
npm run start:backend
npm run start:web
npm run start:agent
npm run start:chatbot
```

## 🎛️ Available Scripts

### Root Level Scripts
```bash
npm run dev                 # Start all apps in development
npm run build              # Build all packages
npm run start              # Start all apps in production
npm run test               # Run tests for all packages
npm run lint               # Lint all packages
npm run clean              # Clean all build artifacts
npm run install:all        # Install dependencies for all packages
npm run setup              # Complete setup (install + build shared)
```

## 🔧 Configuration

### Environment Variables

Each package can have its own `.env` file:

#### Backend (`.env`)
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-jwt-secret
API_PREFIX=/api/v1
MCP_PORT=3001
```

#### Web UI (`.env.local`)
```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_APP_NAME=Credit Card Portal
```

#### Agent UI (`.env.local`)
```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_APP_NAME=Agent Dashboard
```

#### ChatBot UI (`.env.local`)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_MCP_URL=http://localhost:3001
```

## 🏷️ User Roles & Access

### Role Hierarchy
1. **SUPER_ADMIN** - Full system access, all UIs
2. **ADMIN** - Administrative access, Agent UI + ChatBot
3. **MANAGER** - Management access, Agent UI + ChatBot
4. **AGENT** - Customer service access, Agent UI + ChatBot
5. **CUSTOMER** - End user access, Web UI + ChatBot

### UI Access Matrix
| Role | Web UI | Agent UI | ChatBot UI |
|------|--------|----------|------------|
| SUPER_ADMIN | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ✅ |
| AGENT | ❌ | ✅ | ✅ |
| CUSTOMER | ✅ | ❌ | ✅ |

## 🛡️ Security Features

- **Enterprise-grade RBAC** with 5-tier role hierarchy
- **JWT authentication** with role-based permissions
- **Automatic data sanitization** based on user roles
- **Comprehensive audit logging** for compliance
- **API rate limiting** and request validation
- **Secure session management** across all UIs

## 📱 UI Features by Application

### Customer Web UI
- 📊 Account dashboard with balance and credit limit
- 💳 Card management (view, block, request replacement)
- 📋 Transaction history with search and filtering
- ⚖️ Dispute filing and status tracking
- 💰 Payment scheduling and management
- 🔔 Alert preferences and notifications

### Agent UI
- 👥 Customer search and account overview
- 🕵️ Advanced transaction monitoring
- 🚨 Fraud case investigation tools
- ⚖️ Dispute resolution workflow
- 📊 Analytics dashboard with KPIs
- 📝 Case management and notes

### ChatBot UI
- 💬 Natural language conversation interface
- 🧠 Context-aware responses using MCP
- 📱 Mobile-optimized chat experience
- 🔊 Voice input/output capabilities
- 🌐 Multi-language support
- 📊 Quick access to account information

## 🔌 API Integration

All UIs communicate with the backend through RESTful APIs:

```typescript
// Shared API client configuration
import { API_ENDPOINTS } from '@credit-card-enterprise/shared';

const apiClient = axios.create({
  baseURL: process.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Usage in any UI
const accounts = await apiClient.get(API_ENDPOINTS.ACCOUNTS);
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests for specific package
npm run test --workspace=packages/backend
npm run test --workspace=packages/web-ui
npm run test --workspace=packages/agent-ui
npm run test --workspace=packages/chatbot-ui
```

## 📝 Development Guidelines

### Code Structure
- Keep shared logic in `packages/shared`
- Use TypeScript interfaces from shared package
- Follow consistent naming conventions
- Implement proper error handling

### API Communication
- All UIs should use the shared API client
- Implement proper loading and error states
- Use React Query for data fetching and caching
- Handle authentication token refresh

### Styling
- Use Tailwind CSS for consistent styling
- Follow the design system guidelines
- Implement responsive design for mobile
- Use HeadlessUI for accessible components

## 🚀 Deployment

### Docker Support
```bash
# Build all containers
docker-compose build

# Start all services
docker-compose up
```

### Individual Deployment
Each package can be deployed independently:
- Backend: Node.js server
- Web UI: Static files (Vite build)
- Agent UI: Static files (Vite build)  
- ChatBot UI: Next.js application

## 📚 Documentation

- [Backend API Documentation](./packages/backend/README.md)
- [Security Implementation Guide](./SECURITY-IMPLEMENTATION.md)
- [MCP Integration Guide](./README-MCP.md)
- [UI Development Guide](./docs/ui-development.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

## 🎉 Success! 

Your Credit Card Enterprise Monorepo is now ready for development. Each UI provides a specialized experience while leveraging the same powerful backend infrastructure.

**Happy coding! 🚀**
