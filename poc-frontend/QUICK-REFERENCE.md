# POC Frontend - Quick Reference

## Start Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run type-check
```

## URLs

- **Frontend**: http://localhost:3000
- **Chat Backend**: http://localhost:3006
- **Banking Service**: http://localhost:3010

## Test Credentials

- **Username**: `admin`
- **Password**: `Password123!`

## Key Features

### Authentication
- Login with banking credentials OR
- Use existing API token

### Chat
- Send messages
- View responses
- See intent detection
- Full message history

### Sessions
- Auto-create on first message
- Resume previous conversations
- View all unresolved sessions
- Mark as resolved
- End session
- Switch between sessions

## Quick Navigation

### Files to Know
| File | Purpose |
|------|---------|
| `src/services/authService.ts` | Authentication logic |
| `src/services/api.ts` | API client |
| `src/stores/authStore.ts` | Auth state |
| `src/hooks/useChat.tsx` | Chat logic |
| `src/pages/AuthPage.tsx` | Login page |
| `src/pages/ChatPage.tsx` | Chat interface |

### Component Hierarchy
```
App
├── /auth → AuthPage
│   ├── LoginForm
│   └── TokenInput
└── /chat → ChatPage (Protected)
    └── ChatContainer
        ├── Session Controls
        ├── Chat Messages
        ├── Chat Input
        └── Sidebar
            ├── Unresolved Sessions
            └── Intent Display
```

## API Integration

### Banking Service (Login Only)
```
POST /api/v1/auth/login
POST /api/v1/auth/refresh
```

### Chat Backend (All Operations)
```
POST   /api/sessions
GET    /api/sessions/:id
POST   /api/sessions/:id/resume
DELETE /api/sessions/:id
POST   /api/sessions/:id/resolve
POST   /api/sessions/:id/messages
GET    /api/sessions/:id/history
GET    /api/users/:userId/sessions
```

## Common Tasks

### Add New Component
1. Create in appropriate folder (atoms/molecules/organisms)
2. Export from index.ts
3. Use in parent component

### Add New API Endpoint
1. Add types to `types/index.ts`
2. Add method to `services/api.ts`
3. Use in component via `apiService`

### Update Styling
- Component CSS in component folder
- Global styles in `src/styles/global.css`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Login fails | Check backend is running on 3010 |
| Chat not working | Check backend is running on 3006 |
| CORS errors | Check backend CORS config |
| Token expired | Will auto-refresh or redirect to login |
| Session not found | Check database and backend logs |

## Environment Variables

```env
VITE_CHAT_BACKEND_URL=http://localhost:3006
VITE_BANKING_SERVICE_URL=http://localhost:3010/api/v1
VITE_APP_NAME=Banking Chatbot POC
VITE_APP_VERSION=1.0.0
```

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Zustand** - State management
- **Axios** - HTTP client
- **React Router** - Routing
- **date-fns** - Date formatting

## Documentation

- **README.md** - Complete documentation
- **SETUP-GUIDE.md** - Quick setup instructions
- **IMPLEMENTATION-SUMMARY.md** - Implementation details
- **QUICK-REFERENCE.md** - This file

## Support

Check the full documentation in README.md or backend OpenAPI specs for detailed API information.
