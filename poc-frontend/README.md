# Banking Chatbot POC - Frontend# Chatbot POC - React Frontend



A full-featured React + TypeScript chatbot frontend with authentication, session management, and real-time chat capabilities integrated with the POC Chat Backend.A modern React TypeScript frontend for the Chatbot POC with Intent Detection, built using Atomic Design principles.



## Features## 🚀 Features



### 🔐 Authentication- **React 18** with TypeScript for type safety

- **Login via Banking Service**: Authenticate directly with your banking credentials- **Atomic Design** architecture for scalable UI components

- **API Token Support**: Alternatively, use a JWT token for authentication- **Vite** for fast development and building

- **Secure Token Storage**: Tokens stored securely in localStorage- **Modern CSS** with component-based styling

- **Automatic Token Refresh**: Seamlessly refresh expired tokens- **Real-time chat** interface with intent analysis

- **Protected Routes**: Only authenticated users can access the chat- **Responsive design** for mobile and desktop

- **Error handling** and loading states

### 💬 Chat Capabilities- **API integration** with the Express backend

- **Real-time Messaging**: Send and receive messages instantly

- **Intent Detection**: AI-powered intent detection with confidence scores## 📁 Project Structure

- **Agent Orchestration**: Multi-agent system for handling different banking queries

- **Message History**: Full conversation history persisted in database```

- **Typing Indicators**: Visual feedback while messages are being processedsrc/

├── components/

### 📊 Session Management│   ├── atoms/           # Basic UI elements (Button, Icon, TextArea, etc.)

- **Session Creation**: Automatic session creation on first message│   ├── molecules/       # Component combinations (ChatMessage, Toast, etc.)

- **Session Resume**: Continue previous unresolved conversations│   ├── organisms/       # Complex UI sections (ChatContainer, Sidebar, etc.)

- **Unresolved Sessions List**: View and resume any unresolved sessions│   ├── templates/       # Page layouts

- **Session Controls**: End or mark sessions as resolved│   └── pages/          # Full pages

- **Session Status**: Track active, pending, and resolved sessions├── hooks/              # Custom React hooks

- **Multi-session Support**: Switch between multiple conversations├── services/           # API and external service integrations

├── utils/              # Utility functions

### 🎨 User Interface├── types/              # TypeScript type definitions

- **Atomic Design Pattern**: Components organized as Atoms → Molecules → Organisms├── styles/             # Global styles and themes

- **Responsive Design**: Works on desktop, tablet, and mobile devices└── assets/             # Static assets

- **Modern UI**: Clean, professional interface with Tailwind-inspired styling```

- **Loading States**: Skeleton loaders and spinners for better UX

- **Error Handling**: User-friendly error messages and recovery## 🛠 Technology Stack



## Architecture- **React 18** - UI framework

- **TypeScript** - Type safety

### Component Structure- **Vite** - Build tool and dev server

- **Axios** - HTTP client

```- **Date-fns** - Date utilities

src/- **Zustand** - State management

├── components/- **CSS Modules** - Component styling

│   ├── atoms/                 # Basic UI building blocks

│   │   ├── Button/## 🚦 Getting Started

│   │   ├── Input/

│   │   ├── LoadingSpinner/### Prerequisites

│   │   └── ...

│   ├── molecules/             # Combinations of atoms- Node.js 16+

│   │   ├── ChatMessage/- npm 8+

│   │   ├── IntentDisplay/

│   │   ├── SessionList/### Installation

│   │   ├── TokenInput/

│   │   └── Toast/1. Navigate to the frontend directory:

│   ├── organisms/             # Complex UI sections   ```bash

│   │   ├── ChatContainer/   cd poc-frontend

│   │   └── LoginForm/   ```

│   └── ProtectedRoute.tsx     # Route guard component

├── pages/                     # Page components2. Install dependencies:

│   ├── AuthPage.tsx   ```bash

│   └── ChatPage.tsx   npm install

├── hooks/                     # Custom React hooks   ```

│   └── useChat.tsx           # Main chat logic hook

├── services/                  # API & business logic3. Create environment file:

│   ├── api.ts                # Chat backend API client   ```bash

