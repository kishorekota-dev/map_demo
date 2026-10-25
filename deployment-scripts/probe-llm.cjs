#!/usr/bin/env node
'use strict';

// Administrative smoke test. Listing configuration never invokes a model;
// inference requires an explicit --test and an explicitly selected model.
const path = require('node:path');
const { ProviderRegistry } = require('../services/ai-orchestrator/src/llm/registry');
const workspace = path.resolve(__dirname, '../services/ai-orchestrator');
const HELP = `Usage: npm run llm:probe -- [options]
  --list                         Show sanitized server provider configuration
  --provider ID --models         Discover models on the selected provider
  --provider ID --model TAG --test
                                 Send a fixed synthetic connectivity prompt
  --format text|json             Smoke-test response format (default: text)
  --timeout-ms 1000..120000       Generation deadline (default: 120000)
  --registry PATH                Use an explicit registry file
  --help                         Show this help

No customer data is sent. No provider fallback is attempted. Model inference
only runs with --test; endpoint addresses and credentials remain server-owned.
`;

async function main() {
  const options = {};
  const flags = new Set(['list', 'models', 'test', 'help']);
  const values = new Set(['provider', 'model', 'format', 'timeout-ms', 'registry']);
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index].replace(/^--/, '');
    if (!args[index].startsWith('--') || (!flags.has(name) && !values.has(name)) || options[name] !== undefined) {
      throw new Error('Unknown or repeated option. Run with --help.');
    }
    if (flags.has(name)) options[name] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value.`);
      options[name] = value;
    }
  }
  if (options.help || args.length === 0) { process.stdout.write(HELP); return; }
  const modes = ['list', 'models', 'test'].filter(key => options[key]);
  if (modes.length !== 1) throw new Error('Select exactly one of --list, --models, or --test.');
  if (!options.list && !options.provider) throw new Error('--provider is required.');
  if (options.test && !options.model) throw new Error('--test requires an explicit --model.');
  const format = options.format || 'text';
  const timeoutMs = Number(options['timeout-ms'] || 120000);
  if (!['text', 'json'].includes(format) || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error('Invalid format or timeout. Run with --help.');
  }
  const env = { ...process.env };
  // The app resolves relative registry paths from the orchestrator workspace.
  // Preserve that behavior when this CLI is launched from the repository root.
  if (options.registry) env.LLM_PROVIDERS_FILE = path.resolve(options.registry);
  else if (env.LLM_PROVIDERS_FILE) env.LLM_PROVIDERS_FILE = path.resolve(workspace, env.LLM_PROVIDERS_FILE);
  const registry = new ProviderRegistry(undefined, { env });
  let output;
  if (options.list) output = { providers: registry.list() };
  else if (options.models) output = await registry.models(options.provider);
  else {
    const result = await registry.generate(options.provider, {
      model: options.model, format, temperature: 0, maxOutputTokens: 64, timeoutMs,
      messages: [
        { role: 'system', content: format === 'json'
          ? 'Return exactly the JSON object {"status":"READY"}. Do not add an explanation.'
          : 'Reply with exactly READY. Do not add an explanation.' },
        { role: 'user', content: 'Synthetic model connectivity test.' }
      ]
    });
    const ok = format === 'json' ? result.json?.status === 'READY' : result.text.trim() === 'READY';
    output = { ok, providerId: result.providerId, providerType: result.providerType, model: result.model,
      format, latencyMs: result.latencyMs, usage: result.usage, text: result.text.slice(0, 400) };
    if (!ok) process.exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch(error => {
  // Registry errors are sanitized; never serialize transport errors or headers.
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || 'LLM_PROBE_ERROR', message: error.message })}\n`);
  process.exitCode = 1;
});
