# POC NLU Service Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Chat Frontend                          │
│                  (User Interface)                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ User Message
                        ↓
┌─────────────────────────────────────────────────────────────┐
│                    Chat Backend                             │
│              (Message Orchestration)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ POST /api/nlu/analyze
                        │ {
                        │   user_input: "What's my balance?",
                        │   sessionId: "session-123",
                        │   userId: "user-456"
                        │ }
                        ↓
┌─────────────────────────────────────────────────────────────┐
│                    NLU Service                              │
│                   (Port: 3003)                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────┐        │
│  │         Routes (nlu.routes.js)                 │        │
│  │  - POST /api/nlu/analyze                       │        │
│  │  - POST /api/nlu/dialogflow                    │        │
│  │  - POST /api/nlu/banking                       │        │
│  └──────────────────┬─────────────────────────────┘        │
│                     │                                       │
│                     ↓                                       │
│  ┌────────────────────────────────────────────────┐        │
│  │      Controller (nlu.controller.js)            │        │
│  │  - analyzeUserInput()                          │        │
│  │  - detectIntent()                              │        │
│  │  - useDialogFlow()                             │        │
│  └──────────┬────────────────────┬────────────────┘        │
│             │                    │                          │
│             ↓                    ↓                          │
│  ┌───────────────────┐  ┌──────────────────────┐          │
│  │ DialogFlow Service│  │ Banking NLU Service  │          │
│  │                   │  │                      │          │
│  │ - detectIntent()  │  │ - detectBankingIntent│          │
│  │ - Real API Mode   │  │ - extractEntities    │          │
│  │ - Mock Mode       │  │ - Pattern Matching   │          │
│  │ - Auto Fallback   │  │                      │          │
│  └─────────┬─────────┘  └──────────┬───────────┘          │
│            │                       │                        │
│            └───────────┬───────────┘                        │
│                        │                                    │
│                        ↓                                    │
│  ┌────────────────────────────────────────────────┐        │
│  │          Combined Response                     │        │
│  │  {                                             │        │
│  │    intent: "check.balance",                    │        │
│  │    confidence: 0.92,                           │        │
│  │    dialogflow: {...},                          │        │
│  │    banking: {...},                             │        │
│  │    entities: [...],                            │        │
│  │    metadata: {...}                             │        │
│  │  }                                             │        │
│  └────────────────────────────────────────────────┘        │
│                                                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Response
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                    Chat Backend                             │
│            (Process Intent & Generate Response)             │
└─────────────────────────────────────────────────────────────┘
```

## DialogFlow Integration Modes

### Mode 1: Real API (Production)

```
User Input
    ↓
NLU Service
    ↓
Google Cloud DialogFlow API
    │
    ├─ Success → Return Intent + Entities
    │
    └─ Failure → Fallback to Mock Mode
```

**Requirements:**
- Google Cloud Project
- DialogFlow API enabled
- Service Account credentials
- `DIALOGFLOW_ENABLED=true`

### Mode 2: Mock Mode (Development/Testing)

```
User Input
    ↓
NLU Service
    ↓
Pattern-Based Mock Engine
    ↓
Return Intent + Entities
```

**Requirements:**
- No credentials needed
- `DIALOGFLOW_ENABLED=false`
- Automatic activation on API failure

## Data Flow

### Request Flow

```
1. Chat sends message
   └─> POST /api/nlu/analyze
       └─> Body: {user_input, sessionId, userId}

2. NLU Service receives request
   └─> Validates input
   └─> Logs request

3. Intent Detection
   ├─> Try DialogFlow API
   │   ├─> Success: Use real response
   │   └─> Failure: Use mock response
   │
   └─> Run Banking NLU in parallel
       └─> Pattern matching
       └─> Entity extraction

4. Combine Results
   └─> Merge DialogFlow + Banking analysis
   └─> Extract all entities
   └─> Add metadata

5. Return Response
   └─> JSON with intent, confidence, entities
