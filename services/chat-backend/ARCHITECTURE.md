# POC Chat Backend - Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend Applications"
        A[Web UI<br/>Port 3000]
        B[Mobile App]
        C[Admin Portal]
    end

    subgraph "POC Chat Backend - Port 3006"
        D[HTTP Server<br/>Express.js]
        E[WebSocket Server<br/>Socket.IO]
        
        subgraph "Services Layer"
            F[ChatService]
            G[SessionManager]
            H[AgentOrchestrator]
            I[DatabaseService]
            J[SocketHandler]
        end
        
        subgraph "Agent Layer"
            K[NLP Agent<br/>Port 3002]
            L[NLU Agent<br/>Port 3003]
            M[Banking Agent<br/>Port 3005]
            N[MCP Agent<br/>Port 3004]
        end
    end

    subgraph "Data Layer"
        O[(PostgreSQL<br/>Port 5432)]
        P[(Redis Cache<br/>Port 6379)]
    end

    subgraph "Database Tables"
        Q[chat_sessions<br/>• session_id<br/>• user_id<br/>• is_active<br/>• is_resolved<br/>• conversation_context]
        R[chat_messages<br/>• message_id<br/>• session_id<br/>• content<br/>• direction<br/>• intent<br/>• sequence_number]
    end

    A -->|REST API<br/>WebSocket| D
    A -->|WebSocket| E
    B -->|REST API<br/>WebSocket| D
    C -->|REST API| D

    D --> F
    D --> G
    E --> J
    
    F -->|Create/Update| I
    G -->|Session Ops| I
    J -->|Messages| F
    
    F --> H
    H --> K
    H --> L
    H --> M
    H --> N
    
    I -->|Sequelize ORM| O
    F -->|Cache| P
    G -->|Cache| P
    
    O --> Q
    O --> R
    R -->|FK| Q

    style D fill:#4CAF50
    style E fill:#4CAF50
    style O fill:#2196F3
    style I fill:#FF9800
    style H fill:#9C27B0

    classDef newFeature fill:#FFD700,stroke:#FF6B6B,stroke-width:3px
    class I,Q,R newFeature
```

## Component Responsibilities

### HTTP/WebSocket Servers
- **HTTP Server (Express)**: RESTful API endpoints
- **WebSocket Server (Socket.IO)**: Real-time bidirectional communication

### Services Layer

#### ChatService
- Message processing and routing
- Conversation history management
- **Database persistence integration** ✨
- Event emission for real-time updates

#### SessionManager
- User session lifecycle management
- Session state tracking
- Authentication validation
- Session cleanup

#### DatabaseService ✨ NEW
- **PostgreSQL integration via Sequelize**
- Session CRUD operations
- Message persistence
- **Resume session functionality**
- History retrieval with pagination

#### AgentOrchestrator
- Multi-agent coordination
- Request routing to appropriate agents
- Response aggregation
- Fallback handling

#### SocketHandler
- WebSocket connection management
- Event handling and routing
- Client state management

### Agent Layer
- **NLP Agent**: Natural language processing
- **NLU Agent**: Intent and entity extraction
- **Banking Agent**: Banking operations
- **MCP Agent**: Model Context Protocol handling

### Data Layer

#### PostgreSQL Database ✨ NEW
- **chat_sessions**: Complete session information
- **chat_messages**: Full message history
- ACID compliance
- Indexed for performance

#### Redis Cache (Optional)
- Session caching
- Rate limiting
- Temporary data storage

## Data Flow: Message Processing

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant ChatBackend
    participant Database
    participant Agents
    
    User->>Frontend: Send message
    Frontend->>ChatBackend: POST /api/chat/message
    
    ChatBackend->>Database: Save incoming message
    Database-->>ChatBackend: Message saved
    
    ChatBackend->>Agents: Process with orchestrator
    Agents->>Agents: NLP → NLU → Banking
    Agents-->>ChatBackend: Agent response
    
    ChatBackend->>Database: Save response message
    Database-->>ChatBackend: Response saved
    
    ChatBackend->>Database: Update session metadata
    Database-->>ChatBackend: Session updated
    
    ChatBackend-->>Frontend: Return response
    Frontend-->>User: Display response
```

## Data Flow: Session Resume

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant ChatBackend
    participant Database
    
    User->>Frontend: Login
    Frontend->>ChatBackend: GET /users/{userId}/sessions?type=unresolved
    
    ChatBackend->>Database: Query unresolved sessions
    Database-->>ChatBackend: Return sessions list
    
    ChatBackend-->>Frontend: Unresolved sessions
    Frontend->>User: Show "Resume?" prompt
    
    User->>Frontend: Click "Resume"
    Frontend->>ChatBackend: POST /sessions/{sessionId}/resume
    
    ChatBackend->>Database: Load session + full history
    Database-->>ChatBackend: Session data + messages
    
    ChatBackend->>Database: Mark session as active
    Database-->>ChatBackend: Session reactivated
    
    ChatBackend-->>Frontend: Session + history
    Frontend-->>User: Display conversation
    
    User->>Frontend: Continue conversation
