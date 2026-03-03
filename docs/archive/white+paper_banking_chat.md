# Systems and Methods for Chatbots Using Agentic AI and Model Context Protocol

## Patent Specification

---

## Title

**SYSTEMS AND METHODS FOR IMPLEMENTING TASK-ORIENTED CHATBOTS WITH AUTONOMOUS FULFILLMENT WORKFLOWS USING AGENTIC AI AND MODEL CONTEXT PROTOCOL**

---

## Abstract

A system and method for implementing task-oriented chatbots by decoupling the conversational interface, natural language understanding (NLU), and domain-specific microservices using an agentic AI orchestrator and a Model Context Protocol (MCP) service layer. The system utilizes a chat frontend for capturing user inputs, an established NLU pipeline combined with generative AI fallback for intent detection securely managed by a chat backend, and an AI orchestrator that maps detected intents to abstract fulfillment workflows. The architecture introduces a dual-layer policy enforcement framework encompassing: (1) a Data Policy Engine embedded within the MCP layer that provides centralized schema validation, data obfuscation, and role-based access before sensitive output reaches the reasoning engine, and (2) an AI Safety Policy Engine situated at the AI orchestrator layer that acts as a cognitive firewall to filter prompt injections, halt toxic or hallucinatory responses, and enforce domain governance. This unified isolation pattern maximizes enterprise security, ensures stringent data obfuscation, and minimizes integration friction, enabling rapid scaling of conversational capabilities via dynamic tool registries and configuration updates.

---

## Field of the Invention

The present invention relates generally to conversational user interfaces and chatbots, and more particularly to systems and methods for implementing task-oriented chatbots using agentic artificial intelligence (AI), abstract fulfillment workflow and a standardized tool protocol such as the Model Context Protocol (MCP). The invention is applicable across domains including, in this paper, financial service used as example for demonstration of the invention. It is noted that these are illustrative examples and the invention is not limited to financial services.

---

## Background of the Invention

Chat-based interfaces are increasingly used to provide users with self-service access to products, services, and support across many industries. These are referred to as interactive virtual assistants (IVAs) or chatbots. Conventional chatbot architectures commonly rely on rigid natural language understanding (NLU) pipelines and tightly coupled integrations between front-end interfaces, back-end services, and intent-specific business logic.

Conventional chatbots also struggle with conversational flexibility. Intent libraries must be extensively pre-defined, and unexpected user phrasing or multi-intent queries frequently cause misclassification or fallback behaviors. Many systems lack robust conversational memory, forcing users to repeat information. Not to mention robotic conversation and no sentiment analysis and multiturn conversation missing context. Additionally, sensitive data (e.g., financial, medical, or personally identifiable information) must be carefully managed to avoid leakage into logs or external AI models, creating significant security and compliance challenges.

In typical systems, the chat frontend is directly coupled to backend APIs and domain-specific intent handlers. Adding new capabilities (for example, a new type of account inquiry in banking, or a new order status query in e-commerce) often requires simultaneous updates to multiple components, including NLU training data, intent classification models, backend service integrations, and response formatting logic. This tight coupling results in high initial implementation cost, substantial operational complexity, and slow adaptation to changing products, regulations, and customer expectations.

Recent advances in large language models (LLMs) and agentic AI provide new opportunities for building more flexible, context-aware chatbots. However, naïvely connecting LLMs directly to core APIs without clear boundaries and control (for example, letting an LLM construct arbitrary API calls) can introduce security, compliance, and reliability risks. There is therefore a need for an architecture that leverages agentic AI and autonomous agent capabilities while maintaining strict control over tools, data access, and execution, and that decouples conversational orchestration from domain-specific business logic.

Many existing LLM-based agent frameworks provide generic "tools" or function-calling interfaces but do not prescribe a domain-agnostic, policy-aware architecture for separating conversational workflows from business logic. In such systems, LLMs may directly plan and invoke arbitrary tools or APIs, with limited schema validation, limited masking of sensitive outputs before inclusion in prompts, and little support for configuration-driven reuse of workflows across domains. As a result, conventional approaches can be difficult to govern, may require code changes to introduce new capabilities, and can expose organizations to increased security and compliance risk.

---

## Summary of the Invention

In one aspect, the invention provides a system and method for implementing task-oriented chatbots using an agentic AI orchestrator together with a standardized tool interface layer, such as a Model Context Protocol (MCP) server, to access domain services. The architecture decouples the chat frontend, AI orchestration, NLU, and domain microservices through well-defined interfaces, thereby reducing integration complexity, improving maintainability, and enabling rapid introduction of new conversational capabilities.

Unlike generic LLM agent patterns that allow models to construct and invoke tools in an ad hoc fashion, the disclosed system constrains all tool access through an MCP-compliant service layer with schema-based validation, masking and redaction policies, and policy-driven governance, and drives orchestration behavior from configuration rather than code. A graph-based AI orchestrator coordinates a hybrid NLU pipeline, human-in-the-loop entity completion, and controlled tool execution, enabling autonomous, domain-agnostic workflows that can be safely extended to new domains by updating configuration artifacts rather than rewriting orchestrator logic.

According to one embodiment, the system includes: ( core of the invention )

