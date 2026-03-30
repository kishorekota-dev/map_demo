# U.S. Patent Application Draft

## Title of the Invention

SYSTEMS AND METHODS FOR IMPLEMENTING TASK-ORIENTED CHATBOTS WITH AUTONOMOUS FULFILLMENT WORKFLOWS USING AGENTIC AI AND MODEL CONTEXT PROTOCOL

## Cross-Reference to Related Applications

This application does not claim priority to any prior U.S. provisional application, non-provisional application, international application, or foreign application.

## Statement Regarding Federally Sponsored Research or Development

Not applicable.

## Incorporation by Reference

No material is incorporated by reference.

## Field of the Disclosure

The present disclosure relates generally to conversational computing systems and, more particularly, to task-oriented chatbot systems that use agentic artificial intelligence, staged policy-controlled workflow execution, and standardized tool interfaces to invoke domain services.

## Description of the Related Art

Conversational interfaces are increasingly used to provide self-service access to products, services, and support across many industries. Conventional chatbot systems commonly rely on rigid natural language understanding pipelines and tightly coupled integrations between user interfaces, backend services, and intent-specific business logic. Such systems are frequently difficult to extend because adding a new capability often requires coordinated modification of training data, intent handlers, backend integrations, and response-generation logic.

Conventional systems also struggle to preserve safe and coherent execution across multi-turn interactions. Users may be required to repeat information when conversational context is lost, while write operations may proceed with insufficient control over authorization, confirmation, and data exposure. Likewise, directly connecting large language models to enterprise APIs can introduce security, compliance, and reliability risks, particularly where tool access, data transformation, and execution gating are not explicitly governed.

Known tool-calling agent frameworks may expose generic tools or function interfaces, but they often do not provide a control architecture in which tool selection, workflow pause-and-resume behavior, and policy decisions are jointly persisted and reused across multi-turn fulfillment. Existing systems also may not preserve a stable logical tool abstraction when execution transports vary across environments.

Accordingly, there remains a need for systems and methods that combine conversational flexibility with policy-governed tool execution, checkpointed workflow continuity, and transport-independent domain-tool orchestration.

## Brief Summary of the Disclosure

In one aspect, the disclosure provides a task-oriented conversational system including a chat frontend, a chat backend, an artificial intelligence orchestrator, a Model Context Protocol (MCP) service layer, and one or more backend domain services. The orchestrator selects logical tools for a detected user intent, evaluates staged policy checkpoints, persists workflow state when human input is required, restores the persisted state upon receipt of such input, and resumes execution without recomputing previously completed workflow stages.

In some embodiments, the orchestrator evaluates policy at multiple workflow stages, including an ingress stage for the received request, a pre-tool stage for pending tool execution, and a response stage for generated output. Policy decisions may permit execution, require confirmation, block execution, or require transformation of data. Policy decisions may further be stored as workflow-state metadata associated with the session.

In some embodiments, the MCP service layer exposes tools through a standardized interface, validates input parameters against schemas, and invokes domain services. The orchestrator may access the tool layer through a hybrid transport abstraction that prefers native MCP protocol execution and falls back to an HTTP execution channel while preserving the same logical tool identity, schema semantics, and correlation metadata across transports.

In another aspect, the disclosure provides methods and non-transitory computer-readable media for carrying out the same staged, checkpointed, policy-governed conversational fulfillment process.

## Brief Description of the Drawings

FIG. 1 is a block diagram illustrating a task-oriented conversational architecture including a chat frontend, chat backend, natural language understanding layer, AI orchestrator, MCP service layer, and backend domain services.

FIG. 2 is a flow diagram illustrating processing of a user request, including intent detection, workflow matching, staged policy evaluation, tool execution, and response generation.

FIG. 3 is a schematic diagram illustrating an MCP tool registry and its relationship to configuration metadata and underlying domain service application programming interfaces.

## Detailed Description of Illustrative Embodiments

### System Overview

