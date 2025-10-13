# POC Frontend - Quick Setup Guide

## Overview

This is a comprehensive guide to quickly set up and run the POC Banking Chatbot frontend application.

## Quick Start (5 minutes)

### 1. Prerequisites Check

Make sure you have the following running:

```bash
# Check Node.js version (needs >= 16.0.0)
node --version

# POC Banking Service should be running on port 3010
curl http://localhost:3010/health

# POC Chat Backend should be running on port 3006
curl http://localhost:3006/health
```

### 2. Install Dependencies

```bash
cd poc-frontend
npm install
```

### 3. Configure Environment

The `.env` file has already been created with the correct settings:

```env
VITE_CHAT_BACKEND_URL=http://localhost:3006
VITE_BANKING_SERVICE_URL=http://localhost:3010/api/v1
VITE_APP_NAME=Banking Chatbot POC
VITE_APP_VERSION=1.0.0
```

### 4. Start the Application

```bash
npm run dev
```

The application will start on `http://localhost:3000`

### 5. Login

Navigate to `http://localhost:3000` in your browser. You'll be redirected to the login page.

**Test Credentials:**
- Username: `admin`
- Password: `Password123!`

Alternatively, you can use the **Use Token** tab if you already have a JWT token.

## Architecture Summary

### Authentication Flow

1. **Login Page** → POC Banking Service (`/api/v1/auth/login`)
2. Receive JWT token + user profile
3. Store token in localStorage
4. Redirect to Chat Page
5. All subsequent requests to POC Chat Backend include token

### API Integration

```
Frontend → POC Chat Backend (3006) → All Chat Operations
            ↓
        POC Banking Service (3010) → Login Only
```

**Key Point:** Only the login uses the Banking Service directly. All other operations go through the Chat Backend.

### Component Hierarchy

```
App
├── AuthPage (Unauthenticated)
│   ├── LoginForm
│   └── TokenInput
└── ChatPage (Protected)
    └── ChatContainer
        ├── ChatMessage (list)
        ├── SessionList (sidebar)
        ├── IntentDisplay (sidebar)
        └── ChatInput
```

## Features Implemented

✅ **Authentication**
- Login with banking credentials
- Manual token input
- Token storage & refresh
- Protected routes

✅ **Chat Operations**
- Send/receive messages
- Real-time responses
- Message history
- Intent detection

✅ **Session Management**
- Auto-create sessions
- Resume previous sessions
- View unresolved sessions
- End/resolve sessions
- Session status tracking

✅ **UI/UX**
- Responsive design
- Loading states
- Error handling
- Session controls
- User profile display

## Key Files

| File | Purpose |
|------|---------|
| `src/services/authService.ts` | Authentication logic, token management |
| `src/services/api.ts` | API client for chat backend |
| `src/stores/authStore.ts` | Global authentication state |
| `src/hooks/useChat.tsx` | Chat logic and session management |
| `src/pages/AuthPage.tsx` | Login/token input page |
| `src/pages/ChatPage.tsx` | Main chat interface |
| `src/components/organisms/ChatContainer/ChatContainer.tsx` | Chat UI |

## API Endpoints Used

### Banking Service (Authentication Only)
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Token refresh

### Chat Backend (All Chat Operations)
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session
- `POST /api/sessions/:id/resume` - Resume session
- `GET /api/users/:userId/sessions` - Get user sessions
- `POST /api/sessions/:id/messages` - Send message
- `GET /api/sessions/:id/history` - Get history
- `POST /api/sessions/:id/resolve` - Resolve session
- `DELETE /api/sessions/:id` - End session

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

## Common Issues & Solutions

### Issue: "Cannot connect to backend"
**Solution:** Ensure both backend services are running:
```bash
# Check POC Chat Backend
curl http://localhost:3006/health

# Check POC Banking Service  
curl http://localhost:3010/health
```

### Issue: "Login fails with 401"
**Solution:** 
- Verify credentials: `admin` / `Password123!`
- Check Banking Service is accessible
- Look at backend logs for errors

### Issue: "CORS errors in console"
**Solution:**
- Ensure backend CORS allows `http://localhost:3000`
- Check backend CORS configuration
- Restart backend services after config changes

### Issue: "Session not resuming"
**Solution:**
- Check chat backend database is running
- Verify session exists in database
- Check browser console for errors

## Testing the Application

### Test Authentication
1. Go to `http://localhost:3000`
2. Login with admin credentials
3. Verify redirect to chat page
4. Check token in localStorage (DevTools → Application → Local Storage)

### Test Chat Functionality
1. Send a message: "What is my account balance?"
2. Verify bot response appears
3. Check session ID in header
4. Send another message to test conversation flow

### Test Session Management
1. Send multiple messages in a session
2. Click "New Session" to start fresh
3. Check unresolved sessions in sidebar
4. Click "Resume" on previous session
5. Verify all messages are loaded

### Test Session Controls
1. Click "More" in session bar
2. Click "Mark as Resolved"
3. Verify session status changes
4. Test "End Session" functionality

## Production Deployment

### Build
```bash
npm run build
```

### Deploy
The `dist/` folder contains the production build. Deploy to:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Any static hosting service

### Environment Variables for Production
Update `.env` with production URLs:
```env
VITE_CHAT_BACKEND_URL=https://your-chat-backend.com
VITE_BANKING_SERVICE_URL=https://your-banking-service.com/api/v1
```

## Next Steps

1. **Start the application** and test basic chat
2. **Explore session management** features
3. **Test authentication** with different credentials
4. **Review the code** structure and patterns
5. **Customize** for your specific needs

## Support

For detailed information, see the main [README.md](./README.md)

For backend API documentation, see:
- `poc-chat-backend/openapi.yaml`
- `poc-banking-service/openapi.yaml`
