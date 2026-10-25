const jwt = require('jsonwebtoken');

// Delegated jobs cannot exchange their narrow capability for a customer session.
const isQualityDelegation = claims => claims?.purpose === 'quality_evaluation' || (Array.isArray(claims?.aud) ? claims.aud : [claims?.aud]).includes('servicing-quality');

// Socket connections accept access and development customer tokens for this
// deployment. Refresh tokens, delegations and other tenants are refused; the
// authenticate event applies the full principal checks afterwards.
function verifyConnectionToken(token, env = process.env) {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    const tenant = env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
    if (isQualityDelegation(decoded) || decoded.type === 'refresh' || typeof decoded.userId !== 'string' || !decoded.userId
        || (decoded.tenantId !== undefined && decoded.tenantId !== tenant)) {
        throw new Error('Token is not valid for a servicing connection');
    }
    return decoded;
}

// Credential-free development tokens exist only for local development and
// tests. Any other environment name (staging, uat, production) fails closed.
const developmentTokensAllowed = (env = process.env) => [undefined, '', 'development', 'test'].includes(env.NODE_ENV);

module.exports = { isQualityDelegation, verifyConnectionToken, developmentTokensAllowed };