- A chat frontend configured to capture user messages and display chatbot responses. Referred as Chat UI.
- An API based chat backend, configured to manage authenticated user sessions, maintain conversation context, and route messages.
- A NLU component that integrates with one or more NLU services with fallback to generative AI based intent detection.
- An AI orchestrator configured to:
  - receive detected intent and entities from the chat backend, and manage specific AI agent workflows to fulfill user requests,
  - perform thorough validation of user input extraction, and based on defined prompts, perform data extraction and human-in-the-loop validation to seek any missing inputs. An SLM approach is used to define prompts for data extraction and validation.
  - autonomously execute fulfillment workflows by invoking one or more tools via an MCP-compliant interface, and
  - generate natural language responses using at least one LLM.
  - acts as a MCP client to invoke tools exposed by the MCP server.
- An MCP service layer exposing a plurality of tools corresponding to domain-specific operations (for example, account operations, order management, ticket management, or profile management), with schema-based parameter validation.
- One or more backend domain services providing the underlying business functions, typically implemented as microservices communicating with domain data stores.

In operation, a user message is received at the chat frontend (Chat UI) and forwarded to the chat backend, where authentication and session context are enforced. 

The chat backend is responsible for managing the session, identifying if a new session is established, and managing new intent vs existing intent response. The chat backend handles the management of chat sessions along with detecting a new intent vs responding to an existing intent follow-up questions. The chat backend also responsible for integrating with the NLU services to perform intent detection and then passes the user message with derived intent to the AI orchestrator.

The AI orchestrator then uses the user messages and intent details to trigger a predefined and generic agentic workflow to fulfill user requests. This involves selecting the predefined prompt to fulfill the request, which can be a simple mapping between intent and prompt. Defining well-written prompts is a key aspect of the system function. Prompts define all the required inputs and utilize LLM-based function calling to fetch data needed via MCP-based tool calling. Based on the detected intent and extracted entities, the AI orchestrator selects one or more MCP tools to execute. The tools are invoked via the MCP service layer, which validates parameters and invokes the corresponding domain microservices. A key aspect of autonomous execution is to define workflows with processing predefined prompts, and key capabilities include data extraction from user input, identifying missing inputs, and performing human-in-the-loop validation to obtain any missing inputs from the user before proceeding with tool execution. All of these are implemented in a generic manner, decoupled from domain-specific logic so that new capabilities can be added rapidly by defining new prompts and mapping them to existing or new tools. This key capability is the crux of the invention to enable autonomous execution of user requests in a generic manner with domain-agnostic design.


The microservices return structured data that may be masked or redacted to avoid exposing sensitive information to the LLM. The AI orchestrator then constructs prompts including system instructions, safety constraints, contextual data, and user messages, and invokes the LLM to generate a natural language response that is returned to the user.

In some embodiments, the system additionally implements observability and control features, including structured logging of tool calls with correlation identifiers, monitoring of intent accuracy and action success rates, circuit breakers, and fallback behaviors to human agents upon repeated errors or low-confidence conditions.

The architecture is domain-agnostic and can be applied to financial use cases (for example, account inquiries, transaction management, and card services) as well as to other domains such as e-commerce, telecommunications, and healthcare—generally, any customer-servicing workflow that can be automated via a chatbot. In one illustrative embodiment, a banking domain is used to demonstrate account inquiries, transaction management, card services, and secure operations; however, the underlying mechanisms are not limited to banking.

In another aspect, the invention provides a method of operating a task-oriented chatbot comprising receiving a user query, determining an intent, selecting at least one or more MCP tool based on the intent, invoking the tool to perform a domain-specific function, and generating a natural language response using an LLM based on tool outputs and conversation context. 

---

## High-Level Overview of the System Architecture

- **FIG. 1** is a block diagram of a system architecture for a task-oriented chatbot using an AI orchestrator and a Model Context Protocol service layer.

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
    POLICY_AI["AI Safety Policy Engine<br/>(Prompt Safety, Toxicity,<br/>Hallucination Guards)"]
    RESP["LLM Invocation &<br/>Response Post-Processing"]
  end

  subgraph MCP["MCP Service Layer"]
    VAL["Schema Validation<br/>& Parameter Checking"]
    REG["Tool Registry<br/>(names, schemas,<br/>metadata, discovery)"]
    POLICY_MCP["Data Policy Engine<br/>(RBAC, API Data Rules)"]
    MASK["Masking & Redaction<br/>(sensitive fields)"]
    LOG["Tool Invocation Logging<br/>(audit, metrics)"]
  end

  subgraph Domain["Domain Services & Data"]
    SVC["Domain Microservices<br/>(Account, Transaction, Card, etc.)"]
    DB[("Primary Database")]
    SSTORE[("Session Store")]
    AUDIT[("Audit & Observability Store")]
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
  VAL --> LOG
  LOG --> AUDIT

  REG --> SVC
  SVC --> DB
  DB -->|raw results| POLICY_MCP
  POLICY_MCP -->|trigger obfuscation| MASK
  MASK -->|structured & safe results| PROMPTS

  PROMPTS -->|validate inputs| POLICY_AI
  POLICY_AI -->|safe prompt| RESP
  RESP -->|validate outputs| POLICY_AI
  POLICY_AI -->|cleared output| OUT
  OUT --> UI
  UI --> U
