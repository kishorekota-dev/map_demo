# Patent Amendment Script

Date: March 30, 2026

This document is a one-pass amendment and argument playbook for likely §102 and §103 office action patterns against the current claim set in [white+paper_banking_chat.md](./white+paper_banking_chat.md). It is a technical strategy document and not legal advice.

## Objective

The objective is to preserve the core inventive theory while providing a practical response sequence that can be used quickly when an examiner cites generic chatbot, workflow, policy, or transport references.

The core theory that should be preserved throughout prosecution is:

1. The orchestrator selects a logical tool and stores its identifier in workflow state.
2. Policy is evaluated as staged execution control, not merely as prompt or output filtering.
3. A checkpoint is persisted when confirmation or additional user input is required.
4. The system resumes execution from the checkpoint without recomputing previously completed stages.
5. Tool execution remains tied to a transport-independent logical tool abstraction.

## Use Order

For any rejection pattern, use the following order:

1. Argue the claims as currently written before amending.
2. Add only the next narrowest limitation that directly defeats the cited teaching.
3. Prefer amendments that strengthen policy-state continuity and checkpointed execution before relying on generic fallback features.
4. Mirror the system-track move in the method-track move unless the rejection record makes that unnecessary.
5. Let Claim 20 follow Claim 11 unless there is a medium-specific issue.

## Do Not Concede

Do not concede any of the following as inherent in the cited art unless the reference actually discloses them:

1. A policy checkpoint returning a structured decision selected from allow, require_confirmation, block, and transform.
2. A persisted checkpoint that stores a pending logical tool identifier together with a policy decision.
3. Resume-after-feedback execution without recomputing previously completed stages.
4. Preservation of the same logical tool name, parameter schema semantics, and correlation metadata across different transports.
5. Workflow-state metadata that stores policy audit records.

## Pattern A: §102 Against a Generic Tool-Calling Chat Assistant

### Typical Examiner Theory

The examiner cites a reference that discloses:

1. A chat frontend or assistant.
2. Session context.
3. Tool or API invocation.
4. An LLM or NLU component.

The examiner then reads the current independent claim at a high level and treats the cited tool call as satisfying the claimed orchestrator flow.

### First Argument Set

Argue that the cited reference fails to disclose:

1. Selection and storage of a logical tool identifier in workflow state.
2. Separate ingress-stage and pre-tool-stage policy checkpoints.
3. A structured policy decision that can require confirmation or block execution.
4. Persisting a checkpoint in response to required confirmation or additional user input.
5. Restoring that checkpoint and resuming execution without recomputing prior stages.

### First Amendment Move

Amend Claim 1 by expressly incorporating the checkpoint contents and resume behavior already reflected in current Claims 5 and 10 logic:

1. The persisted checkpoint stores the pending logical tool identifier.
2. The persisted checkpoint stores the structured policy decision.
3. Resume occurs without recomputing previously completed workflow stages.

Mirror in Claim 11:

1. Add pending tool identifiers and policy decisions to the checkpoint.
2. Add no-recomputation resume language.

### Second Amendment Move If Needed

Add policy-audit metadata from current Claim 10.

### Short Response Shell

"Reference A does not disclose the claimed execution-control architecture. The claims require an AI orchestrator that stores a logical tool identifier in workflow state, evaluates staged policy checkpoints before tool execution, persists a checkpoint when confirmation or additional user input is required, and restores that checkpoint to resume execution without recomputing previously completed stages. Reference A discloses tool invocation in a conversational system, but it does not disclose claimed policy-state continuity across paused and resumed execution."

## Pattern B: §102 Against a Generic Workflow Graph or Checkpointing Reference

### Typical Examiner Theory

The examiner cites a workflow engine, graph engine, or checkpoint persistence reference and maps it to Claims 1, 5, 11, or 17.

### First Argument Set

Argue that the cited reference fails to disclose:

1. A logical tool selected from a tool registry for conversational fulfillment.
2. Staged policy evaluation at ingress, pre-tool, and response phases.
3. A checkpoint tied to pending tool execution rather than generic workflow persistence.
4. A transport-independent logical tool abstraction through an MCP layer.

### First Amendment Move

Add the transport-preserving logical tool limitations from current Claim 9 into Claim 1 if needed:

1. Same logical tool name across transports.
2. Same parameter schema semantics across transports.
3. Same correlation metadata across transports.

Mirror in Claim 11 by clarifying that the stored logical tool identifier remains associated with the selected tool through execution.

### Second Amendment Move If Needed

Add graph-node specificity from current Claim 5:

1. Policy evaluation node.
2. Human-feedback node.
3. Tool execution node.
4. Response generation node.

### Short Response Shell

"Reference B may disclose generic workflow persistence, but it does not disclose checkpointed conversational tool execution governed by staged policy checkpoints. The present claims require a pending logical tool selected from a registry, checkpoint persistence tied to that tool and to policy decisions, and resumed execution within a controlled tool-governance flow rather than generic workflow restart behavior."

## Pattern C: §103 Combining an LLM Agent Reference with an AI Safety or Guardrail Reference

### Typical Examiner Theory

The examiner combines:

1. A tool-calling agent or assistant reference.
2. A policy, safety, toxicity, or prompt-filtering reference.

The theory is that it would have been obvious to make the agent "safer" by adding guardrails.

### First Argument Set

Argue that the combination still does not teach or suggest:

1. Policy as staged execution control over pending tool invocation.
2. A policy result that can require confirmation or block execution.
3. Persistence of policy results as workflow-state metadata.
4. Resume-after-feedback execution that uses persisted policy context.

