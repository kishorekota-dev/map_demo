# POC Frontend Architecture & Integration

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Application                     │
│                   (React + TypeScript)                       │
│                    Port: 3000                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Authentication Layer                   │    │
│  │  - authService (login, token mgmt)                 │    │
│  │  - authStore (Zustand)                             │    │
│  │  - ProtectedRoute (route guard)                    │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │              API Integration Layer                  │    │
│  │  - apiService (HTTP client)                        │    │
│  │  - JWT interceptor                                 │    │
│  │  - Token refresh handler                           │    │
│  │  - Session management                              │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Business Logic Layer                   │    │
│  │  - useChat hook                                    │    │
│  │  - Session state management                        │    │
│  │  - Message handling                                │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Presentation Layer                     │    │
│  │  - Pages (AuthPage, ChatPage)                      │    │
│  │  - Organisms (LoginForm, ChatContainer)            │    │
│  │  - Molecules (SessionList, ChatMessage)            │    │
│  │  - Atoms (Button, Input, LoadingSpinner)           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└───────┬──────────────────────────────────────┬─────────────┘
        │                                      │
        │ Login Only                           │ All Chat Operations
        │ (Unauthenticated)                    │ (Authenticated)
        ↓                                      ↓
┌────────────────────┐              ┌────────────────────────┐
│  Banking Service   │              │    Chat Backend        │
│    Port: 3010      │              │      Port: 3006        │
├────────────────────┤              ├────────────────────────┤
│                    │              │                        │
│ • POST /auth/login │              │ • Session Management   │
│ • POST /auth/      │              │   - Create             │
│        refresh     │              │   - Resume             │
│                    │              │   - End/Resolve        │
│ Returns:           │              │                        │
│ - JWT tokens       │              │ • Message Operations   │
│ - User profile     │              │   - Send               │
│ - Roles/Perms      │              │   - History            │
└────────────────────┘              │                        │
                                    │ • Agent Orchestration  │
                                    │   - Intent detection   │
                                    │   - Multi-agent routing│
                                    │                        │
                                    │ • Database Persistence │
                                    │   - Sessions           │
                                    │   - Messages           │
                                    │   - Chat history       │
                                    └────────────────────────┘
```

## Authentication Flow

```
┌──────────┐                                              ┌──────────────┐
│  User    │                                              │   Banking    │
│  Browser │                                              │   Service    │
└────┬─────┘                                              └───────┬──────┘
     │                                                            │
     │ 1. Navigate to /                                          │
     ├──────────────────────────────────────────────────┐        │
     │                                                   │        │
     │ 2. Redirect to /auth (not authenticated)         │        │
     │◄──────────────────────────────────────────────────┘       │
     │                                                            │
     │ 3. Enter credentials + Submit                             │
     │                                                            │
     │ 4. POST /api/v1/auth/login                                │
     ├───────────────────────────────────────────────────────────>
     │                                                            │
     │ 5. Return JWT + User Profile                              │
     │◄───────────────────────────────────────────────────────────┤
     │                                                            │
     │ 6. Store in localStorage                                   │
     │ - poc_access_token                                         │
     │ - poc_refresh_token                                        │
     │ - poc_user_profile                                         │
     │                                                            │
     │ 7. Update authStore                                        │
     │                                                            │
     │ 8. Redirect to /chat                                       │
     ├──────────────────────────────────────────────────┐        │
     │                                                   │        │
     │ 9. ChatPage renders (authenticated)              │        │
     │◄──────────────────────────────────────────────────┘       │
     │                                                            │
