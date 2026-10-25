const http = require('http');
const WebSocket = require('ws');
const MCPClient = require('../mcpClient');
const ServiceWebSocketTransport = require('../serviceWebSocketTransport');
const previous = process.env.SERVICING_SERVICE_TOKEN;
afterAll(() => { if (previous === undefined) delete process.env.SERVICING_SERVICE_TOKEN; else process.env.SERVICING_SERVICE_TOKEN = previous; });
test('MCP HTTP calls use current internal credential separately from user tool credentials', async () => {
  const received = [];
  const server = http.createServer((req, res) => { let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
    received.push({ headers: req.headers, body: JSON.parse(body) }); res.setHeader('Content-Type', 'application/json'); res.end('{"success":true}');
  }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new MCPClient(); client.client.defaults.baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const token of ['service-one', 'service-two']) { process.env.SERVICING_SERVICE_TOKEN = token; await client.executeTool('banking_get_accounts', { authToken: 'customer-token' }, 's'); }
    expect(received.map(value => value.headers['x-servicing-service-token'])).toEqual(['service-one','service-two']);
    for (const value of received) { expect(value.headers.authorization).toBeUndefined(); expect(value.body.parameters).toEqual({ authToken: 'customer-token' }); }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('Node WebSocket transport uses current credential for every connection and validates JSON RPC', async () => {
  const server = http.createServer(); const wss = new WebSocket.Server({ server }); const received = [];
  wss.on('connection', (socket, req) => { received.push({ header: req.headers['x-servicing-service-token'], url: req.url }); socket.on('message', data => { const message = JSON.parse(data); socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} })); }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const token of ['service-one','service-two']) {
      process.env.SERVICING_SERVICE_TOKEN = token;
      const transport = new ServiceWebSocketTransport(new URL(`ws://127.0.0.1:${server.address().port}/mcp`));
      await transport.start();
      const result = new Promise(resolve => { transport.onmessage = resolve; });
      await transport.send({ jsonrpc: '2.0', id: 1, method: 'ping' }); expect(await result).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
      const closed = new Promise(resolve => { transport.onclose = resolve; }); await transport.close(); await closed;
    }
    expect(received).toEqual([{ header: 'service-one', url: '/mcp' }, { header: 'service-two', url: '/mcp' }]);
  } finally { await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); }
});

test('patched SDK and Zod complete authenticated initialization and discovery over the Node transport', async () => {
  const TrueMCPClient = require('../trueMCPClient');
  const server = http.createServer(); const observed = [];
  const wss = new WebSocket.Server({ server });
  wss.on('connection', (socket, req) => {
    observed.push(req.headers['x-servicing-service-token']);
    socket.on('message', data => {
      const message = JSON.parse(data); if (message.id === undefined) return;
      const result = message.method === 'initialize'
        ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'synthetic-servicing-fixture', version: '1.0.0' } }
        : { tools: [{ name: 'fixture_read', description: 'Read-only synthetic discovery item', inputSchema: { type: 'object', properties: {} } }] };
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new TrueMCPClient(); client.serverUrl = `ws://127.0.0.1:${server.address().port}/mcp`;
  process.env.SERVICING_SERVICE_TOKEN = 'sdk-fixture-service-credential';
  try {
    await client.connect();
    expect(await client.listTools()).toEqual([expect.objectContaining({ name: 'fixture_read' })]);
    expect(observed).toEqual(['sdk-fixture-service-credential']);
  } finally { await client.disconnect(); for (const socket of wss.clients) socket.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); }
});
