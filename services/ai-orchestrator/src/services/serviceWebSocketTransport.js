const WebSocket = require('ws');
const { JSONRPCMessageSchema } = require('@modelcontextprotocol/sdk/types.js');

// Node transport: unlike the browser SDK transport, ws supports authenticated
// upgrade headers. Credentials are read for every connection, never in the URL.
class ServiceWebSocketTransport {
  constructor(url) { this.url = url; this.socket = null; }
  start() {
    if (this.socket) throw new Error('Transport already started');
    return new Promise((resolve, reject) => {
      const headers = process.env.SERVICING_SERVICE_TOKEN
        ? { 'X-Servicing-Service-Token': process.env.SERVICING_SERVICE_TOKEN } : {};
      this.socket = new WebSocket(this.url, 'mcp', { headers, followRedirects: false });
      this.socket.on('open', resolve);
      this.socket.on('error', error => { reject(error); this.onerror?.(error); });
      this.socket.on('close', () => this.onclose?.());
      this.socket.on('message', data => {
        try { this.onmessage?.(JSONRPCMessageSchema.parse(JSON.parse(data.toString()))); }
        catch (error) { this.onerror?.(error); }
      });
    });
  }
  async close() {
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) return;
    if (this.socket.readyState === WebSocket.CONNECTING) this.socket.terminate();
    else this.socket.close();
  }
  send(message) {
    return new Promise((resolve, reject) => {
      if (this.socket?.readyState !== WebSocket.OPEN) return reject(new Error('Transport is not connected'));
      this.socket.send(JSON.stringify(message), error => error ? reject(error) : resolve());
    });
  }
}
module.exports = ServiceWebSocketTransport;
