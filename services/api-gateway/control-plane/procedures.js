// Approved servicing procedures: the standard operating procedures the assistant
// follows, with typed guardrails the runtime enforces. Procedures are part of the
// release-governed configuration, so they are diffed, approved, promoted, pinned
// to in-flight conversations and rolled back exactly like intents. Authors supply
// text and declarative rules only; nothing here executes author-supplied code or
// regular expressions.
const { CHANNEL_IDS, object, text, identifier } = require('./config');
const { sensitiveTextIssues, sourceIssues } = require('../operations/knowledgeValidation');

const LIMITS = { procedures: 100, intents: 50, steps: 40, step: 1000, guardrails: 20, body: 30000, summary: 1000, message: 500, sourceText: 1000, phrases: 50, phrase: 200, disclosure: 500, values: 50, value: 200 };
const PROCEDURE_FIELDS = ['id', 'title', 'source', 'enabled', 'audience', 'intents', 'channels', 'summary', 'steps', 'body', 'guardrails'];
// internal: instructions and guardrails only, never quoted to customers.
// customer: may also ground answers to customers' questions.
const AUDIENCES = ['internal', 'customer'];
const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'];
const GUARDRAIL_FIELDS = {
  require_fields: ['fields'],
  require_confirmation: [],
  escalate_when: ['field', 'operator', 'value', 'action'],
  prohibited_phrases: ['phrases'],
  required_disclosure: ['text']
};
// The guardrails that can govern an answer grounded in an unbound procedure.
const RESPONSE_GUARDRAILS = ['prohibited_phrases', 'required_disclosure'];
const RESERVED_FIELDS = ['__proto__', 'constructor', 'prototype', 'authToken', 'userId', 'tenantId'];
const fieldName = (value) => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value) && !RESERVED_FIELDS.includes(value);
const declaredFields = (intent) => new Set([...(Array.isArray(intent?.requiredData) ? intent.requiredData : []), ...(Array.isArray(intent?.optionalData) ? intent.optionalData : [])]);
const uniqueStrings = (list, max, maxLength) => Array.isArray(list) && list.length >= 1 && list.length <= max
  && list.every((value) => text(value, maxLength)) && new Set(list).size === list.length;

function validateGuardrail(guardrail, path, boundIntents, ids, errors) {
  if (!object(guardrail)) { errors.push(`${path} must be an object.`); return; }
  const allowed = GUARDRAIL_FIELDS[guardrail.type];
  if (!allowed) { errors.push(`${path}.type must be one of ${Object.keys(GUARDRAIL_FIELDS).join(', ')}.`); return; }
  for (const key of Object.keys(guardrail)) if (![...allowed, 'id', 'type', 'message', 'sourceText'].includes(key)) errors.push(`${path}.${key} is not supported for ${guardrail.type}.`);
  if (!identifier(guardrail.id) || ids.has(guardrail.id)) errors.push(`${path}.id must be a unique identifier within the procedure.`);
  ids.add(guardrail.id);
  if (guardrail.message !== undefined && !text(guardrail.message, LIMITS.message)) errors.push(`${path}.message must be nonblank text up to ${LIMITS.message} characters.`);
  if (guardrail.sourceText !== undefined && !text(guardrail.sourceText, LIMITS.sourceText)) errors.push(`${path}.sourceText must be nonblank text up to ${LIMITS.sourceText} characters.`);
  // A guardrail on a field the intent never collects could never be satisfied
  // or evaluated, so every bound intent must declare it.
  const requireDeclared = (field, label) => {
    if (!fieldName(field)) { errors.push(`${path}.${label} must be a supported field name.`); return; }
    for (const intent of boundIntents) if (!declaredFields(intent).has(field)) errors.push(`${path}.${label} "${field}" is not a required or optional field of intent ${intent.id}.`);
  };
  if (guardrail.type === 'require_fields') {
    if (!uniqueStrings(guardrail.fields, 20, 64)) errors.push(`${path}.fields must list 1 to 20 unique field names.`);
    else guardrail.fields.forEach((field, index) => requireDeclared(field, `fields[${index}]`));
  } else if (guardrail.type === 'escalate_when') {
    requireDeclared(guardrail.field, 'field');
    if (!OPERATORS.includes(guardrail.operator)) errors.push(`${path}.operator must be one of ${OPERATORS.join(', ')}.`);
    const scalar = (value) => (typeof value === 'string' && text(value, LIMITS.value)) || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean';
    if (['gt', 'gte', 'lt', 'lte'].includes(guardrail.operator) && (typeof guardrail.value !== 'number' || !Number.isFinite(guardrail.value))) errors.push(`${path}.value must be a finite number for ${guardrail.operator}.`);
    if (['eq', 'neq'].includes(guardrail.operator) && !scalar(guardrail.value)) errors.push(`${path}.value must be a bounded string, number or boolean.`);
    if (guardrail.operator === 'in' && (!Array.isArray(guardrail.value) || !guardrail.value.length || guardrail.value.length > LIMITS.values || !guardrail.value.every((value) => scalar(value) && typeof value !== 'boolean'))) errors.push(`${path}.value must list 1 to ${LIMITS.values} strings or numbers.`);
    if (!['handoff', 'block'].includes(guardrail.action)) errors.push(`${path}.action must be handoff or block.`);
  } else if (guardrail.type === 'prohibited_phrases') {
    if (!Array.isArray(guardrail.phrases) || !guardrail.phrases.length || guardrail.phrases.length > LIMITS.phrases
      || guardrail.phrases.some((phrase) => !text(phrase, LIMITS.phrase) || phrase.trim().length < 2)
      || new Set(guardrail.phrases.map((phrase) => phrase.trim().toLowerCase())).size !== guardrail.phrases.length) errors.push(`${path}.phrases must list 1 to ${LIMITS.phrases} unique phrases of 2 to ${LIMITS.phrase} characters.`);
  } else if (guardrail.type === 'required_disclosure') {
    if (!text(guardrail.text, LIMITS.disclosure)) errors.push(`${path}.text must be nonblank text up to ${LIMITS.disclosure} characters.`);
  }
}

