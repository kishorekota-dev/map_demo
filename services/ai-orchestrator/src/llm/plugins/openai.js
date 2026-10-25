const { usage } = require('../contract');
module.exports = {
  async generate(provider, input, client) {
    const data = await client.request('/responses', { model: input.model, input: input.messages, store: false,
      ...(provider.supportsTemperature ? { temperature: input.temperature } : {}), max_output_tokens: input.maxOutputTokens,
      ...(input.format === 'json' ? { text: { format: { type: 'json_object' } } } : {}) });
    if (data.error || ['failed', 'cancelled', 'incomplete'].includes(data.status)
      || (data.output || []).some(item => item.type === 'function_call')) client.invalidResponse();
    const text = (Array.isArray(data.output) ? data.output : []).filter(item => item.type === 'message')
      .flatMap(item => Array.isArray(item.content) ? item.content : []).filter(part => part.type === 'output_text').map(part => part.text).join('');
    return { text: text || data.output_text, usage: usage(data.usage?.input_tokens, data.usage?.output_tokens, data.usage?.total_tokens), finishReason: data.status || null };
  },
  async models(provider, client) {
    const data = await client.request('/models');
    return (Array.isArray(data.data) ? data.data : []).map(model => ({ id: model.id, name: model.id }));
  }
};
