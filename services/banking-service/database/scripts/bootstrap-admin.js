#!/usr/bin/env node
const bcrypt = require('bcryptjs');
const { getJwtSecret } = require('../../config/security');
const { withLockedClient } = require('./maintenance');
const ACTOR = 'platform-bootstrap-cli';

function validateInput(env) {
  getJwtSecret(env);
  const tenant = env.DEPLOYMENT_TENANT_ID;
  if (!tenant || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(tenant) || env.BANKING_ADMIN_TENANT_ID !== tenant) {
    throw new Error('BANKING_ADMIN_TENANT_ID must confirm the explicit DEPLOYMENT_TENANT_ID for this dedicated database.');
  }
  const email = String(env.BANKING_ADMIN_EMAIL || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BANKING_ADMIN_EMAIL must be a valid email address.');
  return { tenant, email };
}
function validatePassword(password) {
  const length = typeof password === 'string' ? Buffer.byteLength(password, 'utf8') : 0;
  if (length < 16 || length > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password) || /[\r\n\0]/.test(password)) {
    throw new Error('A new administrator needs a 16–72 byte password containing upper/lowercase letters, a number, and a symbol; use BANKING_ADMIN_PASSWORD or --password-stdin.');
  }
}

async function provisionAdministrator(options = {}) {
  const env = options.env || process.env;
  const { tenant, email } = validateInput(env);
  return withLockedClient(options, async client => {
    await client.query('BEGIN');
    try {
      const role = await client.query("SELECT id FROM roles WHERE name = 'CONTROL_PLANE_ADMIN'");
      if (!role.rowCount) throw new Error('The control-plane administrator role is missing; apply banking migrations first.');
      const existing = await client.query('SELECT user_id, username, is_active, is_locked, status FROM users WHERE LOWER(email) = $1 FOR UPDATE', [email]);
      if (existing.rowCount > 1) throw new Error('The email matches multiple existing users; resolve that ambiguity before granting a role.');
      let user = existing.rows[0];
      const created = !user;
      if (user) {
        if (!user.is_active || user.is_locked || user.status !== 'active' || !user.username) throw new Error('The existing user must be active, unlocked, and have a login username; no account state was changed.');
      } else {
        if (options.existingOnly) throw new Error('No existing user matches this email; --existing-only does not create accounts.');
        const username = String(env.BANKING_ADMIN_USERNAME || email).trim();
        if (!/^[A-Za-z0-9._@+-]{1,100}$/.test(username)) throw new Error('BANKING_ADMIN_USERNAME must be a 1–100 character login name.');
        const password = options.password === undefined ? env.BANKING_ADMIN_PASSWORD : options.password;
        validatePassword(password);
        const passwordHash = await bcrypt.hash(password, 12);
        const inserted = await client.query(`INSERT INTO users
          (email, username, password_hash, first_name, last_name, status, is_active, is_verified, is_locked, created_by)
          VALUES ($1, $2, $3, 'Platform', 'Administrator', 'active', true, true, false, $4)
          RETURNING user_id, username`, [email, username, passwordHash, ACTOR]);
        user = inserted.rows[0];
      }
      const granted = await client.query(`INSERT INTO user_roles (user_id, role_id, assigned_by)
        VALUES ($1, $2, $3) ON CONFLICT (user_id, role_id) DO NOTHING RETURNING id`, [user.user_id, role.rows[0].id, ACTOR]);
      if (created || granted.rowCount) {
        await client.query(`INSERT INTO audit_logs (user_id, action, resource, resource_id, details, status)
          VALUES (NULL, 'platform_admin_bootstrapped', 'user_roles', $1, $2::jsonb, 'success')`,
        [user.user_id, JSON.stringify({ actorType: 'deployment_cli', actor: ACTOR, tenantId: tenant, targetUserId: user.user_id, role: 'control_plane_admin', created, roleGranted: Boolean(granted.rowCount) })]);
      }
      await client.query('COMMIT');
      return { userId: user.user_id, username: user.username, tenantId: tenant, created, roleGranted: Boolean(granted.rowCount), existingPasswordChanged: false };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(argument => !['--existing-only', '--password-stdin'].includes(argument))) throw new Error('Only --existing-only and --password-stdin are supported. Never put passwords in command arguments.');
  let password;
  if (args.includes('--password-stdin')) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk.toString('utf8');
      if (Buffer.byteLength(input, 'utf8') > 4096) throw new Error('Password input exceeds the supported limit.');
    }
    password = input.replace(/\r?\n$/, '');
  }
  const result = await provisionAdministrator({ existingOnly: args.includes('--existing-only'), password });
  console.log(JSON.stringify(result));
}
if (require.main === module) main().catch(error => { console.error(`Administrator bootstrap failed: ${error.message}`); process.exitCode = 1; });
module.exports = { provisionAdministrator, validatePassword };
