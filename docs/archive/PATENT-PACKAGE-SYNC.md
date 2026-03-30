# Patent Package Sync Note

Date: March 30, 2026

## Canonical Source

The canonical editable patent source is [white+paper_banking_chat.md](./white+paper_banking_chat.md).

That source was updated on March 30, 2026 to better align the invention narrative with the implemented architecture in the repository.

## What Changed in the Canonical Source

The following sections were revised:

1. Abstract at [white+paper_banking_chat.md](./white+paper_banking_chat.md#abstract)
2. Summary of the Invention at [white+paper_banking_chat.md](./white+paper_banking_chat.md#summary-of-the-invention)
3. Checkpointed Workflow Resumption at [white+paper_banking_chat.md](./white+paper_banking_chat.md#checkpointed-workflow-resumption)
4. Hybrid MCP Transport and Discovery at [white+paper_banking_chat.md](./white+paper_banking_chat.md#hybrid-mcp-transport-and-discovery)
5. Stage-Aware Policy Enforcement and Complementary Data Defenses at [white+paper_banking_chat.md](./white+paper_banking_chat.md#stage-aware-policy-enforcement-and-complementary-data-defenses)
6. Claims 1, 5, 9, 10, 17, and 19 in the claims section near the end of the document

The revised narrative emphasizes:

1. Stage-specific policy checkpoints in the AI workflow
2. Checkpointed and resumable graph execution after human feedback
3. Hybrid MCP transport with HTTP fallback while preserving logical tool identity
4. Configuration-driven domain reuse as a supporting differentiator

## DOCX Package Status

Existing binary packages in this folder include multiple DOCX variants such as:

1. `white-paper-banking-chat-uspto-v4.docx`
2. `white-paper-banking-chat-uspto-v3.docx`
3. `white-paper-banking-chat-uspto-v2.docx`
4. `white-paper-banking-chat-uspto.docx`
5. `white-paper-banking-chat.docx`
6. `white_paper_banking_chat.docx`
7. `agentic_chatbot.docx`

Those binary packages were not updated in this workspace session because binary DOCX editing and conversion were not available through the current tool path, and terminal-based conversion was blocked by the workspace file-system provider.

On March 30, 2026, two direct execution paths were attempted for export:

1. `run_in_terminal` for a toolchain probe and export command sequence.
2. `create_and_run_task` for the same probe as a VS Code task fallback.

Both failed before command execution with an `ENOPRO: No file system provider found for resource 'file:///workspaces/map_demo'` error, which indicates an execution-channel or workspace-provider issue rather than a missing export dependency inside the repository.

## Recommended Regeneration Target

Create a new binary package rather than overwriting older versions. Recommended filename:

`white-paper-banking-chat-uspto-v5.docx`

## Regeneration Checklist

When regenerating the DOCX package, verify that the following source updates are present in the exported document:

1. Abstract describes staged policy checkpoints, checkpointed workflow state, and hybrid MCP fallback.
2. Summary of the Invention emphasizes explicit workflow-stage policy evaluation rather than only generic AI safety.
3. The detailed description includes the new checkpoint-resumption section.
4. The detailed description includes the hybrid MCP transport and discovery section.
5. The policy section distinguishes the implemented orchestrator-layer engine from the optional MCP-layer embodiment.
6. Claims 1, 5, 9, 10, 17, and 19 match the revised markdown language.
7. Document metadata shows Version 1.1 and Date March 30, 2026.

## Recommended Export Approach

1. Use [white+paper_banking_chat.md](./white+paper_banking_chat.md) as the source of truth.
2. Run [prepare-patent-docx.mjs](./prepare-patent-docx.mjs) and the commands in [PATENT-DOCX-EXPORT-RECIPE.md](./PATENT-DOCX-EXPORT-RECIPE.md) to generate an export-ready markdown file and rendered SVG figures.
3. Export to a new DOCX file rather than editing older binaries in place.
4. Preserve claim numbering and list indentation exactly.
5. Re-run a visual review on headings, numbered claims, and table-of-contents formatting after export.

## Companion Review Memo

For claim-positioning guidance before final DOCX regeneration, see [PATENT-PRIOR-ART-REVIEW.md](./PATENT-PRIOR-ART-REVIEW.md).