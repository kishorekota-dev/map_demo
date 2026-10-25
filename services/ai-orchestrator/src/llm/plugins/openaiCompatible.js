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
  async models(provider, client) {
    const data = await client.request('/models');
    return (Array.isArray(data.data) ? data.data : []).map(model => ({ id: model.id, name: model.id }));
  }
};
