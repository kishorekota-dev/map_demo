# Patent DOCX Export Recipe

Date: March 30, 2026

## Purpose

This document provides a concrete export path for producing a new DOCX package from the canonical patent source [white+paper_banking_chat.md](./white+paper_banking_chat.md).

The recommended output file is:

`docs/archive/white-paper-banking-chat-uspto-v5.docx`

## Inputs

Required source files:

1. [white+paper_banking_chat.md](./white+paper_banking_chat.md)
2. [figures/fig1-system-architecture.mmd](./figures/fig1-system-architecture.mmd)
3. [figures/fig2-request-flow.mmd](./figures/fig2-request-flow.mmd)
4. [figures/fig3-tool-registry.mmd](./figures/fig3-tool-registry.mmd)
5. [prepare-patent-docx.mjs](./prepare-patent-docx.mjs)

Alternative filing-oriented source:

1. [PATENT-USPTO-STYLE-DRAFT.md](./PATENT-USPTO-STYLE-DRAFT.md)
2. [export-uspto-docx.sh](./export-uspto-docx.sh)

## Tooling

Recommended tooling on Ubuntu:

1. `pandoc`
2. `node`
3. `npx @mermaid-js/mermaid-cli`

Example installation commands:

```bash
sudo apt-get update
sudo apt-get install -y pandoc
npm install --no-save @mermaid-js/mermaid-cli
```

## Export Steps

Run the following from the repository root:

```bash
set -e
cd /workspaces/map_demo

npx -y @mermaid-js/mermaid-cli -i docs/archive/figures/fig1-system-architecture.mmd -o docs/archive/figures/fig1-system-architecture.svg -b transparent
npx -y @mermaid-js/mermaid-cli -i docs/archive/figures/fig2-request-flow.mmd -o docs/archive/figures/fig2-request-flow.svg -b transparent
npx -y @mermaid-js/mermaid-cli -i docs/archive/figures/fig3-tool-registry.mmd -o docs/archive/figures/fig3-tool-registry.svg -b transparent

node docs/archive/prepare-patent-docx.mjs

pandoc \
  docs/archive/white+paper_banking_chat.export.md \
  --from gfm \
  --to docx \
  --resource-path=docs/archive:docs/archive/figures \
  --standalone \
  --output docs/archive/white-paper-banking-chat-uspto-v5.docx
```

If the filing-oriented markdown draft is preferred, it can be exported directly without Mermaid preprocessing:

```bash
set -e
cd /workspaces/map_demo

pandoc \
  docs/archive/PATENT-USPTO-STYLE-DRAFT.md \
  --from gfm \
  --to docx \
  --standalone \
  --output docs/archive/white-paper-banking-chat-uspto-style-draft.docx
```

Equivalent one-command script:

```bash
set -e
cd /workspaces/map_demo

bash docs/archive/export-uspto-docx.sh
```

## What the Prep Script Does

The prep script performs export-safe normalization:

1. Reads the canonical markdown source.
2. Replaces the three Mermaid blocks with static SVG image references.
3. Writes an export-ready file at `docs/archive/white+paper_banking_chat.export.md`.
4. Verifies that the expected number of Mermaid diagrams was found before writing the export file.

## Optional Reference Template

If a corporate or USPTO-specific DOCX reference template is available, add it to the Pandoc command:

```bash
pandoc \
  docs/archive/white+paper_banking_chat.export.md \
  --from gfm \
  --to docx \
  --resource-path=docs/archive:docs/archive/figures \
  --reference-doc=docs/archive/reference-doc.docx \
  --standalone \
  --output docs/archive/white-paper-banking-chat-uspto-v5.docx
```

## Post-Export Validation

After generating the DOCX package, verify the following:

1. The title page and metadata show Version 1.1 and Date March 30, 2026.
2. Figures 1, 2, and 3 appear as rendered images, not raw Mermaid source.
3. Claim numbering remains continuous from 1 through 20.
4. Claims 1, 5, 9, 10, 11, 17, and 19 match the updated markdown language.
5. Bullet indentation under each claim is preserved.
6. No Mermaid code fences remain in the exported DOCX.
7. The file name is `white-paper-banking-chat-uspto-v5.docx`.

## Regeneration Rules

1. Do not edit older DOCX packages in place.
2. Always regenerate from [white+paper_banking_chat.md](./white+paper_banking_chat.md).
3. Use [PATENT-USPTO-STYLE-DRAFT.md](./PATENT-USPTO-STYLE-DRAFT.md) when a filing-oriented USPTO-style source document is preferred over the white-paper source.
4. If the claim set changes again, re-run the diagram render step and the prep script before exporting the white-paper source.

## Related Documents

1. [PATENT-PACKAGE-SYNC.md](./PATENT-PACKAGE-SYNC.md)
2. [PATENT-PRIOR-ART-REVIEW.md](./PATENT-PRIOR-ART-REVIEW.md)