```


- **FIG. 2** is a flow diagram illustrating a method for processing a user request using intent detection, tool execution via MCP, and LLM-based response generation.

```mermaid
sequenceDiagram
    participant User
    participant ChatBackend as Chat Backend & NLU
    participant Orchestrator as AI Orchestrator
    participant MCPPly as Data Policy Engine (MCP)
    participant MCP as MCP Service Layer
    participant Domain as Domain Services
    
    User->>ChatBackend: Message ("What's my balance?")
    ChatBackend->>ChatBackend: Authenticate & Detect Intent
    ChatBackend->>Orchestrator: Forward Intent + Entities + Context
    Orchestrator->>Orchestrator: Match Workflow & Extract Parameters
    Orchestrator->>MCP: Invoke Tool Request (MCP Exec)
    MCP->>MCP: Validate Schema
    MCP->>Domain: Execute Business Logic
    Domain-->>MCPPly: Raw Domain Data
    MCPPly->>MCPPly: Apply Data Redaction, RBAC & Masking
    MCPPly-->>Orchestrator: Safe Tool Results
    Orchestrator->>Orchestrator: Generate Prompts
    Orchestrator->>Orchestrator: AI Safety Policy: Validate Prompt Injection
    Orchestrator->>LLM: Call Large Language Model
    LLM-->>Orchestrator: Draft Natural Language Response
    Orchestrator->>Orchestrator: AI Safety Policy: Guardrails (Toxicity, Hallucination)
    Orchestrator-->>ChatBackend: Approved Natural Language Response
    ChatBackend-->>User: Display Output
```




- **FIG. 3** is a schematic diagram of an MCP tool registry and its relationship to underlying domain service APIs.

```mermaid
flowchart LR
  REG3["MCP Tool Registry"] --- CFG3["Config Store - schemas, metadata, feature flags"]

  subgraph REGISTRY["MCP Registry View"]
    T1["Tool: get_accounts<br/>name; JSON schema; sensitivity tags; enabled=true"]

    T2["Tool: transfer_funds<br/>name; JSON schema; sensitivity tags; operation=write; requiresConfirmation=true"]

    T3["Tool: block_card<br/>name; JSON schema; jurisdiction rules; featureFlag=enable_block_card"]
  end

  ORCH3[AI Orchestrator] -->|tool discovery| REG3
  REG3 --> ORCH3

  REG3 -->|maps to| API1[Account APIs]
  REG3 -->|maps to| API2[Payment APIs]
  REG3 -->|maps to| API3[Card APIs]
  CFG3 --> REG3
