const { usage } = require('../contract');
module.exports = {
  async generate(provider, input, client) {
    const data = await client.request('/chat/completions', { model: input.model, messages: input.messages, stream: false,
      ...(provider.supportsTemperature ? { temperature: input.temperature } : {}), max_tokens: input.maxOutputTokens,
      ...(input.format === 'json' ? { response_format: { type: 'json_object' } } : {}) });
    const choice = data.choices?.[0];
    if (choice?.message?.tool_calls?.length || choice?.message?.function_call || choice?.finish_reason === 'length') client.invalidResponse();
    return { text: choice?.message?.content, usage: usage(data.usage?.prompt_tokens, data.usage?.completion_tokens, data.usage?.total_tokens), finishReason: choice?.finish_reason || null };
  },
  async embed(provider, input, client) {
    const data = await client.request('/embeddings', { model: input.model, input: input.input, encoding_format: 'float' });
    const items = Array.isArray(data.data) ? [...data.data].sort((a, b) => a.index - b.index) : [];
    return { vectors: items.map(item => item.embedding), usage: usage(data.usage?.prompt_tokens, undefined, data.usage?.total_tokens) };
  },
  async models(provider, client) {
    const data = await client.request('/models');
    return (Array.isArray(data.data) ? data.data : []).map(model => ({ id: model.id, name: model.id }));
  }
};