function validateProcedures(config) {
  const procedures = config?.procedures;
  if (procedures === undefined) return [];
  if (!Array.isArray(procedures) || procedures.length > LIMITS.procedures) return [`procedures must be a list of at most ${LIMITS.procedures} entries.`];
  const errors = [];
  const intents = new Map((Array.isArray(config.intents) ? config.intents : []).filter(object).map((intent) => [intent.id, intent]));
  const ids = new Set();
  const bindings = new Map();
  procedures.forEach((procedure, index) => {
    const path = `procedures[${index}]`;
    if (!object(procedure)) { errors.push(`${path} must be an object.`); return; }
    for (const key of Object.keys(procedure)) if (!PROCEDURE_FIELDS.includes(key)) errors.push(`${path}.${key} is not supported.`);
    if (!identifier(procedure.id) || ids.has(procedure.id)) errors.push(`${path}.id must be a unique identifier.`);
    ids.add(procedure.id);
    if (!text(procedure.title, 200)) errors.push(`${path}.title is required (maximum 200 characters).`);
    if (typeof procedure.source !== 'string' || !procedure.source.trim()) errors.push(`${path}.source must name the governing document or HTTPS location.`);
    else errors.push(...sourceIssues(procedure.source).map((issue) => `${path}.${issue}`));
    if (typeof procedure.enabled !== 'boolean') errors.push(`${path}.enabled must be boolean.`);
    if (procedure.audience !== undefined && !AUDIENCES.includes(procedure.audience)) errors.push(`${path}.audience must be internal or customer.`);
    if (procedure.summary !== undefined && !text(procedure.summary, LIMITS.summary)) errors.push(`${path}.summary must be nonblank text up to ${LIMITS.summary} characters.`);
    if (procedure.body !== undefined && !text(procedure.body, LIMITS.body)) errors.push(`${path}.body must be nonblank text up to ${LIMITS.body} characters.`);
    // An unbound procedure is a retrieval-only reference for customer answers.
    const intentsValid = Array.isArray(procedure.intents) && (procedure.intents.length === 0 || uniqueStrings(procedure.intents, LIMITS.intents, 64))
      && procedure.intents.every((id) => intents.has(id));
    if (!intentsValid) errors.push(`${path}.intents must list up to ${LIMITS.intents} unique configured intents.`);
    const unbound = intentsValid && procedure.intents.length === 0;
    if (unbound && procedure.audience !== 'customer') errors.push(`${path} must be bound to at least one intent unless its audience is customer; internal procedures are never used to answer customers.`);
    const channelsValid = uniqueStrings(procedure.channels, CHANNEL_IDS.length, 16) && procedure.channels.every((id) => CHANNEL_IDS.includes(id));
    if (!channelsValid) errors.push(`${path}.channels must list unique channel IDs (digital, ava, ivr).`);
    const stepIds = new Set();
    if (!Array.isArray(procedure.steps) || !procedure.steps.length || procedure.steps.length > LIMITS.steps) errors.push(`${path}.steps must contain 1 to ${LIMITS.steps} steps.`);
    else procedure.steps.forEach((step, stepIndex) => {
      const stepPath = `${path}.steps[${stepIndex}]`;
      if (!object(step) || Object.keys(step).some((key) => !['id', 'instruction'].includes(key))) { errors.push(`${stepPath} must contain only id and instruction.`); return; }
      if (!identifier(step.id) || stepIds.has(step.id)) errors.push(`${stepPath}.id must be a unique identifier within the procedure.`);
      stepIds.add(step.id);
      if (!text(step.instruction, LIMITS.step)) errors.push(`${stepPath}.instruction is required (maximum ${LIMITS.step} characters).`);
    });
    const guardrailIds = new Set();
    const boundIntents = intentsValid ? procedure.intents.map((id) => intents.get(id)) : [];
    if (procedure.guardrails !== undefined && (!Array.isArray(procedure.guardrails) || procedure.guardrails.length > LIMITS.guardrails)) errors.push(`${path}.guardrails must contain at most ${LIMITS.guardrails} guardrails.`);
    else (procedure.guardrails || []).forEach((guardrail, guardrailIndex) => {
      validateGuardrail(guardrail, `${path}.guardrails[${guardrailIndex}]`, boundIntents, guardrailIds, errors);
      if (unbound && RESPONSE_GUARDRAILS.includes(guardrail?.type) === false) errors.push(`${path}.guardrails[${guardrailIndex}] ${guardrail?.type} applies only to a procedure bound to an intent.`);
    });
    // Procedures are published to customers' conversations, so they follow the
    // same sensitive-content preflight as approved knowledge.
    const authored = [['title', procedure.title], ['summary', procedure.summary], ['body', procedure.body],
      ...(Array.isArray(procedure.steps) ? procedure.steps.map((step, i) => [`steps[${i}].instruction`, step?.instruction]) : []),
      ...(Array.isArray(procedure.guardrails) ? procedure.guardrails.flatMap((g, i) => [[`guardrails[${i}].message`, g?.message], [`guardrails[${i}].text`, g?.text]]) : [])];
    for (const [field, value] of authored) if (typeof value === 'string') errors.push(...sensitiveTextIssues(value).map((issue) => `${path}.${field} ${issue}.`));
    // One enabled procedure per channel and intent keeps the applied
    // instructions and guardrails unambiguous.
    if (procedure.enabled === true && intentsValid && channelsValid) {
      for (const channel of procedure.channels) for (const intent of procedure.intents) {
        const key = `${channel}:${intent}`;
        if (bindings.has(key)) errors.push(`${path} duplicates the enabled procedure for ${key} (also bound by ${bindings.get(key)}).`);
        else bindings.set(key, procedure.id);
      }
    }
  });
  return errors;
}

