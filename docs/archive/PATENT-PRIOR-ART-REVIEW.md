# Patent Prior-Art-Oriented Review

Date: March 30, 2026

This memo is a technical claim-positioning review based on the current repository implementation and the revised patent specification in [white+paper_banking_chat.md](./white+paper_banking_chat.md). It is not a legal opinion and should be used to prepare prosecution strategy, invention disclosure refinement, or outside-counsel review.

## Executive View

The strongest patent position in the current codebase is not the general idea of an AI chatbot connected to tools. That area is crowded. The most defensible position is the combination of:

1. A graph-based workflow that persists checkpoint state and resumes after human feedback.
2. A stage-aware policy engine that evaluates ingress, pre-tool, and response stages and records structured audit decisions in workflow state.
3. A hybrid MCP client abstraction that preserves a common logical tool surface while preferring native MCP transport and degrading to HTTP fallback.
4. Configuration-driven domain reuse layered on top of the orchestration, policy, and tool-abstraction mechanisms above.

If these elements are separated and claimed individually, several of them are likely to face novelty or obviousness pressure. If they are claimed as an interacting control architecture, the story is materially stronger.

## Likely Prior Art Pressure

The following areas are likely crowded and should not carry the patent narrative on their own:

1. Chat frontends, chat backends, session stores, and intent-routing pipelines.
2. Use of NLU engines and LLM fallback for intent detection.
3. Function calling, tool registries, plugin registries, or MCP-like tool interfaces in isolation.
4. Schema validation, RBAC checks, masking, and redaction as standalone controls.
5. Human confirmation before a write operation.
6. Graph-based workflow engines or checkpointing as general orchestration techniques.
7. Configuration-driven reuse of prompts, mappings, or tool lists without a tighter systems interaction.

These can still appear in dependent claims and embodiments, but they are weak anchors for the independent inventive concept.

## Strongest Claimable Combinations

### 1. Checkpointed Workflow Plus Policy-State Continuity

The current implementation ties workflow persistence to policy evaluation state rather than using checkpointing only for generic conversation memory. That is the most distinctive systems angle in the repo. The workflow carries pending tools, policy decisions, and policy traces across pause and resume boundaries, which is stronger than a generic “save conversation history” claim.

Repository evidence:

- [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L6)
- [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L61)
- [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L81)
- [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L125)
- [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L330)
- [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L360)
- [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L73)
- [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L271)

### 2. Stage-Aware Policy Engine Embedded in the Agent Workflow

The policy implementation is strongest where it is integrated into workflow stages and returns structured decisions such as allow, require confirmation, block, and transform. That is more defensible than generic “AI safety guardrails” language because it is tied to execution control and auditable state updates.

Repository evidence:

- [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L65)
- [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L116)
- [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L173)
- [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L207)
- [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L26)
- [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L78)
- [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L464)

### 3. Hybrid MCP Transport That Preserves Logical Tool Identity

The hybrid-client approach is a stronger transport claim than a plain “tool calling over MCP” statement. The useful angle is not only that two transports exist, but that the orchestration layer keeps the same logical tool identity and discovery model while switching transports.

Repository evidence:

