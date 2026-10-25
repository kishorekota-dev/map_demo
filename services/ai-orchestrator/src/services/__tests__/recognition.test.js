const { recognize } = require('../recognition');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
describe('governed recognition', () => {
  const config = () => ({ ...defaultConfig(), recognition: { strategy: 'lexical', confidenceThreshold: .65, ambiguityMargin: .12, ambiguityAction: 'clarify', synonyms: {} } });
  test.each([
    ['Please tell me how much cash is left in checking.', 'balance_inquiry'],
    ['I would like to temporarily lock the debit card I misplaced.', 'card_management'],
    ['Please send fifty dollars to my other account.', 'transfer_funds']
  ])('recognizes evaluated paraphrase %s', (text, intent) => {
    expect(recognize(config(), text)).toMatchObject({ intent, ambiguous: false, source: 'lexical' });
  });
  test('unknown/ambiguous language never becomes an automatic action', () => {
    expect(recognize(config(), 'purple mountain bicycle').intent).toBeNull();
    const settings = config();
    settings.intents.find(entry => entry.id === 'help').patterns = ['same phrase'];
    settings.intents.find(entry => entry.id === 'transfer_funds').patterns = ['same phrase'];
    expect(recognize(settings, 'same phrase')).toMatchObject({ intent: null, ambiguous: true });
  });
  test('validates external scores and labels fallback honestly', () => {
    const settings = config(); settings.recognition.strategy = 'external';
    expect(recognize(settings, 'purple mountain', { candidates: [{ intent: 'evil', confidence: 1 }, { intent: 'transfer_funds', confidence: 10 }] }).intent).toBeNull();
    expect(recognize(settings, 'purple mountain', { candidates: [{ intent: 'help', confidence: .9 }, { intent: 'general_inquiry', confidence: .4 }] }))
      .toMatchObject({ intent: 'help', source: 'external' });
    expect(recognize(settings, 'cash left checking').source).toBe('lexical_fallback');
  });
});