```

### Response Structure

```
{
  success: true,
  data: {
    ┌─────────────────────────────────┐
    │ Primary Intent (DialogFlow)     │
    │ - intent: "check.balance"       │
    │ - confidence: 0.92              │
    └─────────────────────────────────┘
    
    ┌─────────────────────────────────┐
    │ DialogFlow Details              │
    │ - fulfillmentText               │
    │ - parameters                    │
    │ - languageCode                  │
    └─────────────────────────────────┘
    
    ┌─────────────────────────────────┐
    │ Banking Analysis                │
    │ - banking intent                │
    │ - banking confidence            │
    │ - banking entities              │
    └─────────────────────────────────┘
    
    ┌─────────────────────────────────┐
    │ Combined Entities               │
    │ - All entities from both sources│
    └─────────────────────────────────┘
    
    ┌─────────────────────────────────┐
    │ Metadata                        │
    │ - sessionId                     │
    │ - userId                        │
    │ - timestamp                     │
    └─────────────────────────────────┘
  }
}
```

## Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                     NLU Service                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Routes Layer                                            │
│  ┌────────────────────────────────────────────┐         │
│  │  /api/nlu/analyze      (Main Endpoint)     │         │
│  │  /api/nlu/dialogflow   (Direct DF)         │         │
│  │  /api/nlu/banking      (Banking Only)      │         │
│  │  /api/nlu/entities     (Entities Only)     │         │
│  │  /health               (Health Check)      │         │
│  └────────────────────────────────────────────┘         │
│                      ↓                                   │
│  Controller Layer                                        │
│  ┌────────────────────────────────────────────┐         │
│  │  analyzeUserInput()    (Orchestrator)      │         │
│  │  detectIntent()        (Intent Detection)  │         │
│  │  useDialogFlow()       (DF Integration)    │         │
│  │  extractEntities()     (Entity Extraction) │         │
│  └────────────────────────────────────────────┘         │
│                      ↓                                   │
│  Service Layer                                           │
│  ┌───────────────────┐  ┌──────────────────┐           │
│  │ DialogFlow Service│  │  Banking NLU     │           │
│  │                   │  │  Service         │           │
│  │ - Real API        │  │                  │           │
│  │ - Mock Mode       │  │ - Intent Detect  │           │
│  │ - Auto Fallback   │  │ - Entity Extract │           │
│  └───────────────────┘  └──────────────────┘           │
│                      ↓                                   │
│  Middleware Layer                                        │
│  ┌────────────────────────────────────────────┐         │
│  │  Validation, Error Handling, Logging       │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Deployment Architecture

### Development

```
┌─────────────┐
│ Developer   │
│ Machine     │
├─────────────┤
│ Node.js     │
│ npm start   │
│ Port: 3003  │
│             │
│ Mock Mode   │
│ (No GCP)    │
└─────────────┘
```

### Production

```
┌─────────────────────────────────────┐
│          Google Cloud               │
│  ┌───────────────────────────────┐ │
│  │     DialogFlow Agent          │ │
│  │  - Intents                    │ │
│  │  - Entities                   │ │
│  │  - Training Data              │ │
│  └──────────────┬────────────────┘ │
│                 │                   │
└─────────────────┼───────────────────┘
                  │ API
┌─────────────────┼───────────────────┐
│                 ↓                   │
│     NLU Service Container           │
│  ┌──────────────────────────────┐  │
│  │  Node.js Application         │  │
│  │  Port: 3003                  │  │
│  │  DialogFlow Enabled: true    │  │
│  │  Credentials: Service Account│  │
│  └──────────────────────────────┘  │
│                                     │
│  Load Balancer / Ingress            │
└─────────────────────────────────────┘
```

## Error Handling Flow

```
Request
  ↓
┌─────────────────┐
│ Input Validation│
└────┬───────┬────┘
     │       │
  Valid   Invalid
     │       │
     │       └─→ 400 Bad Request
     │
     ↓
┌──────────────────┐
│ Try DialogFlow   │
└────┬──────┬──────┘
     │      │
  Success  Fail
     │      │
     │      └─→ Fallback to Mock
     │           └─→ Log Warning
     │
     ↓
┌──────────────────┐
│ Process Response │
└────┬─────────────┘
     │
     ↓
┌──────────────────┐
│ Return 200 OK    │
└──────────────────┘
```

## Security Layers

```
┌────────────────────────────────────┐
│        Rate Limiting               │
│  200 requests / 15 min / IP        │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│        CORS Policy                 │
│  Allowed origins configured        │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│        Input Validation            │
│  Express-validator                 │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│        Helmet Security             │
│  Security headers                  │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│        API Processing              │
└────────────────────────────────────┘
```

---

**Document**: Architecture Overview  
**Version**: 1.0.0  
**Date**: October 11, 2025