│   └── authService.ts        # Authentication service   cp .env.example .env.local

├── stores/                    # State management   ```

│   └── authStore.ts          # Zustand auth store

├── types/                     # TypeScript definitions4. Update environment variables:

│   └── index.ts   ```env

└── styles/                    # Global styles   VITE_API_BASE_URL=http://localhost:3001/api

    └── global.css   VITE_APP_NAME=Chatbot POC

```   VITE_APP_VERSION=1.0.0

   ```

### API Integration

### Development

The frontend integrates with two backend services:

Start the development server:

1. **POC Banking Service** (http://localhost:3010)```bash

   - **Purpose**: Authentication onlynpm run dev

   - **Endpoint**: `/api/v1/auth/login````

   - **Usage**: Login with username/password to obtain JWT token

The application will be available at `http://localhost:3002`

2. **POC Chat Backend** (http://localhost:3006)

   - **Purpose**: All chat operations### Building

   - **Endpoints**:

     - `POST /api/sessions` - Create sessionBuild for production:

     - `GET /api/sessions/:id` - Get session details```bash

     - `POST /api/sessions/:id/resume` - Resume sessionnpm run build

     - `POST /api/sessions/:id/messages` - Send message```

     - `GET /api/sessions/:id/history` - Get conversation history

     - `GET /api/users/:userId/sessions` - Get user sessionsPreview production build:

     - `POST /api/sessions/:id/resolve` - Mark session as resolved```bash

     - `DELETE /api/sessions/:id` - End sessionnpm run preview

```

## Getting Started

## 🧪 Testing

### Prerequisites

Run tests:

- Node.js >= 16.0.0```bash

- npm >= 8.0.0npm test

- POC Chat Backend running on port 3006```

- POC Banking Service running on port 3010

Run tests with coverage:

### Installation```bash

npm run test:coverage

1. **Install dependencies**```

   ```bash

   cd poc-frontend## 🔧 Development Tools

   npm install

   ```### Code Quality



2. **Configure environment variables**- **ESLint** - Code linting

   ```bash- **Prettier** - Code formatting

   cp .env.example .env- **TypeScript** - Type checking

   ```

Run linting:

   Update `.env` with your backend URLs:```bash

   ```envnpm run lint

   # Chat Backend URL - Main backend service for all chat operationsnpm run lint:fix

   VITE_CHAT_BACKEND_URL=http://localhost:3006```



   # Banking Service URL - Only used for direct login authenticationFormat code:

   VITE_BANKING_SERVICE_URL=http://localhost:3010/api/v1```bash

npm run format

   # Application Info```

   VITE_APP_NAME=Banking Chatbot POC

   VITE_APP_VERSION=1.0.0Type checking:

   ``````bash

npm run type-check

3. **Start development server**```

   ```bash

   npm run dev## 🎨 Atomic Design Structure

   ```

### Atoms

   The application will be available at `http://localhost:3000`Basic building blocks of the UI:

- `Button` - Various button styles and states

### Build for Production- `Icon` - FontAwesome icon wrapper

- `TextArea` - Enhanced textarea with validation

```bash- `LoadingSpinner` - Loading states

npm run build

```### Molecules

Combinations of atoms:

The optimized production build will be in the `dist/` directory.- `ChatMessage` - Individual chat message with metadata

- `Toast` - Notification system

## Usage- `IntentDisplay` - Intent analysis visualization



### Authentication### Organisms

Complex UI sections:

#### Option 1: Login with Banking Credentials- `ChatContainer` - Complete chat interface

- `Sidebar` - Intent analysis and history panel

1. Navigate to the application- `Header` - Application navigation and status

2. You'll be redirected to the authentication page

3. Click the **Sign In** tab## 🔗 API Integration

4. Enter your banking username and password

5. Click **Sign In**The frontend communicates with the Express backend through:



**Default Test Credentials:**- **Base URL**: `http://localhost:3001/api`

- Username: `admin`- **Authentication**: Session-based with JWT tokens

- Password: `Password123!`- **Real-time**: HTTP polling (WebSocket ready)



#### Option 2: Use API Token### Key Services



1. Navigate to the authentication page- `ApiService` - Core API communication

2. Click the **Use Token** tab- `ChatService` - Chat-specific operations

3. Paste your JWT access token- `IntentService` - Intent analysis features

4. (Optional) Enter username and user ID for display purposes

5. Click **Set Token**## 🚀 Deployment



### Using the Chat### Environment Variables



1. **Start a Conversation**Production environment variables:

   - Type a message in the input field```env

   - Press Enter or click SendVITE_API_BASE_URL=https://api.yourbackend.com/api

   - The bot will respond with appropriate informationVITE_APP_NAME=Chatbot POC

VITE_APP_VERSION=1.0.0

2. **View Intent Detection**```

   - Intent information appears in the right sidebar

   - Shows detected intent and confidence score### Build Commands



3. **Manage Sessions**```bash

   - View current session ID in the header# Production build

   - See session status (active, pending, resolved)npm run build

   - Access session controls via the "More" button

# Deploy to static hosting

4. **Resume Unresolved Sessions**npm run deploy

   - Unresolved sessions appear in the right sidebar```

   - Click **Resume** on any session to continue that conversation

   - All message history is loaded automatically## 🤝 Contributing



5. **Create New Session**1. Follow the Atomic Design principles

   - Click **New Session** in the session bar2. Use TypeScript for all new components

   - Start a fresh conversation3. Write tests for complex logic

   - Previous session is saved and can be resumed later4. Follow the existing naming conventions

5. Update documentation for new features

6. **End or Resolve Session**

   - Click **More** to expand session controls## 📝 License

   - **Mark as Resolved**: Marks conversation as complete

   - **End Session**: Closes the sessionMIT License - see LICENSE file for details

### Logging Out

Click the **Logout** button in the top-right corner to sign out and clear your authentication token.

## Key Components

### useChat Hook

The `useChat` hook manages all chat-related state and operations:

```typescript
const {
  messages,              // Array of chat messages
  loading,               // Loading state for API calls
  intent,                // Current detected intent
  session,               // Active session details
  unresolvedSessions,    // List of unresolved sessions
  sendMessage,           // Send a new message
  resumeSession,         // Resume an existing session
  endSession,            // End current session
  resolveSession,        // Mark session as resolved
  createNewSession,      // Create a new session
} = useChat();
```

### Authentication Flow

1. User provides credentials or token
2. `authService.login()` calls Banking Service `/auth/login`
3. JWT tokens are stored in localStorage
4. `authStore` updates authentication state
5. User is redirected to chat page
6. All subsequent API calls include `Authorization: Bearer <token>` header
7. Token automatically refreshes when expired

### Session Flow

1. User sends first message
2. Chat backend auto-creates session
3. Session ID stored and displayed
4. All messages linked to session
5. Session persisted to database
6. User can resume session later
7. Unresolved sessions shown in sidebar

## API Service Architecture

The `ApiService` class handles all backend communication:

- **Authentication Interceptor**: Automatically adds JWT token to requests
- **Token Refresh**: Handles 401 errors by refreshing token
- **Session Management**: Tracks and manages active session
- **Error Handling**: Standardized error handling with custom events
- **Request Tracing**: Adds unique request IDs for debugging

## Type Safety

All API responses and component props are fully typed with TypeScript:

- `types/index.ts` contains all type definitions
- Types match OpenAPI specification exactly
- Full IntelliSense support in VS Code
- Compile-time type checking prevents errors

## Development

### Available Scripts

- `npm run dev` - Start development server with HMR
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run type-check` - Run TypeScript compiler without emitting
- `npm run format` - Format code with Prettier

## Troubleshooting

### Authentication Issues

**Problem**: Login fails with 401 error
- **Solution**: Verify banking service is running on port 3010
- Check credentials are correct
- Ensure `/api/v1/auth/login` endpoint is accessible

### Session Issues

**Problem**: Sessions not persisting
- **Solution**: Verify chat backend database is running
- Check chat backend logs for errors
- Ensure session endpoints are working

### CORS Errors

**Problem**: CORS errors in browser console
- **Solution**: Configure backend CORS to allow frontend origin
- Add `http://localhost:3000` to CORS allowed origins
- Check backend CORS middleware configuration

## License

ISC
