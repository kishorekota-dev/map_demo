FIG 1


```mermaid
flowchart TD
  U[User] --> UI["Chat UI<br/>(Chat Frontend)"]

  subgraph Backend["Chat Backend"]
    AUTH["Authentication & Session<br/>Validation"]
    SESS["Session Store Access<br/>(conversation history,<br/>preferences)"]
    ROUTE["Message Routing<br/>& Rate Limiting"]
    OUT["Return Response<br/>to Chat UI"]
  end

  subgraph NLULayer["NLU Services"]
    NLU_PIPE["Hybrid NLU Pipeline<br/>(Primary NLU, Secondary Model,<br/>LLM-based extraction)"]
  end

  subgraph Orchestrator["AI Orchestrator"]
    CTX["Session & Context<br/>Management"]
    WF["Graph-Based Workflow Engine<br/>(intent analysis, entity checks,<br/>HITL, write confirmations)"]
    PROMPTS["Prompt Construction<br/>(system/user prompts,<br/>examples, safety)"]
    RESP["LLM Invocation &<br/>Response Post-Processing"]
  end

  subgraph MCP["MCP Service Layer"]
    VAL["Schema Validation<br/>& Parameter Checking"]
    REG["Tool Registry<br/>(names, schemas,<br/>metadata, discovery)"]
    MASK["Masking & Redaction<br/>(sensitive fields)"]
    LOG["Tool Invocation Logging<br/>(audit, metrics)"]
  end

  subgraph Domain["Domain Services & Data"]
    SVC["Domain Microservices<br/>(Account, Transaction, Card, etc.)"]
    DB[("Primary Database")]
    SSTORE[("Session Store")]
    AUDIT[("Audit & Observability Store")]
  end

  subgraph PolicyLayer["Policy & Governance"]
    POLICY["Policy Engine<br/>(data exposure,<br/>role/jurisdiction rules)"]
  end

  UI -->|HTTPS/WebSocket<br/>user messages| AUTH
  AUTH --> SESS
  AUTH --> SSTORE
  SESS --> ROUTE
  ROUTE --> NLU_PIPE
  NLU_PIPE -->|intent + entities| CTX
  CTX --> WF

  WF -->|tool invocations<br/>with parameters| VAL
  VAL --> REG
  VAL --> MASK
  VAL --> LOG
  LOG --> AUDIT

  MASK --> SVC
  SVC --> DB
  DB -->|structured results| POLICY

  POLICY --> PROMPTS
  PROMPTS --> RESP
  RESP --> OUT
  OUT --> UI
  UI --> U
```


```mermaid
flowchart TD
  U[User] --> UI2[Chat Frontend]
  UI2 --> BE2[Chat Backend]
  BE2 --> AUTH2[Authenticate & Load Session]

  AUTH2 --> NLU2["Hybrid NLU - primary, secondary, LLM-based"]
  NLU2 -->|intent + entities| BE2
  BE2 -->|message + context + intent| ORCH2[AI Orchestrator]

  ORCH2 --> DEC2{"Confident & entities complete?"}

  DEC2 -->|No| CLAR2["Ask Clarification / Collect Entities"]
  CLAR2 --> ORCH2

  DEC2 -->|Yes| WF2["Select Workflow & Tools via Config"]
  WF2 --> TOOLSEL2["Select MCP Tools from Registry"]
  TOOLSEL2 --> MCP2[MCP Service Layer]
  MCP2 --> DOM2[Domain Services]
  DOM2 --> MCP2

  MCP2 --> MASK2["Mask / Redact Sensitive Data"]
  MASK2 --> PROMPT2["Construct LLM Prompt - system + user + tools"]
  PROMPT2 --> LLM2["LLM Invocation"]
  LLM2 --> RESP2["Validate & Format Response"]
  RESP2 --> BE2
  BE2 --> UI2
  UI2 --> U
```


- **FIG. 3** is a sequence diagram illustrating interactions among the chat frontend, chat backend, AI orchestrator, NLU service, MCP server, and domain microservices for a sample request.

%%
```mermaid
sequenceDiagram
  participant U as User
  participant UI as Chat Frontend
  participant BE as Chat Backend
  participant ORCH as AI Orchestrator
  participant NLU as NLU Services
  participant MCP as MCP Server
  participant SVC as Domain Services

  U->>UI: Enter message
  UI->>BE: POST /chat (message, token)
  BE->>BE: Validate auth & load session

  BE->>NLU: Detect intent & entities
  NLU-->>BE: Intent, confidence, entities

  BE->>ORCH: Forward message + context + intent
  ORCH->>ORCH: Check confidence, entities
  ORCH->>U: (via UI/BE) Clarification (if needed)
  U-->>ORCH: Additional details (via UI/BE)

  ORCH->>ORCH: Select workflow & MCP tools
  ORCH->>MCP: Invoke tool(s) with params
  MCP->>SVC: Call domain API(s)
  SVC-->>MCP: Structured results
  MCP->>MCP: Mask/redact sensitive fields
  MCP-->>ORCH: Tool outputs

  ORCH->>ORCH: Build prompts (system + user + tools)
  ORCH->>ORCH: Invoke LLM & post-process
  ORCH-->>BE: Final response payload
  BE-->>UI: Chatbot response
  UI-->>U: Render response
``` 
%%


- **FIG. 5** is a flow diagram illustrating error handling, circuit breaking, and human escalation for low-confidence or failed tool executions.

```mermaid
flowchart TD
  START5([Start]) --> NLU5["NLU / Intent Detection"]
  NLU5 --> DEC5{"Low confidence or unknown?"}

  DEC5 -->|Yes| CLAR5["Ask Clarification"]
  CLAR5 --> RETRY5{"Max attempts reached?"}
  RETRY5 -->|No| NLU5
  RETRY5 -->|Yes| ESC5["Offer Human Escalation"]

  DEC5 -->|No| TOOL5["Invoke MCP Tool"]
  TOOL5 --> RES5{"Tool success?"}

  RES5 -->|No| CB5["Update Failure Counters & Circuit Breaker"]
  CB5 --> CBOPEN5{"Circuit open?"}
  CBOPEN5 -->|Yes| MSG5["Return Fallback Message + Escalation"]
  CBOPEN5 -->|No| RETRYT5["Retry with Backoff"]
  RETRYT5 --> TOOL5

  RES5 -->|Yes| RESP5["Generate LLM Response"]
  RESP5 --> END5([Return Response to User])

  MSG5 --> END5
```

- **FIG. 6** is a flow diagram illustrating the policy engine workflow for data governance, masking, and redaction of sensitive tool outputs.

```mermaid
flowchart TD
  START6([Start]) --> INPUT6["Tool Output Data"]
  INPUT6 --> PE6["Policy Engine Evaluation"]

  PE6 --> RULES6{"Check Rules:<br/>- User Role<br/>- Data Sensitivity<br/>- LLM Provider"}

  RULES6 -->|Sensitive & Restricted| MASK6["Apply Masking / Redaction"]
  RULES6 -->|Internal / Safe| PASS6["Pass Through"]

  MASK6 --> MERGE6["Construct LLM Prompt"]
  PASS6 --> MERGE6

  MERGE6 --> END6([Proceed to LLM])
```