```


---

## Detailed Description of the Invention

### System Overview

In one embodiment, the system relies on several foundational components (Sections 1-3, 6-7) that support the core orchestration and security layers (Sections 4-5). The core invention focuses on the interplay between the AI Orchestrator and the MCP Service Layer, while other components may be implemented using industry-standard patterns.

#### 1. Supportive Interface and Logic Layers (Information Only)

- **Chat Frontend:** A standard user interface (web, mobile, or voice) presenting a chat interface, rendering messages, and securely maintaining session authentications.
- **Chat Backend:** A server-side component to manage state. It receives messages, validates authentication, associates messages with a conversation identifier, retrieves session data, enforces rate limits, and routes validated messages to the NLU pipeline. 
- **NLU Services:** One or more Natural Language Understanding components to determine intent. As an optional implementation, a hybrid approach could be utilized (e.g., combining a primary rule-based NLU, a secondary domain-model, and an LLM-based function-calling fallback for low-confidence queries).

#### 2. Core Orchestration: AI Orchestrator

A workflow engine (e.g., based on graph-based orchestration frameworks like LangGraph) that:
- Receives user messages, manages session context (e.g., conversation history, user roles, preferences), and matches intent received from the chat backend to a prompt to perform fulfillment workflow.
- Applies decision logic based on the detected intent, confidence score, and entity availability to determine whether to:
  - Request additional clarification from the user if confidence is low or entities are missing.
  - Request additional input if needed.
  - Request explicit user confirmation for write operations such as fund transfers or account changes.
  - Proceed to tool execution to fulfill user intent.
- Selects one or more tools from the MCP registry that correspond to the detected intent.
- Invokes the tools via the MCP service layer, optionally in parallel when independent.
- Receives structured results from the tools.
- Constructs one or more prompts for the LLM, incorporating:
  - A system prompt defining the assistant's role, domain, safety constraints, and behavioral guidelines.
  - A user prompt containing the latest user message, detected intent and confidence, relevant context (e.g., user preferences, prior actions in the conversation), and tool outputs.
  - Optional few-shot examples demonstrating desired response format or reasoning.
- **AI Safety Policy Engine Validation:** Scans the constructed prompt for injection vectors and, upon receiving the LLM's raw output, filters for hallucination mapping (verifying factual correctness against tool data), toxicity, and brand alignment.
- Invokes at least one LLM (e.g., GPT-4, Claude, or similar) to generate a natural language response based on the constructed prompts.
- Applies post-processing via the AI Safety Policy Engine to the LLM output, including:
  - Validation of response content (e.g., ensuring no hallucinated URLs or conflicting domain instructions are present).
  - Formatting (e.g., breaking into paragraphs, adding structured elements).
  - Inclusion of suggested next actions or follow-up options.
- Returns the processed response to the chat backend.

#### 5. MCP Service Layer

A protocol-compliant tool server (implementing the Model Context Protocol specification) that:
- Maintains a registry of available tools, each defined by:
  - A unique tool name (e.g., `get_account_balance`, `check_order_status`).
  - A human-readable description of the tool's purpose.
  - A JSON schema specifying required and optional input parameters and their types, validation rules, and constraints.
  - Metadata indicating whether the tool performs a read operation (safe, idempotent) or a write operation (mutating, requiring confirmation).
- Responds to tool-discovery requests from the AI orchestrator, providing a list of available tools and their schemas. This enables dynamic adaptation without code changes.
- Validates incoming tool invocation requests from the AI orchestrator against the declared schema, rejecting calls with invalid or missing parameters before invoking backend services.
- Upon validation, invokes the corresponding backend domain service or data source with the validated parameters.
- Receives results from the backend service.
- **Data Policy Engine Enforcement:** Centralizes structural governance by embedding a Data Policy Engine directly within the MCP Service Layer. This intercepts both incoming requests (to authorize based on strict Roles-Based Access Controls) and outgoing data (to perform data obfuscation, sanitization, and PII filtration at the output layer level).
- Applies masking, redaction, or filtering policies via the embedded Data Policy Engine to the outbound results (e.g., obfuscating full account numbers or masking sensitive salary fields) according to enterprise configuration before the data ever reaches the AI orchestrator or network transport layer.
- Returns the processed results to the AI orchestrator via the MCP protocol.
- Logs all tool invocations, parameters, and results for audit, observability, and continuous improvement.
- MCP Service Layer apply additional policy checks based on user role, and data sensitivity before allowing tool invocation or data exposure. This enforces governance and compliance requirements to ensure account data is only accessed by authorized users and that sensitive data is protected.
- The MCP service layer also normalizes and adjusts payloads to meet data requirements for agentic AI processing, including applying necessary transformations, tokenization, and data minimization before passing data to the AI orchestrator. These adaptations may be required on a case-by-case basis, particularly when integrating with legacy enterprise systems that are not AI-ready or that lack clear, machine-interpretable API specifications.

#### 4. Domain Services Layer & Data Stores (Information Only)

Microservices or legacy application programming interfaces (APIs) handle the target domain. For example, in a Financial Services embodiment, these might include account retrieval, transaction histories, fund transfers, and compliance checking. These services interact with standard primary databases, session caches (e.g., Redis), and audit storage. If enterprise services are not AI-ready, the MCP Service Layer adapts and normalizes payloads upstream.

---

### Authentication and Session Management (Standard Implementations)

As an optional configuration utilizing industry standards, users authenticate via secure endpoints receiving short-lived JWTs (JSON Web Tokens) encoding roles and session identifiers. The Chat Backend consistently validates these headers, tying stateless messages into conversational context vectors for the orchestrator.

---

### Intent Detection and Workflow Selection (Exemplary Flow)

When a new user message is received, standard NLU pipelines decode the user's intent. To maximize reliability, this can be implemented as a tiered system: calling a primary ML/NLU engine first, falling back to a domain-specific model for mid-confidence scores, and finally utilizing an LLM specifically engineered for function-calling to parse the unstructured request as a last resort. 

Once intent detection is complete, the detected intent with entities is forwarded to the AI orchestrator for workflow execution. After receiving the detected intent from the chat backend, the AI orchestrator applies abstract workflow decision logic:

- **Missing Entities**: If the detected intent requires entities that were not extracted (e.g., account type for a balance inquiry), the system autonomously generates a human-in-the-loop follow-up question.
- **Authorization Check**: The system verifies that the user has permission to perform the action associated with the intent.
- **Write vs. Read Operations**: If the intent corresponds to a write operation (e.g., transferring funds), the system generates a confirmation message and waits for explicit user confirmation.
- **Tool Selection**: Based on the intent and extracted entities, the system maps the conversational requirement to the specific MCP tool configuration.

### Human-in-the-Loop Entity Completion and Validation

In one embodiment, the system implements a human-in-the-loop entity completion mechanism that uses the structure of the selected intent and associated tool schemas to determine when user input is incomplete or ambiguous, and to obtain clarification before any tool invocation that could result in an incorrect or unauthorized action.

For each recognized intent, the system maintains a machine-readable specification of required and optional entities, including types, allowed value ranges, and domain-specific constraints (for example, that a transfer amount must be positive and that a source and destination account must be distinct). When an intent is detected, the AI orchestrator compares the entities extracted by NLU components against this specification to determine which entities are missing, ambiguous, or invalid.

If one or more entities are missing or ambiguous, the AI orchestrator generates targeted clarification prompts asking the user for exactly the missing information. For example, if a user says, "Transfer $500," and the intent is `transfer.money` but no source or destination account is provided, the AI orchestrator generates questions such as "Which account should we transfer from?" and "Which account should we transfer to?" The AI orchestrator updates the session context with the user’s subsequent responses, re-validates the entity set against the specification, and only proceeds to tool selection once all required entities are present and valid.

In some embodiments, the system further applies domain-specific validation rules before tool invocation. These rules can include checking that an amount is within daily transaction limits, that an account is active, and that the user’s role permits the requested operation. If validation fails, the AI orchestrator explains the reason to the user and may offer alternative actions rather than attempting the tool call.

---

### MCP Tool Selection and Execution

In one embodiment, an intent-to-tool mapping configuration defines, for each recognized intent, one or more tools that should be invoked. For example:

```
Intent: check.balance
Tools: [banking_get_accounts, banking_get_balance]

Intent: transfer.money
Tools: [banking_get_accounts, banking_get_balance, banking_transfer]

