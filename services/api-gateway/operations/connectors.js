const { lookup } = require("dns").promises;
const { isIP } = require("net");
const https = require("https");
const http = require("http");
const { OperationsError } = require("./store");

function resolveSecret(ref, env = process.env) {
  if (!ref) return null;
  if (/^env:CONNECTOR_SECRET_[A-Z0-9_]+$/.test(ref)) {
    const value = env[ref.slice(4)];
    if (!value)
      throw new OperationsError(
        503,
        "Referenced connector secret is unavailable.",
      );
    return value;
  }
  throw new OperationsError(
    400,
    "Use an env:CONNECTOR_SECRET_NAME reference.",
  );
}
function privateAddress(ip) {
  if (!isIP(ip)) return true;
  if (ip.includes(":")) {
    let s = ip.toLowerCase();
    if (s.includes("%")) return true;
    const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) {
      const bytes = dotted[1].split(".").map(Number);
      s =
        s.slice(0, -dotted[1].length) +
        ((bytes[0] << 8) | bytes[1]).toString(16) +
        ":" +
        ((bytes[2] << 8) | bytes[3]).toString(16);
    }
    const [left, right] = s.split("::");
    const leading = left ? left.split(":") : [];
    const trailing = right ? right.split(":") : [];
    const words = (
      s.includes("::")
        ? [
            ...leading,
            ...Array(8 - leading.length - trailing.length).fill("0"),
            ...trailing,
          ]
        : leading
    ).map((word) => parseInt(word, 16));
    const embedded = (high, low) =>
      `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    // IPv4-mapped addresses occur in hexadecimal form after URL/DNS
    // normalization (::ffff:7f00:1), not just ::ffff:127.0.0.1.
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff)
      return privateAddress(embedded(words[6], words[7]));
    if (words.slice(0, 6).every((word) => word === 0)) return true;
    if (
      (words[0] & 0xfe00) === 0xfc00 ||
      (words[0] & 0xffc0) === 0xfe80 ||
      (words[0] & 0xffc0) === 0xfec0 ||
      (words[0] & 0xff00) === 0xff00
    )
      return true;
    if (words[0] === 0x2001 && words[1] === 0x0db8) return true;
    if (words[0] === 0x2002)
      return privateAddress(embedded(words[1], words[2]));
    if (
      words[0] === 0x0064 &&
      words[1] === 0xff9b &&
      words.slice(2, 6).every((word) => word === 0)
    )
      return privateAddress(embedded(words[6], words[7]));
    return false;
  }
  const [a, b] = ip.split(".").map(Number);
  const c = Number(ip.split(".")[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
function enterprisePrivateAddress(ip) {
  if (isIP(ip) === 6) return /^(fc|fd)[0-9a-f]{2}:/i.test(ip);
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}
function validateBaseUrl(raw, env = process.env) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new OperationsError(400, "A valid connector base URL is required.");
  }
  const local =
    env.NODE_ENV !== "production" && env.CONNECTOR_ALLOW_LOCAL === "true";
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!local && url.protocol !== "https:") ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new OperationsError(
      400,
      "Connector URLs require HTTPS without credentials, query, or fragment.",
    );
  const hosts = (env.CONNECTOR_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !hosts.includes(url.hostname) &&
    !(local && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new OperationsError(
      400,
      "Connector host is not in CONNECTOR_ALLOWED_HOSTS.",
    );
  return url;
}
/** Pin the DNS result to the socket to prevent a validated host rebinding to a
 * private address. Redirects are deliberately never followed. */
async function requestConnector(connection, path, options = {}) {
  const env = options.env || process.env;
  const startedAt = Date.now();
  const budget = Math.max(1, Math.min(60000, connection.timeoutMs || 10000));
  let base, addresses, target, secret, body;
  try {
    base = validateBaseUrl(connection.baseUrl, env);
    const local =
      env.NODE_ENV !== "production" && env.CONNECTOR_ALLOW_LOCAL === "true";
    const hostname = base.hostname.replace(/^\[|\]$/g, "");
    let dnsTimer;
    try {
      addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await Promise.race([
            (options.lookup || lookup)(hostname, { all: true }),
            new Promise((resolve, reject) => {
              dnsTimer = setTimeout(
                () =>
                  reject(
                    Object.assign(new Error("Connector DNS lookup timed out"), {
                      code: "ETIMEDOUT",
                    }),
                  ),
                budget,
              );
            }),
          ]);
    } finally {
      clearTimeout(dnsTimer);
    }
    const approvedPrivateHost = (env.CONNECTOR_PRIVATE_HOSTS || "")
      .split(",")
      .map((value) => value.trim())
      .includes(base.hostname);
    if (
      !addresses.length ||
      (!local &&
        addresses.some(
          (a) =>
            privateAddress(a.address) &&
            !(approvedPrivateHost && enterprisePrivateAddress(a.address)),
        ))
    )
      throw new OperationsError(
        400,
        "Connector resolves to a restricted network address.",
      );
    target = new URL(base.toString().replace(/\/$/, "") + path);
    if (target.origin !== base.origin)
      throw new OperationsError(
        400,
        "Connector path must remain on the configured origin.",
      );
    secret = resolveSecret(connection.credentialRef, env);
    body =
      options.body === undefined ? undefined : JSON.stringify(options.body);
  } catch (error) {
    error.dispatched = false;
    throw error;
  }
  return new Promise((resolvePromise, reject) => {
    let dispatched = false;
    const remaining = Math.max(1, budget - (Date.now() - startedAt));
    const req = (target.protocol === "https:" ? https : http).request(
      target,
      {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
          ...(options.headers || {}),
        },
        lookup: (_hostname, lookupOptions, callback) =>
          lookupOptions.all
            ? callback(null, [addresses[0]])
            : callback(null, addresses[0].address, addresses[0].family),
        timeout: remaining,
      },
      (res) => {
        // An error status is definitive under the provider contract. Mutation
        // rejection payloads are unnecessary and may be malformed or unbounded.
        if (res.statusCode >= 400 && res.statusCode < 600
          && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
          resolvePromise({ status: res.statusCode, data: {} });
          res.destroy();
          return;
        }
        let data = "";
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024)
            req.destroy(new Error("Connector response exceeds limit"));
          else data += chunk;
        });
        res.on("end", () => {
          let value;
          try {
            value = data ? JSON.parse(data) : {};
          } catch {
            if (res.statusCode >= 400 && res.statusCode < 600) return resolvePromise({ status: res.statusCode, data: {} });
            return reject(
              Object.assign(new Error("Connector returned invalid JSON"), {
                dispatched: true,
              }),
            );
          }
          resolvePromise({ status: res.statusCode, data: value });
        });
        res.on("error", (error) =>
          reject(Object.assign(error, { dispatched: true })),
        );
      },
    );
    req.on("socket", (socket) => {
      // Once headers can be sent, lack of response is ambiguous, even when a
      // provider claims idempotency. Only connection failures are auto-retried.
      if (!socket.connecting) dispatched = true;
      else
        socket.once(
          target.protocol === "https:" ? "secureConnect" : "connect",
          () => {
            dispatched = true;
          },
        );
    });
    req.on("timeout", () => req.destroy(new Error("Connector timed out")));
    req.on("error", (error) =>
      reject(
        Object.assign(new Error("Connector request failed"), {
          code: error.code,
          dispatched,
        }),
      ),
    );
    // Socket timeouts measure inactivity. A separate deadline also bounds DNS,
    // TLS handshakes and providers that keep sending tiny response fragments.
    const deadline = setTimeout(
      () => req.destroy(new Error("Connector deadline exceeded")),
      remaining,
    );
    req.once("close", () => clearTimeout(deadline));
    req.end(body);
  });
}
module.exports = {
  resolveSecret,
  validateBaseUrl,
  privateAddress,
  requestConnector,
};
