const { randomBytes, createHash } = require('crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const { isLiveAgentSession, hasLiveRequest } = require('./liveAgentChat');
const channels = ['digital', 'ava', 'ivr'];
const deploymentTenant = () => process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
class HandoffService {
  constructor(sessionManager, pool = null) { this.sessions = sessionManager; this.pool = pool; this.ready = null; this.memory = new Map(); }
  async initialize() {
    if (process.env.HANDOFF_STORAGE === 'memory' && process.env.NODE_ENV !== 'production') return;
    if (!this.ready) this.ready = (async () => {
      if (!this.pool) {
        const { Pool } = require('pg');
        this.pool = new Pool(require('../database/tls').pgOptions(process.env.HANDOFF_DATABASE_URL,
          { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME || 'poc_chat',
            user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '' }));
      }
      if (process.env.HANDOFF_SCHEMA_AUTO_MIGRATE === 'false') {
        await this.pool.query('SELECT grant_hash,consumed_at FROM servicing_resume_grants LIMIT 0');
        return;
      }
      const migration = await this.pool.connect();
      try {
        await migration.query('BEGIN');
        await migration.query("SELECT pg_advisory_xact_lock(hashtextextended('servicing-handoff-schema', 0))");
        await migration.query(`CREATE TABLE IF NOT EXISTS servicing_resume_grants (
        grant_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL,
        target_channel TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ)`);
        await migration.query('COMMIT');
      } catch (error) { await migration.query('ROLLBACK'); throw error; }
      finally { migration.release(); }
    })().catch(error => { this.ready = null; throw error; });
    await this.ready;
  }
  async owns(principal, sessionId) {
    const session = await this.sessions.getSession(sessionId, { refresh: true });
    if (!session || String(session.userId) !== String(principal.userId)
      || (session.metadata?.tenantId || deploymentTenant()) !== principal.tenantId) throw Object.assign(new Error('Session access denied'), { status: 403 });
    if (session.isActive === false || ['ended', 'expired', 'terminated'].includes(session.status)) throw Object.assign(new Error('Conversation is no longer active'), { status: 409 });
    if (isLiveAgentSession(session) || hasLiveRequest(session)) throw Object.assign(new Error('Finish the live agent conversation before switching channel'), { status: 409 });
    if (session.state?.workflowRecoveryRequired) throw Object.assign(new Error('Recover the interrupted request before switching channel'), { status: 409 });
    return session;
  }
  async issue(principal, sessionId, targetChannel) {
    if (!channels.includes(targetChannel)) throw Object.assign(new Error('Unsupported target channel'), { status: 400 });
    await this.owns(principal, sessionId);
    await this.initialize();
    const grant = randomBytes(32).toString('base64url');
    const record = { grant_hash: hash(grant), user_id: principal.userId, tenant_id: principal.tenantId, session_id: sessionId,
      target_channel: targetChannel, expires_at: new Date(Date.now() + 300000), consumed_at: null };
    if (this.pool) await this.pool.query('INSERT INTO servicing_resume_grants(grant_hash,user_id,tenant_id,session_id,target_channel,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
      [record.grant_hash, record.user_id, record.tenant_id, record.session_id, record.target_channel, record.expires_at]);
    else this.memory.set(record.grant_hash, record);
    return { grant, expiresAt: record.expires_at.toISOString(), sessionId, targetChannel };
  }
  async resume(principal, grant, authToken, expectedChannel) {
    if (!channels.includes(expectedChannel)) throw Object.assign(new Error('A supported destination channel is required'), { status: 400 });
    if (typeof grant !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(grant)) throw Object.assign(new Error('Invalid resume grant'), { status: 400 });
    await this.initialize();
    let record;
    if (this.pool) record = (await this.pool.query(`UPDATE servicing_resume_grants SET consumed_at=now()
      WHERE grant_hash=$1 AND user_id=$2 AND tenant_id=$3 AND target_channel=$4 AND consumed_at IS NULL AND expires_at>now() RETURNING *`,
    [hash(grant), principal.userId, principal.tenantId, expectedChannel])).rows[0];
    else {
      const candidate = this.memory.get(hash(grant));
      if (candidate && candidate.user_id === principal.userId && candidate.tenant_id === principal.tenantId
        && candidate.target_channel === expectedChannel && !candidate.consumed_at && new Date(candidate.expires_at) > new Date()) { candidate.consumed_at = new Date(); record = candidate; }
    }
    if (!record) throw Object.assign(new Error('Resume grant is expired, consumed or not authorized'), { status: 409 });
    const lock = this.pool ? await this.pool.connect() : null;
    const lockKey = `chat-handoff:${principal.tenantId}:${record.session_id}`;
    let lockLost = false;
    const onLockError = () => { lockLost = true; };
    if (lock) lock.on('error', onLockError);
    try {
      if (lock) {
        await lock.query("SET lock_timeout TO '15s'");
        await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [lockKey]);
      }
      const session = await this.owns(principal, record.session_id);
      if (lockLost) throw new Error('Handoff coordination lost');
      // Chat is the authority for grant consumption; the orchestrator requires
      // both the customer JWT and the trusted servicing service credential.
      const base = (process.env.AI_ORCHESTRATOR_URL || 'http://localhost:3007').replace(/\/$/, '');
      let migrated;
      try {
        migrated = await require('axios').post(`${base}/api/orchestrator/session/${encodeURIComponent(record.session_id)}/channel`,
          { channel: record.target_channel }, { timeout: 5000, maxRedirects: 0,
            headers: { Authorization: `Bearer ${authToken}`, 'X-Servicing-Service-Token': process.env.SERVICING_SERVICE_TOKEN || '' } });
      } catch (error) {
        const upstreamStatus = error.response?.status;
        throw Object.assign(new Error('Channel transfer was not completed. Refresh the conversation before preparing another transfer.'),
          { status: [401, 403, 409].includes(upstreamStatus) ? upstreamStatus : 503 });
      }
      if (migrated.data?.channel !== record.target_channel) throw Object.assign(new Error('Destination channel could not be verified; reconcile before another transfer'), { status: 502 });
      if (lockLost) throw new Error('Handoff coordination lost');
      await this.sessions.updateSession(record.session_id, { metadata: { ...session.metadata, channel: record.target_channel } });
      return { resumed: true, sessionId: record.session_id, channel: record.target_channel,
        session: { sessionId: record.session_id, currentStep: session.state?.currentStep, confirmationPending: Boolean(session.state?.pendingFeedback),
          intent: session.state?.lockedIntent || session.state?.lastIntent || null, version: migrated.data?.version || session.metadata?.version || null } };
    } finally {
      if (lock) {
        if (!lockLost) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]).catch(() => { lockLost = true; });
        lock.removeListener('error', onLockError);
        lock.release(lockLost);
      }
    }
  }
}
module.exports = HandoffService;
