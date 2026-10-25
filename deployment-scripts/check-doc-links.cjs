#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const pending = ['README.md', 'docs/README.md'];
const seen = new Set(); const failures = []; let checked = 0;
while (pending.length) {
  const relative = pending.shift();
  if (seen.has(relative) || relative.startsWith('docs/archive/')) continue;
  seen.add(relative);
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  // Historical records intentionally retain their old body and endpoint claims.
  if (/^> \*\*Historical /m.test(source)) continue;
  const prose = source.replace(/```[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/\[[^\]]+\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) continue;
    const filename = decodeURIComponent(href.split('#')[0]);
    if (!filename) continue;
    const target = path.resolve(ROOT, path.dirname(relative), filename);
    const targetRelative = path.relative(ROOT, target);
    checked += 1;
    if (targetRelative.startsWith('..') || !fs.existsSync(target)) failures.push(`${relative}: ${href}`);
    else if (/\.md$/i.test(target)) pending.push(targetRelative);
  }
}
if (failures.length) { console.error(`Broken local documentation links (${failures.length}):\n${failures.join('\n')}`); process.exitCode = 1; }
else console.log(`Current documentation: ${checked} local links resolve across ${seen.size} reachable Markdown files. Historical bodies and archives excluded.`);
