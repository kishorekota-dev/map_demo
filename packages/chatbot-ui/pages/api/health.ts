import { NextApiRequest, NextApiResponse } from 'next';

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  services: {
    backend: 'connected' | 'disconnected' | 'unknown';
    mcp: 'connected' | 'disconnected' | 'unknown';
    dialogflow: 'configured' | 'not_configured';
    redis: 'connected' | 'disconnected' | 'unknown';
  };
  uptime: number;
}

let startTime = Date.now();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthCheckResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        backend: 'unknown',
        mcp: 'unknown',
        dialogflow: 'not_configured',
        redis: 'unknown'
      },
      uptime: 0
    });
  }

  try {
    // Check backend connectivity
    let backendStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    try {
      const backendUrl = process.env.BANKING_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
      if (backendUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${backendUrl}/health`, { 
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        backendStatus = response.ok ? 'connected' : 'disconnected';
      }
    } catch {
      backendStatus = 'disconnected';
    }

    // Check MCP server connectivity
    let mcpStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    try {
      const mcpUrl = process.env.MCP_SERVER_URL || process.env.NEXT_PUBLIC_MCP_SERVER_URL;
      if (mcpUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${mcpUrl}/health`, { 
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        mcpStatus = response.ok ? 'connected' : 'disconnected';
      }
    } catch {
      mcpStatus = 'disconnected';
    }

    // Check DialogFlow configuration
    const dialogflowStatus = process.env.GOOGLE_PROJECT_ID ? 'configured' : 'not_configured';

    // Check Redis connectivity (simplified check)
    let redisStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    try {
      // In a real implementation, you would check Redis connectivity
      // For now, just check if Redis URL is configured
      redisStatus = process.env.REDIS_URL ? 'connected' : 'disconnected';
    } catch {
      redisStatus = 'disconnected';
    }

    const uptime = Date.now() - startTime;
    const overallStatus = 
      backendStatus === 'connected' && mcpStatus === 'connected' 
        ? 'healthy' 
        : 'unhealthy';

    const healthResponse: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        backend: backendStatus,
        mcp: mcpStatus,
        dialogflow: dialogflowStatus,
        redis: redisStatus
      },
      uptime
    };

    // Set appropriate status code
    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(healthResponse);
  } catch (error) {
    console.error('Health check error:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        backend: 'unknown',
        mcp: 'unknown',
        dialogflow: 'not_configured',
        redis: 'unknown'
      },
      uptime: Date.now() - startTime
    });
  }
}