### First Amendment Move

Add the policy audit and state-recording limitations from current Claim 10 into Claim 1 and from current Claim 19 into Claim 11.

If needed, add current Claim 7 and Claim 15 confirmation gating.

### Short Response Shell

"The proposed combination would, at most, yield a system that filters prompts or outputs around an agent. It would not yield the claimed architecture in which policy checkpoints govern whether pending tool execution proceeds, pauses for confirmation, or is blocked, and in which those policy decisions are persisted as workflow-state metadata for resumed execution after user feedback."

## Pattern D: §103 Combining a Workflow Engine with a Human Confirmation Reference

### Typical Examiner Theory

The examiner combines:

1. A workflow or graph orchestration reference.
2. A confirmation step for transactions or approvals.

### First Argument Set

Argue that the combination still lacks:

1. A persisted checkpoint storing both a pending logical tool identifier and a policy decision.
2. Resume without recomputing previously completed stages.
3. Response-stage policy evaluation after tool execution.

### First Amendment Move

Amend Claim 1 to expressly state that the checkpoint stores:

1. The pending logical tool identifier.
2. The structured policy decision.
3. Collected entity state.

Amend Claim 11 to expressly state the same for the method track.

### Second Amendment Move If Needed

Add current Claim 7 or Claim 15 to make the confirmation stage expressly tied to write-operation tool execution.

### Short Response Shell

"Reference C and Reference D may suggest pausing for approval, but they do not teach the claimed checkpointed execution model in which a pending logical tool and a policy decision are persisted together and later used to resume execution without re-planning completed stages. The present claims require more than a generic approval gate."

## Pattern E: §103 Combining Tool Discovery with Protocol Fallback or Multi-Transport Execution

### Typical Examiner Theory

The examiner combines:

1. A tool discovery or plugin reference.
2. A transport fallback, failover, or reliability reference.

### First Argument Set

Argue that the combination still fails to suggest:

1. Preservation of the same logical tool identity across transports.
2. Preservation of schema semantics across transports.
3. Preservation of correlation metadata across transports.
4. A workflow engine that reasons over the logical tool independently of transport selection.

### First Amendment Move

Import the full current Claim 9 transport-preservation language into Claim 1 if the system claim is under pressure. For Claim 11, add that the selected logical tool remains identified in workflow state while execution proceeds through a preferred transport or fallback transport.

### Short Response Shell

"Fallback transport by itself is a general reliability technique. The claims are narrower. They require the orchestrator to maintain a stable logical tool abstraction while transport selection changes underneath, including preservation of logical tool identity, parameter schema semantics, and correlation metadata across transports. The cited art does not teach or suggest that control architecture."

## Pattern F: §102 or §103 Against the Method Claims Only

### Recommended Mirror Moves

If the system claims appear stronger than the method claims, make the method track mirror the strongest system limitations in the following order:

1. Add pending logical tool identifiers to persisted workflow state.
2. Add policy decisions to persisted workflow state.
3. Add no-recomputation resume language.
4. Add response-stage policy evaluation.
5. Add explicit write-operation confirmation gating.

### Method Response Shell

"The cited art may disclose message processing and tool invocation, but it does not disclose the claimed method sequence in which a logical tool identifier and policy decision are persisted as workflow state, execution pauses for confirmation or additional user input, and resumed execution proceeds without recomputing previously completed stages."

## One-Pass Narrowing Sets

If allowance is the priority over breadth, the following one-pass narrowing sets are the strongest repo-backed combinations.

### System One-Pass Set

Use Claim 1 with the substance of Claims 5, 7, 9, and 10.

That yields the following condensed feature set:

1. Staged policy checkpoints.
2. Pending logical tool identifiers and policy decisions in checkpoint state.
3. Resume without re-planning completed stages.
4. Explicit confirmation before write-operation execution.
5. Same logical tool identity and schema semantics across transports.
6. Policy audit record stored in workflow-state metadata.

### Method One-Pass Set

Use Claim 11 with the substance of Claims 15, 17, and 19.

That yields the following condensed feature set:

1. Persist pending logical tool identifiers and policy decisions.
2. Resume after feedback without recomputing completed stages.
3. Apply staged policy enforcement across ingress, pre-tool, and response stages.
4. Require explicit confirmation before write-operation execution.

## Evidence Hooks for Argument Support

Use the following implementation anchors when preparing declarations, technical summaries, or examiner interviews:

1. Workflow-state and checkpoint behavior: [services/ai-orchestrator/src/workflows/bankingChatWorkflow.js](../../services/ai-orchestrator/src/workflows/bankingChatWorkflow.js#L61)
2. Policy-stage execution control: [services/ai-orchestrator/src/services/policyEngine.js](../../services/ai-orchestrator/src/services/policyEngine.js#L65)
3. Ingress policy persistence: [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L73)
4. Pre-tool policy handling and resumed execution: [services/ai-orchestrator/src/services/workflowService.js](../../services/ai-orchestrator/src/services/workflowService.js#L271)
5. Hybrid logical-tool transport handling: [services/ai-orchestrator/src/services/enhancedMCPClient.js](../../services/ai-orchestrator/src/services/enhancedMCPClient.js#L58)

## Companion Documents

1. [white+paper_banking_chat.md](./white+paper_banking_chat.md)
2. [PATENT-PRIOR-ART-REVIEW.md](./PATENT-PRIOR-ART-REVIEW.md)
3. [PATENT-PROSECUTION-PACKAGE.md](./PATENT-PROSECUTION-PACKAGE.md)