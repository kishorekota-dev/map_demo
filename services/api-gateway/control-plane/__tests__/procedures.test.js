const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createControlPlaneRouter } = require('..');
const { ControlPlaneStore } = require('../store');
const { defaultConfig, validateConfig } = require('../config');
const { validateProcedures, parseProcedureDocument, parseGuardrailLine, resolveProcedure } = require('../procedures');
const { previewPackage } = require('../../platform/solutions');

const KEY = 'procedure-integration-signing-key';
const SOP = fs.readFileSync(path.join(__dirname, '../../../../docs/examples/procedures/card-replacement-sop.md'), 'utf8');

const procedure = (overrides = {}) => ({
  id: 'card_replacement_sop',
  title: 'Replace a lost or stolen card',
  source: 'SOP-CARD-014 rev 3',
  enabled: true,
  intents: ['card_replacement'],
  channels: ['digital', 'ava'],
  steps: [{ id: 'step_1', instruction: 'Confirm the replacement address with the customer.' }],
  guardrails: [
    { id: 'confirm', type: 'require_confirmation' },
    { id: 'address', type: 'require_fields', fields: ['replacementAddress'] },
    { id: 'stolen', type: 'escalate_when', field: 'reason', operator: 'eq', value: 'stolen', action: 'handoff' },
    { id: 'no_promises', type: 'prohibited_phrases', phrases: ['no fee'] },
    { id: 'timing', type: 'required_disclosure', text: 'Replacement cards arrive within 5 to 7 business days.' }
  ],
  ...overrides
});
const withProcedures = (...procedures) => ({ ...defaultConfig(), procedures });

function setup() {
  const store = new ControlPlaneStore({ file: null, tenantId: 'procedure-tenant' });
  const app = express(); app.use(express.json()); app.use(createControlPlaneRouter({ store, jwtSecret: KEY }));
  const call = (method, url, body, role = 'admin') => {
    const token = jwt.sign({ userId: 'author-a', role, tenantId: store.tenantId, type: 'access' }, KEY, { expiresIn: '10m' });
    return request(app)[method](url).set('Authorization', `Bearer ${token}`).send(body);
  };
  return { call, store };
}

describe('procedure validation', () => {
  test('a complete procedure is a valid part of the servicing configuration', () => {
    expect(validateConfig(withProcedures(procedure()))).toEqual([]);
    expect(validateConfig(defaultConfig())).toEqual([]);
  });

  test.each([
    ['unknown keys', { script: 'run()' }, 'script is not supported'],
    ['an unconfigured intent', { intents: ['mortgage_magic'] }, 'unique configured intents'],
    ['an unknown channel', { channels: ['sms'] }, 'unique channel IDs'],
    ['no steps', { steps: [] }, 'steps must contain'],
    ['an unsafe source', { source: 'javascript:alert(1)' }, 'safe HTTP(S) URL'],
    ['sensitive text', { steps: [{ id: 'step_1', instruction: 'Email escalations@bank.example with the card number.' }] }, 'contains an email address'],
    ['an unknown audience', { audience: 'public' }, 'audience must be internal or customer'],
  ])('rejects %s', (_label, overrides, message) => {
    expect(validateProcedures(withProcedures(procedure(overrides))).join(' ')).toContain(message);
  });

  test('guardrail fields must be collected by every bound intent', () => {
    const errors = validateProcedures(withProcedures(procedure({ guardrails: [{ id: 'amount', type: 'escalate_when', field: 'amount', operator: 'gt', value: 100, action: 'handoff' }] })));
    expect(errors.join(' ')).toContain('"amount" is not a required or optional field of intent card_replacement');
  });

  test.each([
    [{ id: 'g', type: 'run_code' }, 'type must be one of'],
    [{ id: 'g', type: 'escalate_when', field: 'reason', operator: 'matches', value: '.*', action: 'handoff' }, 'operator must be one of'],
    [{ id: 'g', type: 'escalate_when', field: 'reason', operator: 'gt', value: 'stolen', action: 'handoff' }, 'finite number'],
    [{ id: 'g', type: 'escalate_when', field: 'reason', operator: 'eq', value: 'stolen', action: 'approve' }, 'handoff or block'],
    [{ id: 'g', type: 'prohibited_phrases', phrases: ['No fee', 'no fee'] }, 'unique phrases'],
    [{ id: 'g', type: 'require_fields', fields: ['authToken'] }, 'supported field name'],
    [{ id: 'g', type: 'required_disclosure', text: '' }, 'nonblank text'],
    [{ id: 'g', type: 'require_confirmation', pattern: '.*' }, 'pattern is not supported'],
  ])('rejects malformed guardrail %j', (guardrail, message) => {
    expect(validateProcedures(withProcedures(procedure({ guardrails: [guardrail] }))).join(' ')).toContain(message);
  });

  test('an unbound procedure is a customer reference with response guardrails only', () => {
    const reference = procedure({ id: 'travel_notice', intents: [], audience: 'customer', guardrails: [{ id: 'fees', type: 'required_disclosure', text: 'Foreign transaction fees may apply.' }] });
    expect(validateProcedures(withProcedures(reference))).toEqual([]);
    expect(validateProcedures(withProcedures({ ...reference, audience: 'internal' })).join(' ')).toContain('internal procedures are never used to answer customers');
    expect(validateProcedures(withProcedures({ ...reference, guardrails: [{ id: 'confirm', type: 'require_confirmation' }] })).join(' ')).toContain('applies only to a procedure bound to an intent');
  });

  test('only one enabled procedure may govern a channel and intent', () => {
    const errors = validateProcedures(withProcedures(procedure(), procedure({ id: 'second_sop', channels: ['ava'] })));
    expect(errors.join(' ')).toContain('duplicates the enabled procedure for ava:card_replacement (also bound by card_replacement_sop)');
    expect(validateProcedures(withProcedures(procedure(), procedure({ id: 'second_sop', channels: ['ava'], enabled: false })))).toEqual([]);
  });

  test('resolution returns the enabled procedure for the exact channel and intent', () => {
    const config = withProcedures(procedure(), procedure({ id: 'draft_sop', enabled: false, channels: ['ivr'] }));
    expect(resolveProcedure(config, { intent: 'card_replacement', channel: 'ava' }).id).toBe('card_replacement_sop');
    expect(resolveProcedure(config, { intent: 'card_replacement', channel: 'ivr' })).toBeNull();
    expect(resolveProcedure(config, { intent: 'balance_inquiry', channel: 'digital' })).toBeNull();
  });
});

