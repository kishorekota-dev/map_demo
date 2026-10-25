const Test = require('supertest/lib/test');
const { Server: TlsServer } = require('tls');

// On macOS a wildcard listener can share a port with a more specific local
// listener, even within IPv6. Own automatic fixtures on explicit IPv4 loopback.
// Host-specific listen is asynchronous, so defer dispatch until its port exists.
const serverAddress = Test.prototype.serverAddress;
const end = Test.prototype.end;
Test.prototype.serverAddress = function loopbackServerAddress(app, path) {
  if (app.address()) {
    const url = serverAddress.call(this, app, path);
    return app.address().family === 'IPv6' ? url.replace('://127.0.0.1:', '://[::1]:') : url;
  }
  this._server = app;
  this._loopbackReady = new Promise((resolve, reject) => {
    const listening = () => { app.removeListener('error', failed); resolve(); };
    const failed = error => { app.removeListener('listening', listening); reject(error); };
    app.once('listening', listening); app.once('error', failed);
    try { app.listen(0, '127.0.0.1'); } catch (error) { failed(error); }
  });
  return `${app instanceof TlsServer ? 'https' : 'http'}://127.0.0.1:0${path}`;
};
Test.prototype.end = function loopbackEnd(callback) {
  if (!this._loopbackReady) return end.call(this, callback);
  this._loopbackReady.then(() => {
    this.url = this.url.replace(/^(https?:\/\/127\.0\.0\.1):0(?=[/?]|$)/, `$1:${this._server.address().port}`);
    try { end.call(this, callback); } catch (error) { this.assert(error, null, callback); }
  }, error => this.assert(error, null, callback));
  return this;
};