- [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L12)
- [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L40)
- [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L58)
- [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L113)
- [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L149)
- [services/ai-orchestrator/src/server.js](../../services/ai-orchestrator/src/server.js#L36)

### 4. Configuration-Driven Domain Reuse Only When Tied to the Control Stack

Configuration-driven extension by itself is likely too broad. It becomes more plausible as an inventive point when tied to the fact that the same workflow graph, policy checkpoints, and tool-abstraction layer can be reused across domains by changing mappings, prompt templates, or tool metadata instead of rewriting orchestration logic.

The patent specification should therefore treat domain reuse as a supporting differentiator rather than the sole inventive concept.

## Claim Risk Review

### Claim 1

Claim 1 is directionally improved, but it will be strongest if read as a combination claim centered on policy checkpointing plus constrained tool execution, not as a generic chatbot system with familiar components.

Recommendation:

Keep prosecution emphasis on the interaction between the policy checkpoint, tool registry, MCP layer, and workflow continuity. Avoid arguing novelty based on frontend, backend, NLU, or LLM use alone.

### Claim 5

Claim 5 is one of the better claims because it ties graph nodes to checkpoint resume behavior. Its strength improves further when paired with policy-state continuity rather than generic workflow persistence.

Recommendation:

If narrowed during prosecution, prioritize the coupling between the policy evaluation node, the human-feedback node, and resumed execution of pending tools.

### Claim 9

Claim 9 is useful but should be treated carefully. “Use one protocol and fall back to HTTP” can be argued to be an obvious reliability pattern if not tied to preservation of tool identity, schema semantics, or discovery behavior.

Recommendation:

Emphasize that the orchestrator continues to reason over a stable logical tool abstraction while the transport changes underneath.

### Claim 10

Claim 10 is strategically valuable but carries implementation-risk pressure. The orchestrator-layer policy engine is strongly evidenced in code. The MCP-layer data policy engine is described in architecture and the patent text, but it is less concretely evidenced as a distinct runtime decision engine in the current codebase.

Recommendation:

Treat the dual-layer formulation as a preferred embodiment or dependent-claim position unless and until the MCP layer exposes explicit policy-evaluation code paths, traceability, and tests similar to the orchestrator layer.

### Claims 14, 18, and Domain-General Reuse Themes

These claims are likely useful for fallback coverage but are not the strongest novelty anchors. Hybrid NLU and config mapping are common design moves.

Recommendation:

Use them as secondary coverage around the stronger orchestration-control claims, not as the main story.

## Recommended Prosecution Posture

1. Center the independent claim narrative on workflow-stage control rather than generic chatbot plumbing.
2. Keep checkpoint resumption tied to policy-state and pending-tool continuity.
3. Keep the hybrid transport claim tied to stable logical tool identity and discovery semantics.
4. Treat MCP-side data policy as an optional second barrier unless code evidence is strengthened.
5. Avoid relying on banking examples, microservices, or generic LLM tool calling as novelty anchors.

## Evidence Gaps Worth Closing

The following improvements would strengthen the patent record if broader claims are important:

1. Add explicit MCP-layer policy evaluation code and tests, not only masking or validation behavior.
2. Persist and expose policy audit traces in a retrievable format suitable for demonstrations and examiner explanation.
3. Add tests or logs showing resume-after-confirmation without re-planning already completed steps.
4. Add tests or metrics showing transport fallback while preserving the same tool identifier and execution semantics.

## Practical Claim Strategy

The current repo supports a three-layer strategy:

1. Independent system claim on staged policy checkpointing plus checkpointed workflow and constrained tool execution.
2. Independent method claim on staged policy enforcement with resumed execution after human feedback.
3. Dependent claims covering hybrid MCP transport, MCP-layer data policy, hybrid NLU fallback, and domain configuration.

That structure matches the strongest implemented evidence and reduces dependence on crowded generic-agent territory.

## Proposed Fallback Claim Hierarchy

The following fallback hierarchy is cleaner for prosecution than treating the dependent claims as a flat list:

### System Track

1. Claim 1: staged policy checkpoints plus checkpointed tool execution and resumed workflow continuity.
2. Claim 5: graph-node structure plus persisted pending tools, policy decisions, and collected entities.
3. Claim 7: explicit confirmation gating for write operations.
4. Claim 9: hybrid MCP transport with preserved logical tool identity, schema semantics, and correlation metadata.
5. Claim 10: policy audit records stored as workflow-state metadata.
6. Claims 3 and 4: schema validation and MCP-side masking as narrower infrastructure fallbacks.

### Method Track

1. Claim 11: staged policy evaluation plus checkpoint persistence and resumed execution.
2. Claim 15: confirmation gating before write-operation execution.
3. Claim 17: storage of checkpoints, pending tools, and policy decisions for resume behavior.
4. Claim 19: explicit stage-by-stage policy enforcement and policy-state recording.
5. Claims 12 and 14: redaction and intent-to-tool mapping as narrower execution fallbacks.
6. Claims 13, 16, and 18: clarification, circuit-breaker, and hybrid-NLU fallback coverage.

If prosecution requires narrowing, the first narrowing move should be to keep claims 1 and 11 centered on policy-state continuity across paused and resumed tool execution rather than falling back immediately to generic chatbot or generic MCP language.