In one embodiment, the system includes a user-facing chat frontend, a session-managing chat backend, one or more natural language understanding components, an AI orchestrator, an MCP service layer, and backend domain services. The architecture separates conversational logic from business logic, thereby allowing the orchestrator to control fulfillment behavior without embedding domain-specific service implementations directly into the conversational layer.

The chat frontend may be implemented as a web, mobile, desktop, or voice interface. The chat backend may authenticate users, associate messages with conversation and session identifiers, retrieve prior session context, and forward user messages together with derived intent and entity information to the AI orchestrator.

### Intent Detection and Workflow Selection

In one embodiment, the chat backend invokes one or more natural language understanding components in a tiered sequence. A first NLU engine may detect known intents. A second, domain-specific NLU model may refine or supplement intent detection when confidence is below a threshold. If required, an LLM-based extraction component may be invoked to identify intent and entities from unstructured text.

After intent detection, the AI orchestrator selects one or more logical tools from a tool registry based on the detected intent and available entities. The orchestrator may also determine whether required entities are missing, ambiguous, or invalid. If so, the orchestrator may request clarification from the user before tool execution proceeds.

### Policy-Governed Checkpointed Orchestration

In one embodiment, the AI orchestrator is implemented as a graph-based workflow engine. The workflow engine may define nodes for intent analysis, policy evaluation, tool execution, human feedback, and response generation. The workflow engine may further maintain workflow state associated with a session identifier.

The orchestrator evaluates policy at multiple stages. At an ingress stage, the orchestrator may screen the user request for prompt-injection patterns, malformed content, or authentication preconditions. At a pre-tool stage, the orchestrator may determine whether execution of a pending logical tool should be allowed, blocked, transformed, or paused pending explicit confirmation. At a response stage, the orchestrator may determine whether a generated response should be redacted, transformed, or blocked before transmission.

When policy or entity-validation results indicate that clarification or confirmation is required, the orchestrator persists a workflow checkpoint. In some embodiments, the checkpoint stores at least the workflow state, one or more pending logical tool identifiers, collected entity data, and policy decisions associated with the paused execution path. When the requested user input is later received, the orchestrator restores the checkpoint and resumes execution without recomputing or re-planning previously completed workflow stages.

### Human-in-the-Loop Clarification and Confirmation

In one embodiment, the orchestrator compares extracted entities with machine-readable intent specifications that define required entities, optional entities, type restrictions, and domain-specific constraints. If the user request lacks a required entity, the orchestrator generates a targeted clarification prompt.

For write operations, such as funds transfers, profile changes, or card-block requests, the orchestrator may require explicit confirmation before tool execution. In some embodiments, the confirmation request is itself derived from a policy decision generated at the pre-tool stage. Once confirmation is received, the previously persisted checkpoint is restored and the pending logical tool is executed.

### MCP Service Layer and Domain Tool Execution

In one embodiment, the MCP service layer maintains a registry of tools. Each tool may be described by a logical tool name, a human-readable description, a schema specifying required and optional parameters, and metadata identifying whether the tool performs a read operation or a write operation.

The MCP service layer may respond to tool-discovery requests from the AI orchestrator, validate incoming tool invocation parameters, invoke corresponding backend domain services, and return structured results. The backend domain services may include banking systems, e-commerce systems, healthcare systems, telecommunications systems, customer-service platforms, or other domain implementations.

The MCP service layer may additionally apply access-control, masking, redaction, filtering, tokenization, or data-minimization rules before data is returned to the orchestrator. Such processing may occur before data is included in prompts provided to a large language model.

### Hybrid MCP Transport and Logical Tool Preservation

In one embodiment, the orchestrator communicates with the MCP service layer through a hybrid transport abstraction. The abstraction may first attempt standardized MCP protocol discovery and execution. If the preferred transport is unavailable or incompatible with the target environment, the abstraction may fall back to an HTTP execution channel.