```

## Chat & Session Flow

```
┌──────────┐                                    ┌────────────────┐
│  User    │                                    │  Chat Backend  │
│  Browser │                                    │   + Database   │
└────┬─────┘                                    └───────┬────────┘
     │                                                  │
     │ 1. Load ChatPage                                │
     │    - useChat hook initializes                   │
     │                                                  │
     │ 2. GET /api/users/:userId/sessions?type=unresolved
     ├─────────────────────────────────────────────────>
     │                                                  │
     │ 3. Return unresolved sessions                   │
     │◄─────────────────────────────────────────────────┤
     │    Display in sidebar                            │
     │                                                  │
     │ 4. User types message + Send                    │
     │                                                  │
     │ 5. POST /api/chat/message                       │
     │    Headers: Authorization: Bearer <token>       │
     │    Body: { content, userId }                    │
     ├─────────────────────────────────────────────────>
     │                                                  │
     │    Backend:                                      │
     │    - Auto-create session (if none)              │
     │    - Store message in DB                        │
     │    - Route to appropriate agent                 │
     │    - Generate response                          │
     │    - Store response in DB                       │
     │                                                  │
     │ 6. Return response + sessionId                  │
     │◄─────────────────────────────────────────────────┤
     │                                                  │
     │ 7. Display response in chat                     │
     │    - Update session state                        │
     │    - Show intent detection                       │
     │                                                  │
     │ 8. User clicks "Resume" on old session          │
     │                                                  │
     │ 9. POST /api/sessions/:id/resume                │
     ├─────────────────────────────────────────────────>
     │                                                  │
     │    Backend:                                      │
     │    - Load session from DB                        │
     │    - Load all messages                           │
     │    - Reactivate session                          │
     │                                                  │
     │ 10. Return session + full history               │
     │◄─────────────────────────────────────────────────┤
     │                                                  │
     │ 11. Display all previous messages               │
     │     Continue conversation                        │
     │                                                  │
```

## Component Architecture

```
┌────────────────────────────────────────────────────────┐
│                       App.tsx                          │
│                                                        │
│  Route:                                                │
│  - / → Navigate to /chat                              │
│  - /auth → AuthPage                                   │
│  - /chat → ProtectedRoute → ChatPage                  │
└────────────────────────────────────────────────────────┘
           │                           │
           │                           │
    ┌──────┴──────┐           ┌───────┴────────┐
    │             │           │                │
┌───▼─────────┐   │   ┌──────▼──────────────┐ │
│  AuthPage   │   │   │     ChatPage        │ │
│             │   │   │  (Protected)        │ │
├─────────────┤   │   ├─────────────────────┤ │
│             │   │   │                     │ │
│ ┌─────────┐ │   │   │  Header:            │ │
│ │  Tabs   │ │   │   │  - Branding         │ │
│ │ Sign In │ │   │   │  - Session ID       │ │
│ │   Use   │ │   │   │  - User + Logout    │ │
│ │  Token  │ │   │   │                     │ │
│ └─────────┘ │   │   │  ┌────────────────┐ │ │
│      │      │   │   │  │ ChatContainer  │ │ │
│      │      │   │   │  │                │ │ │
│  ┌───┴────┐ │   │   │  │ ┌────────────┐ │ │ │
│  │Login   │ │   │   │  │ │ Session Bar│ │ │ │
│  │Form    │ │   │   │  │ │ Controls   │ │ │ │
│  │        │ │   │   │  │ └────────────┘ │ │ │
│  │- Input │ │   │   │  │                │ │ │
│  │- Button│ │   │   │  │ ┌────────────┐ │ │ │
│  └────────┘ │   │   │  │ │ Messages   │ │ │ │
│      or     │   │   │  │ │ - User msg │ │ │ │
│  ┌────────┐ │   │   │  │ │ - Bot msg  │ │ │ │
│  │Token   │ │   │   │  │ │ - Intents  │ │ │ │
│  │Input   │ │   │   │  │ └────────────┘ │ │ │
│  │        │ │   │   │  │                │ │ │
│  │- Token │ │   │   │  │ ┌────────────┐ │ │ │
│  │- User  │ │   │   │  │ │ Chat Input │ │ │ │
│  │  Info  │ │   │   │  │ │ - Textarea │ │ │ │
│  │- Button│ │   │   │  │ │ - Send Btn │ │ │ │
│  └────────┘ │   │   │  │ └────────────┘ │ │ │
└─────────────┘   │   │  │                │ │ │
                  │   │  │ Sidebar:       │ │ │
                  │   │  │ ┌────────────┐ │ │ │
                  │   │  │ │ Unresolved │ │ │ │
                  │   │  │ │ Sessions   │ │ │ │
                  │   │  │ │ - Resume   │ │ │ │
                  │   │  │ └────────────┘ │ │ │
                  │   │  │ ┌────────────┐ │ │ │
                  │   │  │ │ Intent     │ │ │ │
                  │   │  │ │ Display    │ │ │ │
                  │   │  │ └────────────┘ │ │ │
                  │   │  └────────────────┘ │ │
                  │   └─────────────────────┘ │
                  └───────────────────────────┘