function resolveProcedure(config, { intent, channel }) {
  return (Array.isArray(config?.procedures) ? config.procedures : [])
    .find((procedure) => procedure.enabled === true && procedure.intents.includes(intent) && procedure.channels.includes(channel)) || null;
}

// ---------------------------------------------------------------------------
// Document import. Parsing is deterministic: the same document always yields
// the same draft. Explicit rules in a guardrails section become guardrails;
// sentences elsewhere that look like policy are returned as suggestions for an
// author to accept. Nothing is enforced until the draft is saved and published.

const GUARDRAIL_HEADING = /\b(guardrails?|polic(?:y|ies)|rules?|controls?|compliance|restrictions?)\b/i;
const STEP_HEADING = /\b(steps?|procedures?|process|instructions?|workflow|how to)\b/i;
const COMPARATORS = [
  [/^(>=|=>|at least|no less than)$/i, 'gte'], [/^(<=|=<|at most|no more than)$/i, 'lte'],
  [/^(>|over|above|exceeds?|greater than|more than)$/i, 'gt'], [/^(<|under|below|less than)$/i, 'lt'],
  [/^(!=|<>|is not|isn't|not)$/i, 'neq'], [/^(=|==|is|equals?)$/i, 'eq'], [/^(in|one of|is one of)$/i, 'in']
];
const COMPARATOR_SOURCE = '>=|=>|<=|=<|!=|<>|==|=|>|<|at least|no less than|at most|no more than|is one of|one of|is not|isn\'t|is|equals?|over|above|exceeds?|greater than|more than|under|below|less than|in|not';

function slug(value) {
  const base = String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 54);
  return /^[a-z]/.test(base) ? base : `procedure_${base}`.replace(/_+$/, '').slice(0, 64);
}
const unquote = (value) => value.trim().replace(/^["'“”‘’](.*)["'“”‘’]$/s, '$1').trim();
const quoted = (value) => [...value.matchAll(/["“]([^"”]{2,200})["”]/g)].map((match) => match[1].trim());
const splitList = (value) => value.split(/\s*(?:,|;|\bor\b|\band\b)\s*/i).map(unquote).filter(Boolean);
const words = (field) => field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
function literal(value) {
  const raw = unquote(value).replace(/[.;]$/, '');
  const numeric = raw.replace(/^\$\s?/, '').replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return Number(numeric);
  if (/^(true|yes)$/i.test(raw)) return true;
  if (/^(false|no)$/i.test(raw)) return false;
  return raw;
}
function comparator(word) {
  return COMPARATORS.find(([pattern]) => pattern.test(word.trim()))?.[1] || null;
}

// Grammar for one explicit guardrail line. Returns null when the line is not a
// recognized rule; the caller reports it rather than guessing.
function parseGuardrailLine(line) {
  const rule = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
  let match;
  if (/^(?:always\s+)?(?:require|requires|obtain|get)\s+(?:explicit\s+|customer\s+)?confirmation\b/i.test(rule) || /^always\s+confirm\b/i.test(rule)) {
    return { type: 'require_confirmation' };
  }
  if ((match = rule.match(/^(?:require|required|collect|must collect)\s+(?:fields?|information|data)?\s*:?\s*(.+)$/i)) && !/^confirmation/i.test(match[1])) {
    const fields = splitList(match[1]).map((value) => value.replace(/\s+/g, ''));
    return fields.length && fields.every(fieldName) ? { type: 'require_fields', fields } : null;
  }
  if ((match = rule.match(new RegExp(`^(escalate|hand\\s*off|handoff|transfer|route to (?:a )?(?:human|specialist|agent)|block|stop|refuse)\\b(?:\\s+to\\s+(?:a\\s+)?(?:human|specialist|agent|supervisor))?\\s+(?:when|if)\\s+([A-Za-z][A-Za-z0-9_]*)\\s+(?:is\\s+)?(${COMPARATOR_SOURCE})\\s+(.+)$`, 'i')))) {
    const [, verb, field, word, rawValue] = match;
    const operator = comparator(word);
    if (!operator || !fieldName(field)) return null;
    const value = operator === 'in' ? splitList(rawValue.replace(/^\[|\]$/g, '')).map(literal) : literal(rawValue);
    return { type: 'escalate_when', field, operator, value, action: /^(block|stop|refuse)/i.test(verb) ? 'block' : 'handoff' };
  }
  if ((match = rule.match(/^(?:never|do not|don't|must not)\s+(?:say|promise|state|use|tell)\s*:?\s*(.+)$/i)) || (match = rule.match(/^prohibited\s+phrases?\s*:?\s*(.+)$/i))) {
    const phrases = quoted(match[1]).length ? quoted(match[1]) : splitList(match[1]);
    return phrases.length ? { type: 'prohibited_phrases', phrases: [...new Set(phrases)] } : null;
  }
  if ((match = rule.match(/^(?:required\s+)?disclos(?:e|ure)\s*:?\s*(.+)$/i)) || (match = rule.match(/^always\s+(?:say|tell the customer|inform the customer)\s*:?\s*(.+)$/i))) {
    const disclosure = unquote(match[1]);
    return disclosure ? { type: 'required_disclosure', text: disclosure } : null;
  }
  return null;
}

// Heuristic policy detection over free text. Each suggestion keeps the exact
// sentence it came from so the author can judge it.
function suggestGuardrails(sentences, fields) {
  const suggestions = [];
  const add = (guardrail, sentence, note) => suggestions.push({ guardrail: { ...guardrail, sourceText: sentence.slice(0, LIMITS.sourceText) }, sourceText: sentence, ...(note ? { note } : {}) });
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (/\b(must|always|required to|need to)\b/.test(lower) && /\bconfirm(ation)?\b/.test(lower)) add({ type: 'require_confirmation' }, sentence);
    const threshold = sentence.match(/\b(over|above|exceed(?:s|ing)?|more than|greater than|in excess of|at least)\s+\$?\s?(\d[\d,]*(?:\.\d+)?)/i);
    if (threshold && /\b(escalat\w*|specialist|supervisor|human|manual review|agent|approval|refer\w*)\b/i.test(sentence)) {
      const amountField = fields.has('amount') ? 'amount' : [...fields].find((field) => /amount/i.test(field));
      add({ type: 'escalate_when', field: amountField || 'amount', operator: /at least/i.test(threshold[1]) ? 'gte' : 'gt', value: Number(threshold[2].replace(/,/g, '')), action: 'handoff' }, sentence,
        amountField ? undefined : 'No bound intent declares an amount field; bind an intent that collects it before accepting.');
    }
    if (/\b(never|do not|don't|must not)\b/.test(lower) && /\b(say|promise|guarantee|state|tell)\b/.test(lower) && quoted(sentence).length) add({ type: 'prohibited_phrases', phrases: [...new Set(quoted(sentence))] }, sentence);
    const disclosure = sentence.match(/\b(?:always|must)\s+(?:tell|inform|advise|remind)\s+(?:the\s+)?(?:customer|caller|member|client)s?\s+that\s+(.+)$/i);
    if (disclosure) {
      const statement = disclosure[1].trim().replace(/^(\p{Ll})/u, (letter) => letter.toUpperCase());
      add({ type: 'required_disclosure', text: /[.!?]$/.test(statement) ? statement : `${statement}.` }, sentence);
    }
    if (/\b(must|always|required|need to|before)\b/.test(lower) && /\b(verify|collect|obtain|ask for|confirm|capture|record)\b/.test(lower)) {
      const mentioned = [...fields].filter((field) => lower.includes(words(field)));
      if (mentioned.length) add({ type: 'require_fields', fields: mentioned }, sentence);
    }
  }
  return suggestions;
}

function parseProcedureDocument(input, config) {
  if (!object(input)) throw Object.assign(new Error('Provide a procedure document object.'), { status: 400 });
  const content = typeof input.content === 'string' ? input.content.replace(/\r\n?/g, '\n').normalize('NFKC') : '';
  if (content.trim().length < 20 || content.length > LIMITS.body) throw Object.assign(new Error(`Procedure content must be 20 to ${LIMITS.body} characters. Split longer manuals into one document per procedure.`), { status: 400 });
  if (typeof input.source !== 'string' || !input.source.trim() || input.source.length > 1000) throw Object.assign(new Error('Name the governing source document or HTTPS location (maximum 1000 characters).'), { status: 400 });
  for (const [key, max] of [['id', 64], ['title', 200]]) if (input[key] !== undefined && !text(input[key], max)) throw Object.assign(new Error(`${key} must be nonblank text up to ${max} characters.`), { status: 400 });
  if (input.audience !== undefined && !AUDIENCES.includes(input.audience)) throw Object.assign(new Error('audience must be internal or customer.'), { status: 400 });
  for (const key of ['intents', 'channels']) if (input[key] !== undefined && (!Array.isArray(input[key]) || input[key].length > LIMITS.intents || input[key].some((value) => typeof value !== 'string'))) throw Object.assign(new Error(`${key} must be a list of identifiers.`), { status: 400 });

  const lines = content.split('\n');
  const warnings = [];
  const steps = [];
  const guardrails = [];
  const prose = [];
  // Unrecognized rules are scanned for suggestions but never become the summary.
  const unrecognized = [];
  let heading = '';
  let headingTitle = '';
  let current = null;
  for (const line of lines) {
    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (headingMatch) { heading = headingMatch[1]; headingTitle ||= heading; current = null; continue; }
    if (!line.trim()) { current = null; continue; }
    const inGuardrails = GUARDRAIL_HEADING.test(heading) && !STEP_HEADING.test(heading);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (inGuardrails && (ordered || bullet || line.trim())) {
      const parsed = parseGuardrailLine(line);
      if (parsed) guardrails.push({ guardrail: parsed, line: line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim() });
      else {
        const rule = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
        warnings.push(`Guardrail not recognized and not enforced: "${rule.slice(0, 200)}". Rephrase it using the guardrail grammar or keep it as a step.`);
        unrecognized.push(rule);
      }
      current = null;
      continue;
    }
    if (ordered || (bullet && STEP_HEADING.test(heading))) {
      current = { instruction: (ordered || bullet)[1].trim() };
      steps.push(current);
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) { current.instruction = `${current.instruction} ${line.trim()}`; continue; }
    current = null;
    prose.push(line.trim());
  }
  if (!steps.length) warnings.push('No numbered steps were found. Add a numbered list so the assistant has ordered instructions.');
  if (steps.length > LIMITS.steps) warnings.push(`Only the first ${LIMITS.steps} steps were kept.`);
  const keptSteps = steps.slice(0, LIMITS.steps).map((step, index) => {
    if (step.instruction.length > LIMITS.step) warnings.push(`Step ${index + 1} was shortened to ${LIMITS.step} characters.`);
    return { id: `step_${index + 1}`, instruction: step.instruction.slice(0, LIMITS.step) };
  });
  const title = (input.title || headingTitle || prose[0] || 'Imported procedure').trim().slice(0, 200);
  const intents = [...new Set(input.intents || [])];
  const configuredIntents = new Map((config?.intents || []).map((intent) => [intent.id, intent]));
  const fields = intents.map((id) => declaredFields(configuredIntents.get(id)))
    .reduce((shared, set) => shared === null ? new Set(set) : new Set([...shared].filter((field) => set.has(field))), null) || new Set();
  const sentences = [...prose, ...unrecognized].join(' ').split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 12)
    .concat(keptSteps.map((step) => step.instruction));
  const procedure = {
    id: input.id ? input.id.trim() : slug(title),
    title,
    source: input.source.trim(),
    enabled: false,
    audience: input.audience || 'internal',
    intents,
    channels: [...new Set(input.channels || ['digital', 'ava'])],
    ...(prose.length ? { summary: prose.filter((line) => !/^[-*+]/.test(line)).join(' ').slice(0, LIMITS.summary).trim() || undefined } : {}),
    steps: keptSteps,
    body: content.trim(),
    guardrails: guardrails.slice(0, LIMITS.guardrails).map(({ guardrail, line }, index) => ({ id: `guardrail_${index + 1}`, ...guardrail, sourceText: line.slice(0, LIMITS.sourceText) }))
  };
  if (procedure.summary === undefined) delete procedure.summary;
  if (guardrails.length > LIMITS.guardrails) warnings.push(`Only the first ${LIMITS.guardrails} guardrails were kept.`);
  // Drop suggestions an explicit rule already covers, then number the rest.
  const comparable = (guardrail) => JSON.stringify(Object.keys(guardrail).filter((key) => !['id', 'sourceText'].includes(key)).sort().map((key) => [key, guardrail[key]]));
  const suggestions = suggestGuardrails(sentences, fields)
    .filter((suggestion) => !procedure.guardrails.some((existing) => comparable(existing) === comparable(suggestion.guardrail)))
    .map((suggestion, index) => ({ ...suggestion, guardrail: { id: `suggested_${index + 1}`, ...suggestion.guardrail } }));
  // Report what would block saving this draft against the current configuration.
  const candidate = { ...config, procedures: [...(config?.procedures || []).filter((entry) => entry.id !== procedure.id), procedure] };
  const errors = validateProcedures(candidate).filter((error) => error.startsWith(`procedures[${candidate.procedures.length - 1}]`))
    .map((error) => error.replace(/^procedures\[\d+\]/, 'procedure'));
  return { procedure, suggestions, warnings, errors, replaces: (config?.procedures || []).some((entry) => entry.id === procedure.id) };
}

module.exports = { LIMITS, OPERATORS, AUDIENCES, GUARDRAIL_TYPES: Object.keys(GUARDRAIL_FIELDS), validateProcedures, resolveProcedure, parseProcedureDocument, parseGuardrailLine };