In some embodiments, the orchestrator preserves the same logical tool identity across transports. Thus, the tool selected in workflow state remains the same logical tool even if the transport used to execute that tool changes. In some embodiments, parameter schema semantics and correlation metadata are likewise preserved across transport selection.

### Data Protection and Policy Evaluation

In one embodiment, policy enforcement is distributed across the orchestrator and, optionally, the MCP service layer. The orchestrator-level policy engine may evaluate whether content or execution should be allowed, blocked, transformed, or confirmed. The MCP layer may additionally enforce role-based access control, schema validation, output filtering, or regulated-data masking.

Sensitive fields may be masked or redacted before they are exposed to a large language model. Examples include truncating account numbers to last-four display, omitting government identifiers, tokenizing sensitive values, and suppressing internal instructions or privileged backend data. In some embodiments, policy decisions are stored as workflow-state metadata including stage identifiers, decision codes, and transformation instructions.

### Response Generation

In one embodiment, once the necessary tool results are obtained, the orchestrator constructs one or more prompts that incorporate the user request, session context, detected intent, validated entities, and sanitized tool outputs. The orchestrator invokes one or more large language models to generate a natural-language response. The response may then be subjected to response-stage policy evaluation before transmission to the user.

The final response may include concise natural-language text, follow-up options, and structured action suggestions. The orchestrator may also suppress or revise content that does not satisfy policy, formatting, or domain-specific requirements.

### Configuration-Driven Domain Specialization

In one embodiment, the orchestrator behavior is configured using machine-readable mappings between intents, tools, prompt templates, entity rules, and validation rules. This allows the same orchestration framework to be reused across multiple domains without rewriting core orchestration logic. New domains may be introduced by defining new intent labels, tool mappings, prompt templates, and validation configurations.

### Example Banking Embodiment

In one illustrative embodiment, the domain services correspond to banking functions including account retrieval, transaction review, funds transfer, dispute initiation, and card management. A user may request a balance inquiry, a funds transfer, or a card-block action through the chat frontend. The backend authenticates the user, the orchestrator selects one or more logical tools, policy checkpoints determine whether clarification or confirmation is needed, the workflow is checkpointed if required, and execution resumes upon user response. The resulting response is generated from sanitized tool outputs and returned to the user.

References to banking in this document are illustrative and non-limiting. The same architecture may be used in other customer-service or enterprise domains.

## Claims

### What is claimed is:

1. A system for providing task-oriented conversational services, comprising:

   a chat frontend configured to receive user messages and present chatbot responses;

   a chat backend configured to authenticate users, manage chat sessions, invoke at least one natural language understanding (NLU) component to determine user intent and entities, and forward user messages with detected intent and associated session context;

   an artificial intelligence (AI) orchestrator configured to:

   (i) receive user messages, detected intent, entities, and session context from the chat backend;

   (ii) select, from a tool registry, at least one logical tool corresponding to the user intent and store an identifier of the at least one logical tool in workflow state;

   (iii) evaluate a first policy checkpoint at an ingress stage for the user message and a second policy checkpoint at a pre-tool stage for the at least one logical tool, each policy checkpoint returning a structured decision selected from allow, require_confirmation, block, and transform;

   (iv) in response to the structured decision requiring confirmation or additional user input, persist a workflow checkpoint comprising at least the workflow state, the identifier of the at least one logical tool, and the structured decision;

   (v) upon receiving the confirmation or additional user input, restore the workflow checkpoint and resume execution without recomputing previously completed workflow stages;

   (vi) invoke the at least one logical tool via a Model Context Protocol (MCP) service layer;

   (vii) evaluate a third policy checkpoint at a response stage for outputs produced by the at least one logical tool; and

   (viii) generate a natural language response based on outputs that satisfy the third policy checkpoint using a large language model (LLM);

   an MCP service layer configured to expose the at least one logical tool to the AI orchestrator via a standardized protocol, preserve a logical tool identity independent of transport selection, validate input parameters against a schema, and invoke one or more backend domain services; and

   a plurality of backend domain services configured to perform domain-specific functions,

   wherein conversational logic executed by the AI orchestrator is decoupled from business logic implemented by the backend domain services.