```

## State Management

```
┌──────────────────────────────────────────────────────┐
│            Global State (Zustand)                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  authStore:                                           │
│  ├─ isAuthenticated: boolean                         │
│  ├─ user: UserProfile | null                         │
│  ├─ isLoading: boolean                               │
│  ├─ error: string | null                             │
│  └─ actions:                                          │
│     ├─ login(credentials)                            │
│     ├─ setManualToken(token, userInfo)               │
│     ├─ logout()                                       │
│     ├─ checkAuth()                                    │
│     └─ clearError()                                   │
│                                                       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│        Component State (React Hooks)                  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  useChat():                                           │
│  ├─ messages: ChatMessage[]                          │
│  ├─ loading: boolean                                 │
│  ├─ intent: IntentAnalysis | undefined               │
│  ├─ session: SessionDetail | null                    │
│  ├─ unresolvedSessions: SessionDetail[]              │
│  └─ actions:                                          │
│     ├─ sendMessage(text)                             │
│     ├─ resumeSession(sessionId)                      │
│     ├─ endSession(reason)                            │
│     ├─ resolveSession(notes)                         │
│     └─ createNewSession()                            │
│                                                       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│         Persistent State (localStorage)               │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Keys:                                                │
│  ├─ poc_access_token: JWT access token               │
│  ├─ poc_refresh_token: JWT refresh token             │
│  └─ poc_user_profile: User profile JSON              │
│                                                       │
└──────────────────────────────────────────────────────┘
```

## Data Flow

```
User Action
    │
    ↓
Component
    │
    ↓
Hook (useChat)
    │
    ↓
API Service
    │
    ├─→ Add Auth Header (Bearer token)
    ├─→ Add Session Header (X-Session-ID)
    └─→ Add Request ID (X-Request-ID)
    │
    ↓
HTTP Request
    │
    ↓
Backend Service
    │
    ├─→ Validate JWT
    ├─→ Process Request
    ├─→ Store in Database
    └─→ Generate Response
    │
    ↓
HTTP Response
    │
    ├─→ Success: Update State
    └─→ Error: Handle/Display
    │
    ↓
Component Re-render
    │
    ↓
UI Update
```

## File Structure

```
poc-frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── atoms/
│   │   │   ├── Button/
│   │   │   ├── Input/
│   │   │   ├── Icon/
│   │   │   ├── LoadingSpinner/
│   │   │   └── TextArea/
│   │   ├── molecules/
│   │   │   ├── ChatMessage/
│   │   │   ├── IntentDisplay/
│   │   │   ├── SessionList/
│   │   │   ├── Toast/
│   │   │   └── TokenInput/
│   │   ├── organisms/
│   │   │   ├── ChatContainer/
│   │   │   └── LoginForm/
│   │   └── ProtectedRoute.tsx
│   ├── hooks/
│   │   └── useChat.tsx
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── AuthPage.css
│   │   ├── ChatPage.tsx
│   │   └── ChatPage.css
│   ├── services/
│   │   ├── api.ts
│   │   └── authService.ts
│   ├── stores/
│   │   └── authStore.ts
│   ├── styles/
│   │   └── global.css
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── SETUP-GUIDE.md
├── IMPLEMENTATION-SUMMARY.md
├── QUICK-REFERENCE.md
└── ARCHITECTURE.md (this file)
```

This architecture provides:
- ✅ Clear separation of concerns
- ✅ Scalable component structure
- ✅ Proper authentication flow
- ✅ Session management
- ✅ Type safety throughout
- ✅ Easy to maintain and extend
