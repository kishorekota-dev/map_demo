#!/usr/bin/env node
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const { readEnvironment } = require('./lib/environment.cjs');
const [file, command, ...args] = process.argv.slice(2);
if (!file || !command) { console.error('Usage: run-with-env.cjs ENV_FILE COMMAND [ARGUMENTS]'); process.exit(2); }
let configured;
try { configured = readEnvironment(file); }
catch (error) { console.error(error.message); process.exit(1); }
const child = spawn(command, args, { cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, ...configured, APP_ENV_FILE: path.resolve(file), APP_ENV_LOADED: 'true' }, stdio: 'inherit', shell: false });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!child.killed) child.kill(signal); });
child.on('error', () => { console.error('Unable to start the configured command.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
