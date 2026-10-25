const http = require('http');
const request = require('supertest');

test('automatic HTTP fixtures connect through their bound address family and close afterward', async () => {
  const server = http.createServer((_req, res) => res.end('fixture'));
  const testRequest = request(server).get('/');
  const loopback = server.address().family === 'IPv6' ? '[::1]' : '127.0.0.1';
  expect(testRequest.url).toBe(`http://${loopback}:${server.address().port}/`);
  await testRequest.expect(200, 'fixture');
  expect(server.listening).toBe(false);
});
