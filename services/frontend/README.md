# Enterprise Conversational Platform - Frontend

A runtime-configurable React TypeScript frontend for the enterprise conversational platform, built using Atomic Design principles.

## 🚀 Features

- **React 18** with TypeScript for type safety
- **Atomic Design** architecture for scalable UI components
- **Vite** for fast development and building
- **Modern CSS** with component-based styling
- **Real-time chat** interface with intent analysis
- **Responsive design** for mobile and desktop
- **Error handling** and loading states
- **API integration** with the Express backend

## 📁 Project Structure

```
src/
├── components/
│   ├── atoms/           # Basic UI elements (Button, Icon, TextArea, etc.)
│   ├── molecules/       # Component combinations (ChatMessage, Toast, etc.)
│   ├── organisms/       # Complex UI sections (ChatContainer, Sidebar, etc.)
│   ├── templates/       # Page layouts
│   └── pages/          # Full pages
├── hooks/              # Custom React hooks
├── services/           # API and external service integrations
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
├── styles/             # Global styles and themes
└── assets/             # Static assets
```

## 🛠 Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Axios** - HTTP client
- **Date-fns** - Date utilities
- **Zustand** - State management
- **CSS Modules** - Component styling

## 🚦 Getting Started

### Prerequisites

- Node.js 16+
- npm 8+

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd services/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env.local
   ```

4. Update environment variables:
   ```env
   VITE_API_BASE_URL=http://localhost:3001/api
   VITE_BANKING_SERVICE_URL=http://localhost:3005/api/v1
   VITE_AUTH_API_BASE_URL=http://localhost:3005/api/v1
   VITE_APP_NAME=Enterprise Conversational Platform
   VITE_APP_TAGLINE=Configurable AI assistants for secure enterprise workflows
   VITE_APP_VERSION=1.0.0
   ```

5. Optional runtime branding:
   Place a `runtime-config.json` file in `public/` or mount it at `/runtime-config.json` in production to override branding and endpoints without rebuilding the app.

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Building

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run start
```

## 🧪 Testing

Run tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## 🔧 Development Tools

### Code Quality

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Type checking

Run linting:
```bash
npm run lint
npm run lint:fix
```

Format code:
```bash
npm run format
```

Type checking:
```bash
npm run type-check
```

## 🎨 Atomic Design Structure

### Atoms
Basic building blocks of the UI:
- `Button` - Various button styles and states
- `Icon` - FontAwesome icon wrapper
- `TextArea` - Enhanced textarea with validation
- `LoadingSpinner` - Loading states

### Molecules
Combinations of atoms:
- `ChatMessage` - Individual chat message with metadata
- `Toast` - Notification system
- `IntentDisplay` - Intent analysis visualization

### Organisms
Complex UI sections:
- `ChatContainer` - Complete chat interface
- `Sidebar` - Intent analysis and history panel
- `Header` - Application navigation and status

## 🔗 API Integration

The frontend communicates with the Express backend through:

- **Base URL**: `http://localhost:3001/api` when the API gateway is running
- **Authentication**: Direct login against the banking service at `http://localhost:3005/api/v1`
- **Real-time**: Chat and session REST APIs are proxied by the gateway to the chat backend

### Key Services

- `ApiService` - Core API communication
- `ChatService` - Chat-specific operations
- `IntentService` - Intent analysis features

## 🚀 Deployment

### Environment Variables

Production environment variables:
```env
VITE_API_BASE_URL=https://api.yourbackend.com/api
VITE_BANKING_SERVICE_URL=https://banking.yourbackend.com/api/v1
VITE_AUTH_API_BASE_URL=https://identity.yourbackend.com/api/v1
VITE_APP_NAME=Enterprise Conversational Platform
VITE_APP_VERSION=1.0.0
```

For enterprise deployments, prefer a generated `runtime-config.json` over build-time branding variables. See the root-level `deployment-scripts/` directory and `docs/guides/productization.md`.

### Build Commands

```bash
# Production build
npm run build

# Serve the production build locally
npm run start
```

If you are running the lightweight Docker stack in `docker/docker-compose.local.yml`, the frontend container is wired directly to `http://localhost:3006/api` instead of the API gateway.

## 🤝 Contributing

1. Follow the Atomic Design principles
2. Use TypeScript for all new components
3. Write tests for complex logic
4. Follow the existing naming conventions
5. Update documentation for new features

## 📝 License

MIT License - see LICENSE file for details