# Patent Prosecution Package

Date: March 30, 2026

This document organizes the current claim set in [white+paper_banking_chat.md](./white+paper_banking_chat.md) into a prosecution-oriented package with a cleaner independent/dependent structure, narrowing ladders, and response themes. It is a technical strategy document and not legal advice.

## Filing Posture

The best filing position in the current repository is to treat the invention as a control architecture for tool-governed conversational execution, not as a generic AI chatbot stack.

The primary inventive combination is:

1. Workflow-stage policy evaluation.
2. Persisted workflow state containing pending logical tool identifiers and policy decisions.
3. Resume-after-human-feedback execution without recomputing previously completed stages.
4. Tool execution through a transport-independent logical tool abstraction.

The current claim set already reflects this direction. This package arranges those claims into a cleaner prosecution path.

## Recommended Independent Claims

### System Independent Claim

Use current Claim 1 as the principal system claim, with emphasis on the following required combination:

1. A logical tool is selected and stored in workflow state.
2. Policy is evaluated at ingress and pre-tool stages.
3. Confirmation or clarification causes a checkpoint to be persisted.
4. The checkpoint is restored and execution resumes without recomputing prior stages.
5. The logical tool is executed through an MCP layer that preserves identity independent of transport selection.
6. A response-stage policy checkpoint is applied before response generation completes.

This should remain the main system claim because it best captures the end-to-end control loop.

### Method Independent Claim

Use current Claim 11 as the principal method claim, with emphasis on the same sequence expressed procedurally:

1. Select logical tool and store its identifier.
2. Evaluate ingress and pre-tool policy checkpoints.
3. Persist checkpoint when confirmation or additional input is needed.
4. Restore checkpoint and resume execution after user feedback.
5. Execute the tool and evaluate response-stage policy.
6. Generate the final natural-language response from policy-compliant output.

### Medium Claim

Retain current Claim 20 as a non-transitory medium claim that follows the method track.

## Recommended Dependent Claim Trees

### System Tree

Primary narrowing path:

1. Claim 1
2. Claim 5
3. Claim 10
4. Claim 7
5. Claim 9

Secondary narrowing path:

1. Claim 1
2. Claim 3
3. Claim 4
4. Claim 6
5. Claim 8

Crowded-feature path that should remain secondary:

1. Claim 1
2. Claim 2

### Method Tree

Primary narrowing path:

1. Claim 11
2. Claim 17
3. Claim 19
4. Claim 15

Secondary narrowing path:

1. Claim 11
2. Claim 12
3. Claim 14
4. Claim 16

Crowded-feature path that should remain secondary:

1. Claim 11
2. Claim 13
3. Claim 18

## Amendment Ladder: System Claim

### Ladder S0

Current Claim 1 as filed.

Use when the examiner record is still open and the combination itself can be argued as a whole.

### Ladder S1

Add that the persisted checkpoint stores:

1. The pending logical tool identifier.
2. The structured policy decision.
3. Collected entity state.

Purpose:

This step makes the checkpoint more than generic workflow persistence and ties it to executable policy-state continuity.

### Ladder S2

Add that resumed execution occurs without re-planning or re-executing previously completed stages.

Purpose:

This distinguishes the system from generic multi-turn chat memory and generic workflow restarts.

### Ladder S3

Add graph-engine structure from Claim 5:

1. Policy evaluation node.
2. Human-feedback node.
3. Tool execution node.
4. Response generation node.

Purpose:

This converts the claim into a more concrete workflow-control architecture if the examiner pushes on functional abstraction.

### Ladder S4

Add transport preservation language from Claim 9:

1. Same logical tool name.
2. Same parameter schema semantics.
3. Same correlation metadata across transports.

Purpose:

This is the right narrowing move if the examiner finds generic checkpointed workflows but not the transport-independent tool abstraction.

### Ladder S5

Add explicit write-operation confirmation gating from Claim 7.

Purpose:

