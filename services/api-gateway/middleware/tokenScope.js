// Worker delegations are valid only at the AI service's internal evaluation
// endpoint. The gateway never treats one as a customer's or operator's login.
const isQualityDelegation = claims => claims?.purpose === 'quality_evaluation'
  || [claims?.aud].flat().includes('servicing-quality');
module.exports = { isQualityDelegation };