describe('procedure document import', () => {
  test.each([
    ['Require confirmation', { type: 'require_confirmation' }],
    ['Always confirm with the customer', { type: 'require_confirmation' }],
    ['Require fields: replacementAddress, reason', { type: 'require_fields', fields: ['replacementAddress', 'reason'] }],
    ['Escalate to a specialist when amount > $5,000', { type: 'escalate_when', field: 'amount', operator: 'gt', value: 5000, action: 'handoff' }],
    ['Escalate when amount is at least 2500', { type: 'escalate_when', field: 'amount', operator: 'gte', value: 2500, action: 'handoff' }],
    ['Block when reason is not lost', { type: 'escalate_when', field: 'reason', operator: 'neq', value: 'lost', action: 'block' }],
    ['Hand off when disputeType in [fraudulent_charge, unauthorized_transaction]', { type: 'escalate_when', field: 'disputeType', operator: 'in', value: ['fraudulent_charge', 'unauthorized_transaction'], action: 'handoff' }],
    ['Never say: "guaranteed refund", "no fee"', { type: 'prohibited_phrases', phrases: ['guaranteed refund', 'no fee'] }],
    ['Disclose: Disputes are reviewed within 10 business days.', { type: 'required_disclosure', text: 'Disputes are reviewed within 10 business days.' }],
    ['Supervisors may waive the fee.', null],
  ])('grammar: %s', (line, expected) => {
    expect(parseGuardrailLine(line)).toEqual(expected);
  });

  test('turns an SOP into a disabled draft with steps, explicit guardrails and reviewable suggestions', () => {
    const result = parseProcedureDocument({ source: 'SOP-CARD-014 rev 3', intents: ['card_replacement'], content: SOP }, defaultConfig());
    expect(result.procedure).toMatchObject({ id: 'replace_a_lost_stolen_or_damaged_card', title: 'Replace a lost, stolen or damaged card', enabled: false, audience: 'internal', channels: ['digital', 'ava'] });
    expect(result.procedure.steps).toHaveLength(5);
    expect(result.procedure.steps[2].instruction).toContain('blocked before ordering');
    expect(result.procedure.guardrails.map((g) => g.type)).toEqual(['require_confirmation', 'require_fields', 'escalate_when', 'prohibited_phrases', 'required_disclosure']);
    expect(result.procedure.guardrails[2]).toMatchObject({ field: 'reason', operator: 'eq', value: 'stolen', sourceText: 'Escalate to a specialist when reason is stolen' });
    // Free-text policy already covered by an explicit rule is not suggested twice.
    expect(result.suggestions).toEqual([expect.objectContaining({ guardrail: expect.objectContaining({ id: 'suggested_1', type: 'prohibited_phrases', phrases: ['your card is already on its way'] }) })]);
    expect(result.warnings).toEqual([expect.stringContaining('Supervisors may waive')]);
    expect(result.warnings[0]).toContain('"Supervisors may waive');
    expect(result.procedure.summary).toContain('Agents must confirm the replacement address');
    expect(result.procedure.summary).not.toContain('Supervisors');
    expect(result.errors).toEqual([]);
    expect(validateConfig(withProcedures({ ...result.procedure, enabled: true }))).toEqual([]);
  });

  test('suggests escalation thresholds and required fields from prose', () => {
    const content = 'Transfers over $10,000 must be referred to a specialist for approval. Always tell the customer that transfers may take one business day. You must verify the amount and memo before submitting.\n\n1. Read the transfer back to the customer.';
    const result = parseProcedureDocument({ source: 'PAY-7', intents: ['transfer_funds'], content }, defaultConfig());
    const types = result.suggestions.map((s) => s.guardrail);
    expect(types).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'escalate_when', field: 'amount', operator: 'gt', value: 10000, action: 'handoff' }),
      expect.objectContaining({ type: 'required_disclosure', text: 'Transfers may take one business day.' }),
      expect.objectContaining({ type: 'require_fields', fields: ['amount', 'memo'] }),
    ]));
    expect(result.suggestions[0].sourceText).toContain('over $10,000');
  });

  test('reports what would block saving, without guessing', () => {
    const result = parseProcedureDocument({ source: 'SOP-1', intents: ['balance_inquiry'], content: 'Plain prose without any numbered steps at all.\n## Rules\n- Escalate when amount > 100' }, defaultConfig());
    expect(result.warnings.join(' ')).toContain('No numbered steps');
    expect(result.errors.join(' ')).toContain('steps must contain');
    expect(result.errors.join(' ')).toContain('"amount" is not a required or optional field of intent balance_inquiry');
  });

  test.each([
    [{ source: 'SOP', content: 'too short' }, 'must be 20 to'],
    [{ source: 'SOP', content: 'x'.repeat(30001) }, 'Split longer manuals'],
    [{ content: 'A valid length procedure document body.' }, 'governing source'],
  ])('rejects unusable documents', (document, message) => {
    expect(() => parseProcedureDocument(document, defaultConfig())).toThrow(message);
  });
});