2. The system of claim 1, wherein the chat backend is further configured to invoke a plurality of NLU components in a hybrid sequence, including a first NLU engine configured to detect known intents, a second domain-specific NLU model configured to refine or supplement the detected intent, and an LLM-based function-calling component configured to determine intent and entities when the first NLU engine and the second NLU model return confidence scores below a threshold.

3. The system of claim 1, wherein the tool registry exposed by the MCP service layer comprises a plurality of tools each described by a name, a textual description, and a JSON schema defining required and optional input parameters, and wherein the MCP service layer is configured to reject tool invocations that fail schema validation.

4. The system of claim 1, wherein the MCP service layer is configured to apply masking or redaction policies to sensitive fields in tool outputs prior to providing the outputs to the AI orchestrator for inclusion in prompts to the LLM.

5. The system of claim 1, wherein the AI orchestrator is implemented using a graph-based workflow engine defining a plurality of nodes including at least an intent analysis node, a policy evaluation node, a tool execution node, a human-feedback node, and a response generation node, a plurality of edges defining execution order between the plurality of nodes, and a checkpoint mechanism configured to persist pending tool identifiers, policy decisions, and collected entities and to resume execution after a human-feedback event without re-planning previously completed stages.

6. The system of claim 1, wherein the chat backend is further configured to associate each user message with a conversation identifier and a session identifier and to store conversation history in a session store accessible by the AI orchestrator to provide multi-turn conversational context.

7. The system of claim 1, wherein the AI orchestrator is further configured to determine that a selected intent corresponds to a write operation that modifies state in at least one backend domain service and, in response, generate a confirmation message and require explicit user confirmation before invoking the at least one tool associated with the write operation.

8. The system of claim 1, wherein the AI orchestrator is further configured to escalate a conversation to a human agent upon detecting at least one of a sequence of low-confidence intents exceeding a predetermined count, repeated tool failures, a user request for escalation, or a compliance-sensitive intent.

9. The system of claim 1, wherein the MCP service layer is further configured to support a tool discovery operation through which the AI orchestrator requests and receives a list of currently available tools and their respective input schemas, enabling dynamic adaptation of workflows without modifying AI orchestrator code, and wherein the AI orchestrator is further configured to access the MCP service layer through a hybrid transport abstraction that prefers native MCP protocol execution and falls back to an HTTP execution channel while preserving the same logical tool name, parameter schema semantics, and correlation metadata across transports.

10. The system of claim 1, wherein each policy checkpoint returns an audit record comprising a stage identifier, a decision code, and optional transformation instructions, and wherein the audit record is stored as workflow-state metadata associated with the session.

11. A computer-implemented method for providing task-oriented conversational services, comprising:

   receiving, at a chat backend, a user message from a chat frontend together with authentication information;

   validating the authentication information and associating the user message with a session context;

   determining, by the chat backend, a user intent and one or more entities using at least one natural language understanding (NLU) component;

   sending the user message, detected intent, entities, and session context to an AI orchestrator;

   selecting, based on the user intent, at least one logical tool from a plurality of tools exposed via a Model Context Protocol (MCP) service layer and storing an identifier of the at least one logical tool in workflow state;

   evaluating, by the AI orchestrator, an ingress-stage policy checkpoint for the user message and a pre-tool policy checkpoint for the at least one logical tool, each policy checkpoint returning a structured decision selected from allow, require_confirmation, block, and transform;

   in response to the structured decision requiring confirmation or additional user input, persisting a workflow checkpoint comprising at least the workflow state, the identifier of the at least one logical tool, and the structured decision;

   upon receiving the confirmation or additional user input, restoring the workflow checkpoint and resuming execution without recomputing previously completed workflow stages;

   invoking, via the MCP service layer, the at least one logical tool to perform a domain-specific function using one or more backend domain services;

   receiving, at the AI orchestrator, output data from the at least one logical tool;

   evaluating a response-stage policy checkpoint for the output data or for a draft response derived from the output data;

   constructing a prompt including at least the user message, output data that satisfies the response-stage policy checkpoint, and one or more safety instructions;

   invoking a large language model using the constructed prompt to generate a natural language response; and

   returning the natural language response to the chat frontend for display to the user.