```

## Database Schema Relationships

```mermaid
erDiagram
    CHAT_SESSIONS ||--o{ CHAT_MESSAGES : contains
    
    CHAT_SESSIONS {
        uuid session_id PK
        string user_id
        boolean is_active
        boolean is_resolved
        string status
        timestamp last_activity
        integer message_count
        jsonb conversation_context
        jsonb state
        jsonb metadata
    }
    
    CHAT_MESSAGES {
        uuid message_id PK
        uuid session_id FK
        string user_id
        string direction
        text content
        string message_type
        string intent
        jsonb entities
        jsonb processing
        jsonb agent_info
        integer sequence_number
    }
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web Framework** | Express.js 4.x | HTTP server |
| **Real-time** | Socket.IO 4.x | WebSocket communication |
| **Database** | PostgreSQL 12+ | Persistent storage |
| **ORM** | Sequelize 6.x | Database operations |
| **Cache** | Redis 4.x | Session caching |
| **Auth** | JWT | Authentication |
| **Security** | Helmet.js | Security headers |
| **Logging** | Winston 3.x | Structured logging |
| **Validation** | Joi | Input validation |

## Deployment Architecture

```mermaid
graph LR
    subgraph "Load Balancer"
        LB[NGINX/ALB]
    end
    
    subgraph "Application Tier"
        APP1[Chat Backend 1<br/>:3006]
        APP2[Chat Backend 2<br/>:3006]
        APP3[Chat Backend 3<br/>:3006]
    end
    
    subgraph "Data Tier"
        DB[(PostgreSQL<br/>Primary)]
        DB2[(PostgreSQL<br/>Replica)]
        REDIS[(Redis<br/>Cluster)]
    end
    
    LB --> APP1
    LB --> APP2
    LB --> APP3
    
    APP1 --> DB
    APP2 --> DB
    APP3 --> DB
    
    APP1 --> REDIS
    APP2 --> REDIS
    APP3 --> REDIS
    
    DB --> DB2
    
    style APP1 fill:#4CAF50
    style APP2 fill:#4CAF50
    style APP3 fill:#4CAF50
    style DB fill:#2196F3
```

## Key Features Highlighted

### ✨ New Database Features
1. **Full Persistence**: All sessions and messages saved to PostgreSQL
2. **Session Resume**: Load and continue unresolved conversations
3. **Rich Metadata**: Context, state, and processing info stored
4. **Performance**: Optimized indexes for fast queries
5. **Reliability**: ACID compliance and data integrity

### 🔒 Security Features
1. JWT Authentication on all endpoints
2. Rate limiting (60 msg/min)
3. SQL injection prevention (Sequelize ORM)
4. Input validation and sanitization
5. Secure password hashing (bcrypt)

### 📊 Monitoring & Health
1. Database connectivity checks
2. Health endpoint with detailed status
3. Structured logging (Winston)
4. Error tracking and alerting
5. Performance metrics

## File Structure

```
poc-chat-backend/
├── database/
│   ├── config.js              ✨ Database configuration
│   ├── index.js               ✨ Sequelize setup
│   └── models/
│       ├── ChatSession.js     ✨ Session model
│       └── ChatMessage.js     ✨ Message model
├── services/
│   ├── chatService.js         🔄 Updated with DB
│   ├── sessionManager.js
│   ├── agentOrchestrator.js
│   ├── socketHandler.js
│   ├── databaseService.js     ✨ New DB service
│   └── logger.js
├── routes/
│   ├── api.js                 🔄 Added resume endpoints
│   ├── auth.js
│   └── health.js
├── openapi.yaml               ✨ API documentation
├── README.md                  ✨ Complete guide
├── IMPLEMENTATION-SUMMARY.md  ✨ This summary
├── QUICK-REFERENCE.md         ✨ Quick reference
├── test-integration.sh        ✨ Test script
├── server.js
├── package.json               🔄 Added DB deps
└── .env                       🔄 Added DB config

✨ = New files
🔄 = Updated files
```

---

**Architecture Status**: ✅ Complete and Production-Ready  
**Database Integration**: ✅ Fully Implemented  
**Documentation**: ✅ Comprehensive  
**Testing**: ✅ Automated Tests Included
