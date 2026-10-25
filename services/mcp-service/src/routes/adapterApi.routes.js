/**
 * Generic backend adapter HTTP API.
 *
 * Mounted under /api/adapters by server.js, so it inherits the service's
 * internal-service authentication and rate limiting. All responses are
 * sanitized adapter views: credential values never appear here.
 *
 * Status mapping for execution:
 * - completed -> 200
 * - failed    -> the backend status when it is a 4xx/5xx, else 502
 * - uncertain -> 202, with reconciliationReference. The caller must
 *   reconcile, not retry with a new key.
 */

const express = require('express');
const logger = require('../utils/logger');
const { registry } = require('../adapters/adapterRegistry');

function createAdapterApiRoutes(registryInstance) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ success: true, adapters: registryInstance.listAdapters() });
  });

  router.get('/:adapterId/tools', (req, res) => {
    const adapter = registryInstance.getAdapter(req.params.adapterId);
    if (!adapter) return res.status(404).json({ success: false, error: 'Adapter not found' });
    res.json({ success: true, adapterId: adapter.id, tools: registryInstance.listTools().filter((t) => t.adapterId === adapter.id) });
  });

  router.get('/:adapterId/tools/:toolName', (req, res) => {
    const adapter = registryInstance.getAdapter(req.params.adapterId);
    if (!adapter) return res.status(404).json({ success: false, error: 'Adapter not found' });
    const tool = adapter.tools.find((t) => t.name === req.params.toolName);
    if (!tool) return res.status(404).json({ success: false, error: 'Tool not found' });
    res.json({
      success: true,
      tool: {
        name: tool.name,
        namespacedName: tool.namespacedName,
        description: tool.description,
        method: tool.method,
        path: tool.path,
        readOnly: tool.readOnly,
        idempotency: tool.idempotency,
        inputSchema: tool.inputSchema,
        statusPath: tool.statusPath || null,
      },
    });
  });

  router.post('/:adapterId/tools/:toolName/execute', async (req, res) => {
    const { adapterId, toolName } = req.params;
    try {
      const executor = registryInstance.executor(adapterId);
      const { parameters, idempotencyKey, sessionId } = req.body || {};
      if (parameters !== undefined && (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters))) {
        return res.status(400).json({ success: false, error: 'parameters must be an object' });
      }
      logger.info('Executing generic adapter tool', {
        adapterId, toolName, sessionId,
        parameters: parameters ? Object.keys(parameters) : [],
        idempotencyKey: Boolean(idempotencyKey),
      });
      const result = await executor.execute(toolName, parameters || {}, { idempotencyKey: idempotencyKey || null });
      if (result.outcome === 'completed') {
        return res.json({ success: true, sessionId, ...result });
      }
      if (result.outcome === 'uncertain') {
        return res.status(202).json({ success: false, sessionId, ...result });
      }
      const status = result.status && result.status >= 400 && result.status < 600 ? result.status : 502;
      return res.status(status).json({ success: false, sessionId, ...result });
    } catch (error) {
      if (error.message && error.message.startsWith('Adapter not found')) {
        return res.status(404).json({ success: false, error: error.message });
      }
      if (error.message && error.message.startsWith('Tool not found')) {
        return res.status(404).json({ success: false, error: error.message });
      }
      logger.error('Generic adapter execution failed', { adapterId, toolName, error: error.message });
      return res.status(400).json({ success: false, error: error.message });
    }
  });

  router.post('/:adapterId/reconcile', async (req, res) => {
    const { adapterId } = req.params;
    try {
      const executor = registryInstance.executor(adapterId);
      const { tool, idempotencyKey } = req.body || {};
      if (!tool || !idempotencyKey) {
        return res.status(400).json({ success: false, error: 'tool and idempotencyKey are required' });
      }
      const result = await executor.reconcile(tool, idempotencyKey);
      return res.json({ success: result.outcome === 'completed', ...result });
    } catch (error) {
      logger.error('Generic adapter reconciliation failed', { adapterId, error: error.message });
      return res.status(400).json({ success: false, error: error.message });
    }
  });

  router.get('/:adapterId/health', async (req, res) => {
    try {
      const executor = registryInstance.executor(req.params.adapterId);
      const result = await executor.health();
      return res.json({ success: result.status === 'healthy', ...result });
    } catch (error) {
      return res.status(404).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createAdapterApiRoutes(registry);
module.exports.createAdapterApiRoutes = createAdapterApiRoutes;
