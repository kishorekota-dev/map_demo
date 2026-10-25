'use strict';
const fs = require('node:fs');
// Parse data, never shell code. Generated double quotes are JSON escaped; legacy
// unquoted/single-quoted dotenv assignments remain supported without expansion.
function parseEnvironment(source) {
  const result = Object.create(null);
  for (const [index, raw] of source.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) throw new Error(`Invalid environment assignment at line ${index + 1}.`);
    let value = match[2];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new Error(`Invalid quoted environment value at line ${index + 1}.`); }
      if (typeof value !== 'string') throw new Error(`Invalid environment value at line ${index + 1}.`);
    } else if (value.startsWith("'")) {
      if (!value.endsWith("'") || value.length < 2) throw new Error(`Invalid quoted environment value at line ${index + 1}.`);
      value = value.slice(1, -1);
    } else value = value.replace(/\s+#.*$/, '').trim();
    if (value.includes('\0')) throw new Error(`Invalid environment value at line ${index + 1}.`);
    result[match[1]] = value;
  }
  return result;
}
function readEnvironment(file) {
  try { return parseEnvironment(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code) throw new Error('Environment file is missing or unreadable.');
    throw error;
  }
}
const quote = value => JSON.stringify(String(value));
module.exports = { parseEnvironment, readEnvironment, quote };
