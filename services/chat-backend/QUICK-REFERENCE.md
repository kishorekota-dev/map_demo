# POC Chat Backend - Quick Reference Guide

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd poc-chat-backend
npm install

# 2. Configure database (in .env)
DB_HOST=localhost
DB_NAME=poc_banking
DB_USER=postgres
DB_PASSWORD=postgres

# 3. Start service
npm start

# 4. Test
./test-integration.sh
```

## 📡 Essential Endpoints

### Get Unresolved Sessions
```bash
GET /api/users/{userId}/sessions?type=unresolved
```

### Resume Session
```bash
POST /api/sessions/{sessionId}/resume
```

### Send Message
```bash
POST /api/chat/message
Headers: X-Session-ID
Body: { "message": "...", "type": "text" }
```

### Mark Resolved
```bash
POST /api/sessions/{sessionId}/resolve
Body: { "notes": "..." }
```

## 🗄️ Database Tables

### chat_sessions
- Stores all chat sessions
- Tracks active/resolved status
- Contains conversation context

### chat_messages
- Stores all messages
- Links to sessions via session_id
- Contains processing metadata

## 🔧 Configuration

### Required Environment Variables
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=poc_banking
DB_USER=postgres
DB_PASSWORD=postgres
```

### Optional Settings
```env
DB_POOL_MAX=10
DB_POOL_MIN=2
DB_LOGGING=true
DB_SSL=false
```

## 📊 Session States

| State | Description |
|-------|-------------|
| `active` | Currently in use |
| `pending` | Awaiting user response |
| `resolved` | All queries answered |
| `expired` | Session timed out |
| `terminated` | Manually ended |

## 🔍 Testing

### Health Check
```bash
curl http://localhost:3006/health
```

### Check Database
```bash
psql -U postgres -d poc_banking -c "SELECT COUNT(*) FROM chat_sessions;"
```

### Run Full Tests
```bash
./test-integration.sh
```

## 📝 Common Operations

### Create Session
```javascript
POST /api/sessions
{
  "userId": "user_123",
  "metadata": {}
}
```

### Get User's Unresolved Sessions
```javascript
GET /api/users/user_123/sessions?type=unresolved

Response:
{
  "count": 2,
  "sessions": [
    {
      "sessionId": "sess_abc",
      "isResolved": false,
      "messageCount": 5,
      "recentMessages": [...]
    }
  ]
}
```

### Resume Session with History
```javascript
POST /api/sessions/sess_abc/resume

Response:
{
  "success": true,
  "session": {...},
  "history": [
    { "content": "What's my balance?", "direction": "incoming" },
    { "content": "Let me check...", "direction": "outgoing" }
  ]
}
```

## 🔐 Authentication

All API endpoints require JWT authentication:

```bash
# 1. Login
curl -X POST http://localhost:3006/auth/login \
  -d '{"username":"user","password":"pass"}'

# 2. Use token
curl -H "Authorization: Bearer <token>" \
  http://localhost:3006/api/sessions
```

## 🐛 Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check database exists
psql -U postgres -l | grep poc_banking
```

### Port Already in Use
```bash
# Find process
lsof -i :3006

# Kill it
kill -9 <PID>
```

### Tables Not Created
Service auto-creates tables on startup. Check logs:
```bash
tail -f logs/chat-backend.log
```

## 📖 Full Documentation

- `README.md` - Complete guide
- `openapi.yaml` - API specification
- `IMPLEMENTATION-SUMMARY.md` - Implementation details

## 🆘 Support

Check logs: `logs/chat-backend.log`  
Health: `http://localhost:3006/health`  
API Docs: `openapi.yaml`
