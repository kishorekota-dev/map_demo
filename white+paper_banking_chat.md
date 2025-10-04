# Leveraging Agentic AI for Chat Bot
### Problem Statement

Modern chat interfaces demand seamless integration between the experience layer and core product APIs to deliver specific business functions. Traditionally, these integrations are rigid and require significant upfront effort, even though business functions often evolve iteratively based on real-world usage and feedback. This approach can lead to high initial implementation costs and slow adaptation to changing requirements. This white paper explores how Agentic AI and MCP can streamline chat bot development, enabling flexible, adaptive workflows across the end-to-end system.

### Typical Chat Bot System Flow to Fullfil a request

To set the context for implementation details, let's outline the most common requirements for chatbots:
- Authenticate and establish session
    - Customer signs in (support MFA) to create a verified session and issued token; associate session context with identity and consent.

- Accept customer input
    - Receive the user’s natural‑language query and attach session metadata (locale, entitlements, recent activity).

- Intent detection and entity extraction
    - Classify intent, extract entities and confidence score; normalize ambiguous values.

- Workflow decision
    - If more information is required → ask targeted follow‑up questions a.k.a Human In The Loop.
    - If the intent is actionable → check authorization, account state, and rate/limits.
    - If the intent is actionable which modifies data → update address on the account, ask for approval before acting a.k.a Human In The Loop.
    - If not actionable or out of scope → provide guidance or escalate to human agent.

- Data retrieval and enrichment
    - Query downstream APIs (accounts, transactions, KYC, limits) with least privilege.
    - Redact or mask PII before passing to downstream models or logs.

- LLM / agent invocation
    - Provide the LLM/agent with structured context: intent, entities, retrieved data, system instructions, and safety constraints.
    - Prefer tool-enabled workflows: let the agent call verified tools rather than exposing raw data to the model.

- Action execution and confirmation
    - For authorized actions, execute backend API calls with idempotency and audit logging.
    - Confirm changes to the customer and allow cancellation where appropriate.

- Response formatting and delivery
    - Produce a concise, user‑facing response with optional supporting details, confidence level, and recommended next steps.

> Non Functional Requirements

- Security, compliance, and auditing
    - Encrypt session tokens and in‑transit data, maintain audit trails, respect data retention and consent policies, and log access for compliance.

- Error handling and safe fallbacks
    - Handle low confidence or API failures with safe, transparent responses and automated escalation to human agents when needed.

- Observability and continuous improvement
    - Monitor intent accuracy, action success rates, and user feedback to refine NLU, workflows, and prompts iteratively.


### System & Techology Choices for the various steps with ChatBot Flow.

- Intent Detection.
  * Various NLU tools are available such as DialogFlow, AWS Lex, LUIS, Rasa, etc.
  * OpenAI function calling is a new and promising approach that can be used for intent detection when NLP/ NLU confidence score is low.
- Workflow
- Data Retrieval and Enrichment