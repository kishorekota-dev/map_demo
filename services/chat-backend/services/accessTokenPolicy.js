// Delegated jobs cannot exchange their narrow capability for a customer session.
const isQualityDelegation = claims => claims?.purpose === 'quality_evaluation' || (Array.isArray(claims?.aud) ? claims.aud : [claims?.aud]).includes('servicing-quality');
module.exports = { isQualityDelegation };