Intent: card.block
Tools: [banking_get_cards, banking_block_card]
```

Based on the detected intent and available entities, the AI orchestrator:
- Looks up the intent-to-tool mapping to determine candidate tools.
- Filters tools based on available entities and authorization (e.g., if the user specified a particular account type, only tools relevant to that type are selected).
- Constructs a tool invocation request for each selected tool, including:
  - The tool name.
  - Input parameters matching the tool's JSON schema (extracted from the user message or session context).
  - Optional metadata (e.g., correlation identifier for tracing, user context for authorization).

The MCP service layer receives each tool invocation request and:
- Validates the request parameters against the tool's JSON schema.
- Invokes the corresponding backend domain service with the validated parameters.
- Receives a response from the backend service.
- Applies masking or redaction policies to sensitive fields in the response (e.g., replacing full account numbers with the last four digits, omitting full addresses or government identifiers).
- Returns the processed result to the AI orchestrator.

### Error Handling, Circuit Breakers, and Fallbacks

To ensure robustness, the system implements comprehensive error handling and safety mechanisms around API invocations:
- **Circuit Breakers:** If the MCP layer detects repeated failures or timeouts when invoking a specific backend domain service, a circuit breaker trip occurs. Further tool invocations to that backend are immediately rejected (fail-fast) to prevent cascading system failures and give the backend time to recover.
- **Graceful Fallbacks:** In the event of a circuit breaker trip or other backend unavailability, the AI orchestrator is notified via structured error codes. The Orchestrator leverages these semantic codes to formulate a graceful fallback message ("Our balance system is temporarily unavailable...") or selectively fall back to alternative data sources.
- **Human Escalation:** When repetitive low-confidence errors occur in a single session—whether due to NLU confusion, repeated tool failures, or prompt safety violations—the system automatically halts the autonomous execution loop and escalates the conversation context to a human agent queue.

Tool invocations are logged with all relevant metadata (tool name, parameters, latency, result status, correlation ID) for audit, observability, and continuous improvement.

---

### Data Protection and Privacy

The system implements multiple layers of data protection to ensure sensitive information is not inadvertently exposed to external AI models or logs:

#### Masking and Redaction

Before including tool output in a prompt to the LLM, the system applies masking and redaction policies:
- Full account numbers are masked to show only the last four digits (e.g., `****1234`).
- Full card numbers are masked similarly.
- Full addresses and government identifiers (e.g., SSNs, tax IDs) are omitted from LLM prompts.
- Salaries, detailed financial data, and other sensitive attributes are redacted according to configuration.

#### Prompt Injection Security and Dual-Layer Defenses

To ensure complete systemic safety, the architecture defends against both semantic attacks and data breaches through a two-tiered policy enforcement framework:

1. **AI Safety Policy Engine (Orchestrator Layer):** 
   Operating at the cognitve boundaries of the LLM, this engine governs behavioral safety. Before prompt construction, it sanitizes user inputs (stripping structural evasion characters and long strings). Enforced system instructions strictly bound the agent's authority to prevent prompt-injection attacks. After the LLM drafts a response, this engine executes a post-generation validation pass to check for hallucinated information (e.g., comparing numbers in the output against the verified tool data), detect toxic language, and enforce brand tone alignment before the message reaches the external network.

2. **Data Policy Engine (MCP Layer):** 
   Operating deep within the secure application backend, this engine acts as an absolute structural boundary. Even if the AI Orchestrator were completely compromised via a novel injection attack, the Data Policy Engine prevents the AI from extracting arbitrary data. It strictly evaluates incoming parameters against JSON schemas, verifies user RBAC permissions before permitting an API invocation, and mathematically strips or tokenizes all PII from the outgoing JSON response payload.

#### Tokenization

Sensitive identifiers may be replaced with non-reversible tokens that can be used for subsequent tool calls but do not reveal the underlying data to the LLM or logs.

#### Audit Logging

All accesses to sensitive data are logged in a separate audit trail, including:
- User and timestamp.
- Data accessed.
- Purpose (e.g., tool execution, compliance check).
- Authorized role.

Audit logs are stored in a protected store and retained according to compliance requirements (e.g., 7 years for financial services).

#### Role-Based Access Control

Tools and backend services enforce role-based access control, ensuring that only authorized users can access sensitive data or perform certain operations. Authorization checks are performed at the backend service layer, not in the AI orchestrator or LLM.

### Policy Engine for Data Protection and Tool Governance

In one embodiment, the system includes a policy engine that governs which data may be exposed to large language models, which tools may be invoked for a given user or context, and how tool outputs must be transformed before inclusion in any LLM prompt.

The policy engine evaluates rules expressed over attributes such as:
- User role, segment, and jurisdiction.
- Tool identity and operation type (for example, read vs. write).
- Data field sensitivity classifications (for example, public, internal, confidential, regulated).
- Target LLM provider (for example, internal model vs. external hosted provider) and its allowed data handling profile.

Tools and backend services annotate output fields with sensitivity metadata or schema tags. Before constructing an LLM prompt, the AI orchestrator submits a policy evaluation request that includes the tool outputs and intended target model. The policy engine returns transformation requirements specifying which fields must be masked, redacted, tokenized, or omitted entirely. The AI orchestrator or MCP service layer then applies these transformations to the tool outputs before they are embedded into prompts.

The same policy mechanism can be used to determine which tools appear as available to a given user or session at runtime. For example, a `block_card` tool may be disabled for users in certain jurisdictions, or enabled only for users with a particular authorization claim. The AI orchestrator receives the set of permitted tools based on policy evaluation and constrains its tool-selection and planning logic accordingly.

---

### LLM Response Generation

The AI orchestrator constructs one or more prompts for the LLM that incorporate:

#### System Prompt

A system prompt that describes:
- The assistant's role and domain (e.g., "You are a banking assistant for SecureBank").
- Specific responsibilities (e.g., "Help customers with account inquiries, transactions, and card management").
- Behavioral guidelines (e.g., "Provide clear, accurate information based on retrieved data").
- Safety constraints and prohibitions:
  - "NEVER share full account numbers or SSNs".
  - "NEVER execute transfers without explicit user confirmation".
  - "NEVER provide financial advice or investment recommendations".
  - "ALWAYS verify user intent before blocking cards or closing accounts".
- List of available tools and their purposes.

#### User Prompt

A user prompt that includes:
- The user's latest message.
- Detected intent and confidence score.
- Extracted entities (e.g., account type, amount, date range).
- Relevant context from the session (e.g., user preferences, prior actions in the conversation).
- Outputs from tool invocations, masked or redacted as appropriate.

#### Few-Shot Examples (Optional)

In some embodiments, the system includes one or more examples of desired response format or reasoning, e.g.:

```
Example:
User: "What's my checking account balance?"
Intent: check.balance
Account Data: [{ accountId: ****1234, type: CHECKING, balance: $2,450.00 }]

