const express = require('express');
const router = express.Router();
router.get(['/', '/live'], (_req, res) => res.json({ service: 'poc-api-gateway', alive: true, timestamp: new Date().toISOString() }));
router.get(['/ready', '/services'], async (req, res) => {
  try {
    const result = await req.app.locals.platformReadiness.check();
    // Infrastructure details and remediation stay behind the operator API.
    res.status(result.ready ? 200 : 503).json({ ready: result.ready, checkedAt: result.checkedAt });
  } catch {
    res.status(503).json({ ready: false, checkedAt: new Date().toISOString() });
  }
});
module.exports = router;
