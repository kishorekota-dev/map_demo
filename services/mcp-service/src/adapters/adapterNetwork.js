// Dedicated adapter egress: resolve once, reject restricted networks and pin DNS
// to the socket. This module deliberately ignores HTTP(S)_PROXY and redirects.
const { lookup } = require("dns").promises;
const { isIP } = require("net");
const http = require("http");
const https = require("https");

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

function validateEndpoint(raw, env = process.env) {
  let target;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("Adapter endpoint must be a valid URL");
  }
  const local =
    env.NODE_ENV !== "production" && env.ADAPTER_ALLOW_LOCAL === "true";
  if (
    !["https:", "http:"].includes(target.protocol) ||
    (!local && target.protocol !== "https:") ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error(
      "Adapter endpoints require HTTPS without credentials, query or fragment",
    );
  return target;
}
function transportError(code, dispatched = false) {
  return Object.assign(new Error("Adapter transport unavailable"), {
    code,
    dispatched,
  });
}
function createSecureHttpClient(env = process.env, options = {}) {
  return async (request) => {
    const started = Date.now();
    const target = new URL(request.url);
    validateEndpoint(target.origin + target.pathname, env);
    const local =
      env.NODE_ENV !== "production" && env.ADAPTER_ALLOW_LOCAL === "true";
    const timeout = Math.max(1, Math.min(120000, request.timeout || 30000));
    const hostname = target.hostname.replace(/^\[|\]$/g, "");
    let timer;
    let addresses;
    try {
      addresses = await Promise.race([
        isIP(hostname)
          ? Promise.resolve([{ address: hostname, family: isIP(hostname) }])
          : (options.lookup || lookup)(hostname, { all: true }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(transportError("ADAPTER_DNS_TIMEOUT")),
            timeout,
          );
        }),
      ]);
    } catch {
      throw transportError("ADAPTER_DNS_FAILED");
    } finally {
      clearTimeout(timer);
    }
    const privateHosts = (env.ADAPTER_PRIVATE_HOSTS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      !addresses.length ||
      addresses.some(
        (item) =>
          !isIP(item.address) ||
          (!local &&
            privateAddress(item.address) &&
            !(
              privateHosts.includes(target.hostname) &&
              enterprisePrivateAddress(item.address)
            )),
      )
    )
      throw transportError("ADAPTER_NETWORK_RESTRICTED");
    for (const [key, value] of Object.entries(request.params || {}))
      target.searchParams.append(key, String(value));
    const body =
      request.data === undefined
        ? undefined
        : typeof request.data === "string"
          ? request.data
          : JSON.stringify(request.data);
    if (body && Buffer.byteLength(body) > 65536)
      throw transportError("ADAPTER_REQUEST_TOO_LARGE");
    return new Promise((resolve, reject) => {
      let dispatched = false;
      const headers = {
        Accept: "application/json",
        ...(body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : {}),
        ...(request.headers || {}),
      };
      const req = (target.protocol === "https:" ? https : http).request(
        target,
        {
          method: request.method || "GET",
          headers,
          rejectUnauthorized: true,
          lookup: (_hostname, lookupOptions, callback) =>
            lookupOptions.all
              ? callback(null, [addresses[0]])
              : callback(null, addresses[0].address, addresses[0].family),
        },
        (response) => {
          const chunks = [];
          let bytes = 0;
          response.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > 1024 * 1024)
              req.destroy(
                transportError("ADAPTER_RESPONSE_TOO_LARGE", dispatched),
              );
            else chunks.push(chunk);
          });
          response.on("end", () => {
            clearTimeout(timer);
            const raw = Buffer.concat(chunks).toString("utf8");
            let data = raw;
            try {
              data = JSON.parse(raw);
            } catch {
              /* Bounded text response. */
            }
            resolve({ status: response.statusCode, data });
          });
          response.on("error", () =>
            req.destroy(
              transportError("ADAPTER_RESPONSE_INTERRUPTED", dispatched),
            ),
          );
          response.on("aborted", () =>
            req.destroy(
              transportError("ADAPTER_RESPONSE_INTERRUPTED", dispatched),
            ),
          );
        },
      );
      timer = setTimeout(
        () => req.destroy(transportError("ADAPTER_TIMEOUT", dispatched)),
        Math.max(1, timeout - (Date.now() - started)),
      );
      req.on("error", (error) => {
        clearTimeout(timer);
        reject(
          transportError(
            error.code || "ADAPTER_NETWORK_FAILED",
            error.dispatched === false ? false : dispatched,
          ),
        );
      });
      dispatched = true;
      if (body) req.write(body);
      req.end();
    });
  };
}
module.exports = { createSecureHttpClient, validateEndpoint, privateAddress };