Expected Response:
"Your checking account (ending in 1234) has a balance of $2,450.00. 
Would you like to [view transactions] [transfer funds] [something else]?"
```

#### LLM Invocation

The AI orchestrator invokes the LLM (e.g., GPT-4 or Claude) with the constructed prompts, specifying:
- Model name and version.
- Temperature (e.g., 0.7 for balanced determinism and creativity).
- Maximum token limit (e.g., 2000 tokens).
- Tools available for the LLM to call (if using function calling for multi-step reasoning).

#### Response Parsing and Validation

The LLM response is parsed to extract:
- The main text response.
- Any function calls requested by the LLM (if function calling is enabled).
- Structured elements (e.g., suggested actions).

The response is validated to ensure:
- No sensitive data (full account numbers, SSNs, etc.) appears in the response.
- The response is coherent and appropriate for the detected intent.
- Any requested function calls are valid and authorized.

#### Response Formatting

The validated response is formatted for display to the user, including:
- Concise, natural language text.
- Optional rich content (e.g., cards displaying account details, buttons for suggested actions).
- Confidence level, if appropriate (e.g., "I'm about 90% confident that you want to check your balance").
- Suggested next actions (e.g., "Would you like to [view transactions] [transfer funds]?").

---

### Observability, Logging, and Monitoring

The system implements comprehensive observability to track behavior, identify issues, and support continuous improvement:

#### Structured Logging

For each user message processed, the system logs structured data including:
- Timestamp and correlation identifier (unique per message, linking logs across all services).
- User identifier and session identifier.
- User message text (optionally truncated for privacy).
- Detected intent, confidence score, and extracted entities.
- NLU service used and its latency.
- Tools selected and invoked.
- Tool invocation parameters (excluding sensitive data) and latencies.
- Tool invocation results (status, latency, masked data).
- LLM model, prompt tokens, completion tokens, and latency.
- Final response generated.
- User feedback (if any, e.g., thumbs up/down rating).

#### Key Metrics

The system tracks and reports on:
- **Intent Detection Accuracy**: Percentage of correctly detected intents (evaluated via user feedback or manual review).
- **Confidence Scores**: Distribution of confidence scores across detected intents, identifying intents with low confidence that may need additional training or refinement.
- **Tool Success Rate**: Percentage of tool invocations that succeeded vs. failed, identified by tool name and domain.
- **Latency**: Percentiles (p50, p95, p99) of:
  - End-to-end message processing time.
  - Intent detection latency.
  - Tool execution latency.
  - LLM response latency.
- **User Satisfaction**: Ratings, feedback, and engagement metrics (e.g., session length, conversation turns, escalation rate).
- **Error Rates**: Frequency of errors by type (NLU errors, tool execution errors, LLM errors, etc.).

#### Observability Dashboards

The system provides real-time dashboards and reports showing:
- Current and historical metrics.
- Alerts for anomalies (e.g., sudden drop in tool success rate, spike in error rate).
- Breakdown by intent, tool, time of day, user segment, etc.

---

### Error Handling and Fallback Mechanisms

The system implements multi-layered error handling to ensure robustness and a graceful user experience:

#### Low Confidence Handling

If the primary NLU engine returns a confidence score below a first threshold (e.g., 0.70), the system attempts secondary or tertiary NLU components. If all components return low confidence, the system generates a clarification question asking the user to rephrase or provide more details.

After multiple failed clarifications (e.g., 3 attempts), the system offers to escalate the conversation to a human agent.

#### Tool Execution Failures

If a tool invocation fails (e.g., backend service returns an error), the system:
- Logs the failure with details (error code, message, timestamp).
- Attempts to retry the tool call with exponential backoff (e.g., 100ms, 500ms, 2000ms between retries).
- If retries are exhausted, generates a user-facing message indicating a temporary issue and offering escalation to a human agent.

#### Circuit Breaker Pattern

To prevent cascading failures when a backend service is experiencing outages or degradation, the system implements a circuit breaker:
- A counter tracks consecutive failures for each backend service.
- When the failure count exceeds a threshold (e.g., 5 consecutive failures), the circuit opens and further requests to that service are immediately rejected.
- Requests are retried at intervals (e.g., every 60 seconds) to detect when the service recovers.
- Upon successful recovery, the circuit closes and normal operation resumes.

#### Fallback Messages

When errors occur, the system provides user-friendly fallback messages, such as:
- "I'm having trouble accessing that information right now. Please try again in a moment."
- "I'm experiencing technical difficulties. A human agent will assist you shortly."

The system then routes the conversation to a human agent or a simpler fallback chatbot if available.

#### Escalation to Human Agents

Conversations are escalated to human agents when:
- Low-confidence intent detection persists after clarification attempts.
- Tool execution fails repeatedly.
- The user explicitly requests an agent (e.g., "I want to speak to someone").
- The detected intent is flagged as sensitive or out-of-scope (e.g., disputes, complaints, or features not yet implemented).
- The conversation has not reached resolution after a certain duration or number of turns.

Upon escalation, the system provides the human agent with full conversation history, detected intents, extracted context, and any relevant tool outputs to enable efficient handoff.

---

### Multi-Turn Conversation and Context Management

The chat backend maintains conversation history and session state, allowing the AI orchestrator to provide natural multi-turn conversations:

- **Conversation History**: The system stores and retrieves a sliding window of prior messages (e.g., the last 10–20 turns) from the session store.
- **Context Enrichment**: Prior messages are included in prompts to the LLM, enabling the LLM to refer back to earlier statements and understand evolving user intent.
- **Entity Persistence**: Entities extracted in earlier turns (e.g., account type, date range) are stored in session context and reused in subsequent turns if applicable.
- **User Preferences**: User-specific preferences (e.g., preferred language, communication style) are stored and applied across turns.

---

### Configuration and Extensibility

The system is designed for extensibility and domain-agnostic configuration:

#### Intent-to-Tool Mapping Configuration

An intent-to-tool mapping configuration (e.g., a JSON or YAML file) defines:
```json
{
  "intents": {
    "check.balance": {
      "tools": ["domain_get_accounts", "domain_get_balance"],
      "requiresConfirmation": false,
      "description": "Retrieve account balance"
    },
    "transfer.money": {
      "tools": ["domain_get_accounts", "domain_transfer"],
      "requiresConfirmation": true,
      "description": "Execute fund transfer"
    }
  }
}
```

#### Prompt Template Configuration

Prompt templates can be stored in configuration files and versioned:
```
system_prompt_banking_v1:
  "You are a banking assistant for SecureBank. Help customers with account inquiries, transactions, and card management. Never share full account numbers or SSNs."

