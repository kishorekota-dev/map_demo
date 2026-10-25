const Test = require('supertest/lib/test');

// Supertest 6 binds an unspecified host but always sends to 127.0.0.1.
// On macOS an IPv6 wildcard fixture can share a port with an unrelated IPv4
// listener. Connect through the fixture's address family to reach the right app.
// Preserve Supertest's automatic listener ownership and cleanup behavior.
const serverAddress = Test.prototype.serverAddress;
Test.prototype.serverAddress = function loopbackServerAddress(app, path) {
  const url = serverAddress.call(this, app, path);
  return app.address().family === 'IPv6'
    ? url.replace('://127.0.0.1:', '://[::1]:')
    : url;
};
