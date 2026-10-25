const jwt = require("jsonwebtoken");
const { timingSafeEqual, createHmac } = require("crypto");
const { permissionsFor } = require("../control-plane");
function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.length > 0 &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function authenticate(secret, tenant) {
  return (req, res, next) => {
    if (!secret)
      return res
        .status(503)
        .json({ error: "Authentication is not configured." });
    try {
      const token = req.get("Authorization");
      if (!token?.startsWith("Bearer ")) throw new Error();
      const claims = jwt.verify(token.slice(7), secret, {
        algorithms: ["HS256"],
      });
      const actor = claims.userId || claims.sub;
      if (
        typeof actor !== "string" ||
        !actor ||
        actor.length > 200 ||
        (claims.type && claims.type !== "access")
      )
        throw new Error();
      if (claims.tenantId !== undefined && claims.tenantId !== tenant)
        return res.status(403).json({ error: "Wrong deployment tenant." });
      req.principal = { actor, claims, permissions: permissionsFor(claims) };
      next();
    } catch {
      res.status(401).json({ error: "A valid access token is required." });
    }
  };
}
const authorize = (permission) => (req, res, next) =>
  req.principal?.permissions[permission]
    ? next()
    : res.status(403).json({ error: "Insufficient servicing permission." });
const actorHash = (actor, secret) =>
  createHmac("sha256", secret).update(actor).digest("hex");
module.exports = { authenticate, authorize, equal, actorHash };