describe('procedure governance routes', () => {
  test('editors parse documents without changing the draft; viewers cannot', async () => {
    const { call, store } = setup();
    const before = await store.read();
    const parsed = await call('post', '/studio/procedures/parse', { document: { source: 'SOP-CARD-014', intents: ['card_replacement'], content: SOP } }, 'control_plane_editor').expect(200);
    expect(parsed.body.procedure.guardrails).toHaveLength(5);
    expect((await store.read()).revision).toBe(before.revision);
    await call('post', '/studio/procedures/parse', { document: { source: 'SOP', content: SOP } }, 'control_plane_viewer').expect(403);
    const invalid = await call('post', '/studio/procedures/parse', { document: { source: 'SOP', content: 'short' } }, 'control_plane_editor').expect(400);
    expect(invalid.body.error).toContain('must be 20 to');
  });

  test('a procedure is saved, simulated and published through the existing draft gates', async () => {
    const { call, store } = setup();
    const { revision, draft } = await store.read();
    const rejected = await call('put', '/draft', { revision, config: { ...draft, procedures: [procedure({ intents: ['nope'] })] } });
    expect(rejected.status).toBe(400);
    const saved = await call('put', '/draft', { revision, config: { ...draft, procedures: [procedure()] } }).expect(200);
    expect(saved.body.draft.procedures[0].id).toBe('card_replacement_sop');
    const simulated = await call('post', '/simulate', { utterance: 'I need a replacement card', channel: 'digital' }).expect(200);
    expect(simulated.body).toMatchObject({ intent: 'card_replacement', procedure: { id: 'card_replacement_sop', steps: 1 } });
    expect(simulated.body.requiredFields).toEqual(expect.arrayContaining(['cardId', 'reason', 'replacementAddress']));
    const ivr = await call('post', '/simulate', { utterance: 'I need a replacement card', channel: 'ivr' }).expect(200);
    expect(ivr.body.procedure).toBeUndefined();
  });

  test('solution packages carry procedures and report conflicts by id', () => {
    const current = withProcedures(procedure());
    const solution = { schemaVersion: 1, manifest: { id: 'card-sops', name: 'Card SOPs', description: 'Card servicing procedures', version: '1.0.0' },
      configuration: { procedures: [procedure({ title: 'Revised card replacement' }), procedure({ id: 'card_activation_sop', intents: ['card_activation'], guardrails: [] })] } };
    const preview = previewPackage(current, solution);
    expect(preview.configuration.procedures.map((entry) => entry.id)).toEqual(['card_replacement_sop', 'card_activation_sop']);
    expect(preview.conflicts).toEqual(['procedures[card_replacement_sop]']);
    expect(previewPackage(defaultConfig(), { ...solution, configuration: { procedures: [procedure()] } }).conflicts).toEqual([]);
  });

  test('the orchestrator accepts exactly what the control plane publishes', () => {
    const { validateSnapshot } = require('../../../ai-orchestrator/src/services/controlPlaneRuntime');
    expect(() => validateSnapshot({ version: 3, config: withProcedures(procedure()) })).not.toThrow();
    expect(() => validateSnapshot({ version: 3, config: withProcedures(procedure({ guardrails: [{ id: 'g', type: 'run_code' }] })) })).toThrow(/procedure/i);
  });
});
