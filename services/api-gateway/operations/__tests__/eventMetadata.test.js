const { eventMetadata } = require('../eventMetadata');
test('analytics accepts only explicit operational enums, bounded confidence and boolean evidence', () => {
  expect(eventMetadata({ tool: 'banking_create_transfer', recognitionSource: 'lexical', confirmationRequired: true,
    confidence: 0.75, workflowStatus: 'complete', reason: 'allowed', request: { text: 'private input' },
    reconciliationReference: 'external private evidence' })).toEqual({ tool: 'banking_create_transfer', recognitionSource: 'lexical',
    confirmationRequired: true, confidence: 0.75, workflowStatus: 'complete', reason: 'allowed' });
  expect(eventMetadata({ tool: 'private payload', reason: 'Customer private note', workflowStatus: 'Customer private note',
    recognitionSource: 'private payload', confidence: Infinity, confirmationVerified: 'true' })).toEqual({});
  expect(eventMetadata([])).toEqual({});
});