This is useful if the record needs a more operational safety boundary tied directly to mutating actions.

### Ladder S6

Add policy audit record storage from Claim 10.

Purpose:

This supports auditable governance and provides a concrete artifact produced by the policy engine.

## Amendment Ladder: Method Claim

### Ladder M0

Current Claim 11 as filed.

### Ladder M1

Add that the persisted checkpoint includes pending tool identifiers and policy decisions, as reflected in Claim 17 and Claim 19.

Purpose:

This narrows to the most defensible procedural sequence in the codebase.

### Ladder M2

Add that resumed execution occurs without recomputing previously completed workflow stages.

Purpose:

This separates the method from ordinary request replay or simple conversation continuation.

### Ladder M3

Add explicit confirmation gating before execution of a write operation from Claim 15.

Purpose:

This gives a clean safety-specific narrowing step.

### Ladder M4

Add staged policy recording from Claim 19.

Purpose:

This ties the method to persistent policy-state metadata rather than transient guardrail logic.

### Ladder M5

Add redaction and mapping limitations from Claims 12 and 14 only if needed.

Purpose:

These are useful fallback details but should not become the central inventive theme.

## Office Action Response Themes

### Theme 1: Not a Generic Chatbot

If the examiner cites conversational systems, respond that the claimed subject matter is not directed merely to a chatbot, intent router, or LLM prompt manager. The claims require staged policy checkpoints, persistent pending-tool workflow state, and resume-after-feedback execution tied to tool governance.

### Theme 2: Not Generic Checkpointing

If the examiner cites generic workflow persistence or graph execution, respond that the claims are directed to checkpointing that stores executable governance context, including pending logical tool identifiers and policy outcomes, and uses that stored context to resume controlled tool execution.

### Theme 3: Not Generic Safety Guardrails

If the examiner cites prompt filtering or AI safety systems, respond that the claimed policy engine is not merely screening text. It controls staged execution decisions that govern whether tool invocation can proceed, must pause for confirmation, or must be blocked.

### Theme 4: Not Obvious Transport Fallback

If the examiner treats hybrid transport as an obvious reliability pattern, respond that the relevant limitation is preservation of logical tool identity, schema semantics, and correlation behavior across transport changes, allowing the orchestration layer to remain stable while the transport layer varies.

## Evidence Map for Prosecution Support

### Workflow State and Resume Behavior

1. [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L61)
2. [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L81)
3. [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L330)
4. [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L360)
5. [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L271)

### Policy Engine Staging

1. [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L65)
2. [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L116)
3. [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L173)
4. [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L73)

### Hybrid MCP Transport

1. [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L12)
2. [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L58)
3. [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L149)
4. [services/ai-orchestrator/src/server.js](../../services/ai-orchestrator/src/server.js#L36)

## Do Not Lead With

The following should not be the first line of argument during prosecution unless necessary:

1. Generic use of NLU plus LLM fallback.
2. Generic schema validation.
3. Generic masking or redaction.
4. Banking-specific workflows.
5. Microservices architecture by itself.

## Recommended Filing Bundle

The clean repo-backed filing bundle is:

1. [white+paper_banking_chat.md](./white+paper_banking_chat.md)
2. [PATENT-PRIOR-ART-REVIEW.md](./PATENT-PRIOR-ART-REVIEW.md)
3. [PATENT-PROSECUTION-PACKAGE.md](./PATENT-PROSECUTION-PACKAGE.md)
4. [PATENT-AMENDMENT-SCRIPT.md](./PATENT-AMENDMENT-SCRIPT.md)
5. [PATENT-MOCK-OFFICE-ACTION-RESPONSE.md](./PATENT-MOCK-OFFICE-ACTION-RESPONSE.md)
6. [PATENT-PACKAGE-SYNC.md](./PATENT-PACKAGE-SYNC.md)
7. [PATENT-DOCX-EXPORT-RECIPE.md](./PATENT-DOCX-EXPORT-RECIPE.md)