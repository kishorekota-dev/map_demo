const express = require('express');
const router = express.Router();

// In-memory metrics storage
const metrics = {
  requests: {
    total: 0,
    success: 0,
    errors: 0,
    by_service: {},
    by_status: {}
  },
  response_times: {
    total: 0,
    count: 0,
    average: 0,
    min: Infinity,
    max: 0
  },
  uptime: process.uptime(),
  started_at: new Date().toISOString()
};

/**
 * Middleware to track metrics
 */
const trackMetrics = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Update request counts
    metrics.requests.total++;
    if (res.statusCode >= 200 && res.statusCode < 400) {
      metrics.requests.success++;
    } else {
      metrics.requests.errors++;
    }
    
    // Track by status code
    const statusGroup = `${Math.floor(res.statusCode / 100)}xx`;
    metrics.requests.by_status[statusGroup] = (metrics.requests.by_status[statusGroup] || 0) + 1;
    
    // Track by service
    const service = req.path.split('/')[2] || 'unknown';
    if (!metrics.requests.by_service[service]) {
      metrics.requests.by_service[service] = { total: 0, success: 0, errors: 0 };
    }
    metrics.requests.by_service[service].total++;
    if (res.statusCode >= 200 && res.statusCode < 400) {
      metrics.requests.by_service[service].success++;
    } else {
      metrics.requests.by_service[service].errors++;
    }
    
    // Update response times
    metrics.response_times.total += duration;
    metrics.response_times.count++;
    metrics.response_times.average = metrics.response_times.total / metrics.response_times.count;
    metrics.response_times.min = Math.min(metrics.response_times.min, duration);
    metrics.response_times.max = Math.max(metrics.response_times.max, duration);
  });
  
  next();
};

/**
 * GET /metrics
 * Get current metrics
 */
router.get('/', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    service: 'poc-api-gateway',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptime,
      formatted: formatUptime(uptime)
    },
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      external: formatBytes(memoryUsage.external)
    },
    requests: metrics.requests,
    response_times: {
      ...metrics.response_times,
      min: metrics.response_times.min === Infinity ? 0 : metrics.response_times.min
    },
    started_at: metrics.started_at
  });
});

/**
 * GET /metrics/reset
 * Reset metrics (admin only)
 */
router.post('/reset', (req, res) => {
  metrics.requests = {
    total: 0,
    success: 0,
    errors: 0,
    by_service: {},
    by_status: {}
  };
  metrics.response_times = {
    total: 0,
    count: 0,
    average: 0,
    min: Infinity,
    max: 0
  };
  metrics.started_at = new Date().toISOString();
  
  res.json({
    message: 'Metrics reset successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /metrics/prometheus
 * Prometheus-format metrics
 */
router.get('/prometheus', (req, res) => {
  const lines = [];
  
  // Request metrics
  lines.push('# HELP api_gateway_requests_total Total number of requests');
  lines.push('# TYPE api_gateway_requests_total counter');
  lines.push(`api_gateway_requests_total ${metrics.requests.total}`);
  
  lines.push('# HELP api_gateway_requests_success Successful requests');
  lines.push('# TYPE api_gateway_requests_success counter');
  lines.push(`api_gateway_requests_success ${metrics.requests.success}`);
  
  lines.push('# HELP api_gateway_requests_errors Failed requests');
  lines.push('# TYPE api_gateway_requests_errors counter');
  lines.push(`api_gateway_requests_errors ${metrics.requests.errors}`);
  
  // Response time metrics
  lines.push('# HELP api_gateway_response_time_avg Average response time in ms');
  lines.push('# TYPE api_gateway_response_time_avg gauge');
  lines.push(`api_gateway_response_time_avg ${metrics.response_times.average.toFixed(2)}`);
  
  lines.push('# HELP api_gateway_uptime_seconds Uptime in seconds');
  lines.push('# TYPE api_gateway_uptime_seconds counter');
  lines.push(`api_gateway_uptime_seconds ${process.uptime()}`);
  
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n'));
});

// Helper functions
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

module.exports = router;
module.exports.trackMetrics = trackMetrics;