12. The method of claim 11, further comprising masking or redacting, prior to constructing the prompt, one or more sensitive fields in the output data according to domain-specific policies to prevent exposure of full account numbers, full card numbers, or government identifiers to the large language model.

13. The method of claim 11, further comprising determining that a confidence score associated with the user intent is below a threshold and, in response, transmitting a clarification question to the chat frontend requesting additional information from the user.

14. The method of claim 11, wherein selecting the at least one tool comprises consulting a configuration mapping from intent labels to sets of tools and determining a subset of tools based on available entities and authorization data associated with the session context.

15. The method of claim 11, further comprising, in response to detecting that the user intent corresponds to a write operation, generating a confirmation message describing the operation and its impact, transmitting the confirmation message to the user, and proceeding to invoke the at least one tool only upon receiving an explicit confirmation input from the user.

16. The method of claim 11, further comprising detecting repeated failures or timeouts when invoking the at least one tool, opening a circuit breaker condition in which further invocations of one or more affected backend domain services are temporarily suspended, and providing the user with a fallback message or routing to a human agent.

17. The method of claim 11, further comprising maintaining conversation history, workflow checkpoints, pending tool identifiers, and policy decisions in a session store, including relevant prior messages from the conversation history in the constructed prompt to provide multi-turn conversational context, and resuming workflow execution from a stored checkpoint after receiving user feedback to a clarification request or confirmation request without re-executing previously completed workflow stages.

18. The method of claim 11, wherein determining a user intent comprises invoking, by the chat backend, a first NLU engine and receiving a confidence score, accepting the detected intent if the confidence score is above a first threshold, invoking a second domain-specific NLU model if the confidence score is below the first threshold, and invoking an LLM-based function-calling component to extract intent and entities if the second NLU model returns a low confidence score.

19. The method of claim 11, further comprising executing staged policy enforcement during conversational services by evaluating, by a policy engine, a user request at an ingress stage to detect prompt-injection patterns or authentication preconditions, evaluating, by the policy engine, a pending tool invocation at a pre-tool stage to determine whether to allow execution, require explicit confirmation, or block the invocation based on operation attributes or policy thresholds, evaluating, by the policy engine, drafted language responses at a response stage to redact sensitive values or suppress internal-instruction leakage prior to returning the response to a user, and recording at least one policy decision and at least one pending tool identifier as workflow-state metadata associated with the session.

20. A non-transitory computer-readable medium storing instructions that, when executed by one or more processors of an AI orchestration system in communication with a chat backend, an MCP service layer, and a plurality of domain microservices, cause the AI orchestration system to perform the method of claim 11.

## Abstract of the Disclosure

A task-oriented conversational system includes a chat frontend, a chat backend, an artificial intelligence orchestrator, a Model Context Protocol (MCP) service layer, and backend domain services. The orchestrator selects one or more logical tools for a detected intent, evaluates staged policy checkpoints for request ingress, pending tool execution, and response generation, and persists workflow state when clarification or confirmation is required. Upon receiving user feedback, the orchestrator restores the persisted workflow state and resumes execution without recomputing previously completed workflow stages. In some embodiments, the orchestrator accesses the MCP service layer through a hybrid transport abstraction that prefers native MCP protocol execution and falls back to an HTTP execution channel while preserving logical tool identity and schema semantics across transports. The disclosed architecture improves governance, resumability, and domain portability for enterprise conversational systems.