user_prompt_balance_inquiry_v1:
  "The user asked: {userMessage}. Their checking account shows: {accountData}. Provide a clear response."
```

#### Tool Registry Configuration

The MCP tool registry can be configured to expose or hide tools based on feature flags, user roles, or gradual rollout strategies:
```json
{
  "tools": [
    {
      "name": "domain_get_accounts",
      "description": "Retrieve user accounts",
      "enabled": true,
      "schema": { ... }
    },
    {
      "name": "domain_experimental_feature",
      "description": "New experimental feature",
      "enabled": false,
      "featureFlagKey": "enable_experimental_X"
    }
  ]
}
```

### Configuration-Driven Domain Specialization

In one embodiment, the system achieves domain-agnostic behavior by treating domain details as configuration rather than code. The AI orchestrator is implemented as a generic workflow engine that reads intent definitions, tool mappings, prompt templates, and validation rules from configuration artifacts (for example, JSON, YAML, or database-backed configuration), such that introducing a new domain or capability does not require changes to orchestrator source code.

For a given deployment, domain experts or developers define:
- A set of intents and their descriptions.
- Mappings from intents to one or more MCP tools, including whether each intent corresponds to a read or write operation and what confirmation semantics apply.
- Prompt templates used for system and user prompts, including placeholders for entities, tool outputs, and safety instructions.
- Entity specifications and validation rules for each intent.

The AI orchestrator loads these configurations at startup or on a scheduled basis and interprets them to construct workflows. For example, adding support for a new healthcare scheduling intent may consist of adding a new intent label, mapping it to existing scheduling tools exposed via the MCP layer, and defining appropriate prompt templates and validation rules. No changes to the orchestrator code are required, which enables rapid extension to new domains and use cases.

In some embodiments, configuration changes can be safely rolled out using versioned configurations and feature flags, allowing new intents or tools to be enabled for a subset of users or sessions before global rollout.

---

## Claims

### Preamble

The following claims define the scope of the invention. Independent claims are numbered first, followed by dependent claims. The invention is not limited to the specific embodiments described but extends to all systems and methods meeting the claim language.

---

### Claims

**1. A system for providing task-oriented conversational services**, comprising:

- a chat frontend configured to receive user messages and present chatbot responses;
- a chat backend configured to authenticate users, manage chat sessions, invoke at least one natural language understanding (NLU) component to determine user intent and entities, and forward user messages with detected intent and associated session context;
- an artificial intelligence (AI) orchestrator configured to:
  - (i) receive user messages, detected intent, entities, and session context from the chat backend;
  - (ii) validate entity completeness and request clarification from users when entities are missing or ambiguous;
  - (iii) select at least one tool corresponding to the user intent from a tool registry;
  - (iv) invoke the at least one tool via a Model Context Protocol (MCP) service layer; and
  - (v) generate a natural language response based on outputs from the at least one tool and the user message using a large language model (LLM);
- an MCP service layer configured to expose the at least one tool to the AI orchestrator via a standardized protocol, validate input parameters against a schema, and invoke one or more backend domain services; and
- a plurality of backend domain services configured to perform domain-specific functions,

wherein conversational logic executed by the AI orchestrator is decoupled from business logic implemented by the backend domain services.

**2. The system of claim 1**, wherein the chat backend is further configured to invoke a plurality of NLU components in a hybrid sequence, including:
- a first NLU engine configured to detect known intents;
- a second, domain-specific NLU model configured to refine or supplement the detected intent; and
- an LLM-based function-calling component configured to determine intent and entities when the first NLU engine and the second NLU model return confidence scores below a threshold.

**3. The system of claim 1**, wherein the tool registry exposed by the MCP service layer comprises a plurality of tools each described by:
- a name,
- a textual description, and
- a JSON schema defining required and optional input parameters,

and wherein the MCP service layer is configured to reject tool invocations that fail schema validation.

**4. The system of claim 1**, wherein the MCP service layer is configured to apply masking or redaction policies to sensitive fields in tool outputs prior to providing the outputs to the AI orchestrator for inclusion in prompts to the LLM.

**5. The system of claim 1**, wherein the AI orchestrator is implemented using a graph-based workflow engine defining:
- a plurality of nodes including at least an intent analysis node, a tool execution node, and a response generation node, and
- a plurality of edges defining execution order between the plurality of nodes.

**6. The system of claim 1**, wherein the chat backend is further configured to:
- associate each user message with a conversation identifier and a session identifier, and
- store conversation history in a session store accessible by the AI orchestrator to provide multi-turn conversational context.

**7. The system of claim 1**, wherein the AI orchestrator is further configured to:
- determine that a selected intent corresponds to a write operation that modifies state in at least one backend domain service, and
- in response, generate a confirmation message and require explicit user confirmation before invoking the at least one tool associated with the write operation.

**8. The system of claim 1**, wherein the AI orchestrator is further configured to escalate a conversation to a human agent upon detecting at least one of:
- a sequence of low-confidence intents exceeding a predetermined count,
- repeated tool failures,
- a user request for escalation, or
- a compliance-sensitive intent (e.g., fraud dispute or complaint).

**9. The system of claim 1**, wherein the MCP service layer is further configured to support a tool discovery operation through which the AI orchestrator requests and receives a list of currently available tools and their respective input schemas, enabling dynamic adaptation of workflows without modifying AI orchestrator code.

**10. The system of claim 1**, further comprising a dual-layer policy enforcement framework including:
- a Data Policy Engine operating within the MCP service layer configured to intercept tool outputs, verify roles-based access controls, and apply data transformations prior to transmission, the transformations including masking, redaction, and tokenization of sensitive fields; and
- an AI Safety Policy Engine operating in conjunction with the AI orchestrator configured to validate cognitive interactions by performing prompt injection analysis on user inputs and filtering generated responses for toxic content, tone misalignment, and factual hallucinations based on tool-provided data.

**11. A computer-implemented method for providing task-oriented conversational services**, comprising:

- receiving, at a chat backend, a user message from a chat frontend together with authentication information;
- validating the authentication information and associating the user message with a session context;
- determining, by the chat backend, a user intent and one or more entities using at least one natural language understanding (NLU) component;
- sending the user message, detected intent, entities, and session context to an AI orchestrator;
- validating, by the AI orchestrator, that required entities are present and requesting clarification from the user if entities are missing or ambiguous;
- selecting, based on the user intent, at least one tool from a plurality of tools exposed via a Model Context Protocol (MCP) service layer;
- invoking, via the MCP service layer, the at least one tool to perform a domain-specific function using one or more backend domain services;
- receiving, at the AI orchestrator, output data from the at least one tool;
- constructing a prompt including at least the user message, the output data, and one or more safety instructions;
- invoking a large language model using the constructed prompt to generate a natural language response; and
- returning the natural language response to the chat frontend for display to the user.

**12. The method of claim 11**, further comprising masking or redacting, prior to constructing the prompt, one or more sensitive fields in the output data according to domain-specific policies to prevent exposure of full account numbers, full card numbers, or government identifiers to the large language model.

**13. The method of claim 11**, further comprising:
- determining that a confidence score associated with the user intent is below a threshold, and
- in response, transmitting a clarification question to the chat frontend requesting additional information from the user.

**14. The method of claim 11**, wherein selecting the at least one tool comprises:
- consulting a configuration mapping from intent labels to sets of tools, and
- determining a subset of tools based on available entities and authorization data associated with the session context.

**15. The method of claim 11**, further comprising, in response to detecting that the user intent corresponds to a write operation:
- generating a confirmation message describing the operation and its impact;
- transmitting the confirmation message to the user; and
- proceeding to invoke the at least one tool only upon receiving an explicit confirmation input from the user.

**16. The method of claim 11**, further comprising:
- detecting repeated failures or timeouts when invoking the at least one tool,
- opening a circuit breaker condition in which further invocations of one or more affected backend domain services are temporarily suspended, and
- providing the user with a fallback message or routing to a human agent.

**17. The method of claim 11**, further comprising:
- maintaining conversation history in a session store,
- including relevant prior messages from the conversation history in the constructed prompt to provide multi-turn conversational context.

**18. The method of claim 11**, wherein determining a user intent comprises:
- invoking, by the chat backend, a first NLU engine and receiving a confidence score;
- if the confidence score is above a first threshold, accepting the detected intent;
- if the confidence score is below the first threshold, invoking a second, domain-specific NLU model; and
- if the second NLU model returns a low confidence score, invoking an LLM-based function-calling component to extract intent and entities.

**19. The method of claim 11**, further comprising executing a dual validation protocol during conversational services by:
- evaluating, by a data policy engine, data sensitivity rules and user access roles prior to releasing tool outputs to the artificial intelligence orchestrator and redacting determined sensitive fields; and
- evaluating, by a safety policy engine, bounding and factual constraints against drafted language responses prior to returning the response to a user to mitigate injected logic commands and prevent factual hallucinations.

**20. A non-transitory computer-readable medium** storing instructions that, when executed by one or more processors of an AI orchestration system in communication with a chat backend, an MCP service layer, and a plurality of domain microservices, cause the AI orchestration system to perform the method of claim 11.

---

## Document Information

**Title:** Systems and Methods for Chatbots Using Agentic AI and Model Context Protocol  
**Version:** 1.0 (Patent Specification Format)  
**Format:** Markdown  
**Prepared by:** Innovation Team  
**Date:** December 5, 2025

---

*End of Patent Specification*

