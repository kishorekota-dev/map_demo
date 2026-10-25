const { randomUUID, createHash } = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { evaluateAssertions, summarize, evidenceId } = require('./model');

function modelTransport(env, tenantId) {
  return async (input, run, signal) => {
    if (!env.JWT_SECRET || !env.SERVICING_SERVICE_TOKEN) throw Object.assign(new Error(), { code: 'QUALITY_AUTH_UNCONFIGURED' });
    const token = jwt.sign({ userId: run.createdBy, tenantId, type: 'access', roles: ['control_plane_editor'], purpose: 'quality_evaluation', runId: run.id }, env.JWT_SECRET,
      { algorithm: 'HS256', audience: 'servicing-quality', expiresIn: '3m' });
    const base = (env.AI_ORCHESTRATOR_URL || 'http://localhost:3007').replace(/\/$/, '');
    const response = await axios.post(`${base}/api/orchestrator/llm/evaluate`, { runId: run.id, ...input }, {
      headers: { Authorization: `Bearer ${token}`, 'X-Servicing-Service-Token': env.SERVICING_SERVICE_TOKEN }, signal,
      timeout: input.request.timeoutMs + 1500, maxRedirects: 0, maxContentLength: 1048576, maxBodyLength: 640000,
    });
    return response.data;
  };
}
const safeError = error => {
  const candidate = error.response?.data?.error?.code || error.code;
  return ['LLM_TIMEOUT', 'LLM_PROVIDER_UNAVAILABLE', 'LLM_CREDENTIAL_MISSING', 'LLM_MODEL_NOT_ALLOWED', 'LLM_INVALID_RESPONSE', 'LLM_INVALID_JSON', 'QUALITY_AUTH_UNCONFIGURED'].includes(candidate) ? candidate : ['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(candidate) ? 'MODEL_REQUEST_INTERRUPTED' : 'MODEL_REQUEST_FAILED';
};
class QualityWorker {
  constructor({ store, configStore, env = process.env, generate, now = Date.now }) {
    this.store = store; this.configStore = configStore; this.env = env; this.generate = generate || modelTransport(env, store.tenantId); this.now = now; this.controllers = new Map(); this.stopped = false;
  }
  start() {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => this.tick().catch(() => {}), 2000); this.timer.unref?.();
    this.tick().catch(() => {});
  }
  async close() {
    this.stopped = true; clearInterval(this.timer); this.timer = null;
    for (const controller of this.controllers.values()) controller.abort();
    await this.running?.catch(() => {});
  }
  tick() {
    if (this.running) return this.running;
    this.running = this.process().finally(() => { this.running = null; });
    return this.running;
  }
  async process() {
    if (this.stopped) return;
    // A completion can survive a crash between the operational record commit and
    // publication of minimal gate evidence. Reconciliation never calls a model.
    const pending = await this.store.list('quality_run', { limit: 20 }, { evidencePending: true });
    for (const run of pending.items) await this.publishEvidence(run);
    const run = await this.store.transaction(async tx => {
      const running = await tx.find('quality_run', { status: 'running' }, 20);
      for (const item of running) {
        if (Date.parse(item.leaseUntil) > this.now()) return null;
        await tx.put('quality_run', item.id, { ...item, status: 'interrupted', passed: false, completedAt: new Date(this.now()).toISOString(), error: 'WORKER_INTERRUPTED', usageMayBeIncomplete: true });
        await tx.event({ type: 'quality.run.interrupted', runId: item.id });
      }
      const queue = await tx.find('quality_run', { status: 'queued' }, 10);
      const selected = queue.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!selected) return null;
      const claimed = { ...selected, status: 'running', startedAt: new Date(this.now()).toISOString(), leaseId: randomUUID(), leaseUntil: new Date(this.now() + selected.budget.maxDurationMs + 10000).toISOString() };
      await tx.put('quality_run', claimed.id, claimed);
      return claimed;
    });
    if (run) await this.execute(run);
  }
  async change(run, mutate) {
    return this.store.transaction(async tx => {
      const current = await tx.get('quality_run', run.id);
      if (!current || current.status !== 'running' || current.leaseId !== run.leaseId) return null;
      const result = await mutate(current, tx);
      await tx.put('quality_run', current.id, current);
      return result === undefined ? current : result;
    });
  }
  async execute(run) {
    const deadline = this.now() + run.budget.maxDurationMs;
    let cursor = 0;
    const tasks = Array.from({ length: run.budget.concurrency }, async () => {
      while (cursor < run.snapshot.cases.length && !this.stopped) {
        const item = run.snapshot.cases[cursor++];
        const remaining = deadline - this.now();
        if (remaining < 1000) break;
        const allowed = await this.change(run, current => {
          if (current.cancelRequested) return false;
          current.results.push({ id: item.id, category: item.category, status: 'running', dispatchedAt: new Date(this.now()).toISOString() });
          return true;
        });
        if (!allowed) break;
        const controller = new AbortController(); const key = `${run.id}:${item.id}`;
        this.controllers.set(key, controller);
        const timeoutMs = Math.min(run.profile.timeoutMs, Math.floor(remaining));
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const started = this.now(); let result;
        try {
          const response = await this.generate({ providerId: run.profile.providerId, caseId: item.id, ...(item.extraction ? { extraction: item.extraction } : {}), request: { model: run.profile.model, temperature: run.profile.temperature, maxOutputTokens: run.profile.maxOutputTokens, timeoutMs, format: run.snapshot.suite.task === 'generation' ? 'text' : 'json', messages: item.messages } }, run, controller.signal);
          if (typeof response.text !== 'string' || response.text.length > 128000 || !response.text.trim() || response.providerId !== run.profile.providerId || response.model !== run.profile.model) throw Object.assign(new Error(), { code: 'LLM_INVALID_RESPONSE' });
          const assertions = evaluateAssertions(response.text, item.assertions);
          const usage = Object.fromEntries(Object.entries(response.usage || {}).filter(([key, value]) => ['inputTokens', 'outputTokens', 'totalTokens'].includes(key) && Number.isFinite(value) && value >= 0));
          result = { id: item.id, category: item.category, status: 'completed', passed: assertions.every(rule => rule.passed), assertions, output: response.text.slice(0, 8000), outputTruncated: response.text.length > 8000, outputFingerprint: createHash('sha256').update(response.text).digest('hex'), latencyMs: this.now() - started, usage, callId: typeof response.callId === 'string' ? response.callId.slice(0, 100) : null, promptFingerprint: response.promptFingerprint || null, timeoutMs };
        } catch (error) {
          result = { id: item.id, category: item.category, status: 'failed', passed: false, error: safeError(error), latencyMs: this.now() - started, usage: {}, usageMayBeIncomplete: true, timeoutMs };
        } finally { clearTimeout(timer); this.controllers.delete(key); }
        await this.change(run, current => { current.results = current.results.map(entry => entry.id === item.id ? result : entry); });
      }
    });
    await Promise.all(tasks);
    const completed = await this.change(run, async (current, tx) => {
      const all = current.results.length === current.snapshot.cases.length && current.results.every(item => item.status === 'completed');
      current.status = current.cancelRequested ? 'cancelled' : this.stopped ? 'interrupted' : all ? 'completed' : 'failed';
      current.passed = current.status === 'completed' && current.results.every(item => item.passed);
      current.completedAt = new Date(this.now()).toISOString();
      current.usageMayBeIncomplete = current.results.some(item => item.usageMayBeIncomplete || !Number.isFinite(item.usage?.totalTokens));
      if (!all && !current.cancelRequested) current.error = this.stopped ? 'WORKER_INTERRUPTED' : this.now() >= deadline - 1000 ? 'RUN_TIME_BUDGET_EXHAUSTED' : 'CASE_EXECUTION_FAILED';
      current.evidencePending = current.passed;
      await tx.event({ type: 'quality.run.completed', runId: current.id, status: current.status, passed: current.passed, configFingerprint: current.configFingerprint, suiteFingerprint: current.suiteFingerprint });
    });
    if (completed?.evidencePending) await this.publishEvidence(completed);
  }
  cancel(runId) {
    for (const [key, controller] of this.controllers) if (key.startsWith(`${runId}:`)) controller.abort();
  }
  async publishEvidence(run) {
    if (run.status !== 'completed' || !run.passed) return;
    const id = evidenceId(run);
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.configStore.getRecord('quality_evidence', id);
      if (existing?.runId === run.id) break;
      const state = await this.configStore.read();
      try {
        await this.configStore.update(state.revision, run.createdBy, 'quality.evidence.recorded', async (_next, records) => {
          await records.put('quality_evidence', id, { id, runId: run.id, fingerprint: run.configFingerprint, suiteFingerprint: run.suiteFingerprint, profileFingerprint: run.profileFingerprint, suiteId: run.suiteId, profileId: run.profileId, passed: true, scope: 'measured_prompt_probe', completedAt: run.completedAt, createdAt: run.completedAt, summary: summarize(run) });
        }, { resourceId: run.id });
        break;
      } catch (error) { if (error.status !== 409 || attempt === 4) throw error; }
    }
    await this.store.transaction(async tx => {
      const current = await tx.get('quality_run', run.id);
      if (current?.status === 'completed' && current.passed) await tx.put('quality_run', run.id, { ...current, evidencePending: false, evidenceId: id });
    });
  }
}
module.exports = { QualityWorker, modelTransport, safeError };
