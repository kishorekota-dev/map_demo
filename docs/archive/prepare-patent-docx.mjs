import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourcePath = path.join(__dirname, 'white+paper_banking_chat.md');
const exportPath = path.join(__dirname, 'white+paper_banking_chat.export.md');

const figureReplacements = [
  '![FIG. 1 - System architecture](./figures/fig1-system-architecture.svg)',
  '![FIG. 2 - Request processing flow](./figures/fig2-request-flow.svg)',
  '![FIG. 3 - MCP tool registry](./figures/fig3-tool-registry.svg)'
];

async function main() {
  const source = await fs.readFile(sourcePath, 'utf8');
  const mermaidBlocks = [...source.matchAll(/```mermaid[\s\S]*?```/g)];

  if (mermaidBlocks.length !== figureReplacements.length) {
    throw new Error(
      `Expected ${figureReplacements.length} Mermaid blocks, found ${mermaidBlocks.length}`
    );
  }

  let exportMarkdown = source;

  for (let index = 0; index < mermaidBlocks.length; index += 1) {
    exportMarkdown = exportMarkdown.replace(mermaidBlocks[index][0], figureReplacements[index]);
  }

  await fs.writeFile(exportPath, exportMarkdown, 'utf8');

  process.stdout.write(
    `Prepared export-ready markdown at ${path.relative(process.cwd(), exportPath)}\n`
  );
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});