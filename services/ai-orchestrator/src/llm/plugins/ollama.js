const { usage } = require('../contract');
module.exports = {
  async generate(provider, input, client) {
    const data = await client.request('/api/chat', { model: input.model, messages: input.messages, stream: false, think: false,
      ...(input.format === 'json' ? { format: 'json' } : {}), options: { ...(provider.supportsTemperature ? { temperature: input.temperature } : {}), num_predict: input.maxOutputTokens } });
    if (data.message?.tool_calls?.length || data.done === false || data.done_reason === 'length') client.invalidResponse();
    return { text: data.message?.content, usage: usage(data.prompt_eval_count, data.eval_count), finishReason: data.done_reason || null };
  },
  async embed(provider, input, client) {
    const data = await client.request('/api/embed', { model: input.model, input: input.input });
    return { vectors: data.embeddings, usage: usage(data.prompt_eval_count) };
  },
  async models(provider, client) {
    const data = await client.request('/api/tags');
    return (Array.isArray(data.models) ? data.models : []).map(model => ({ id: model.model || model.name, name: model.name || model.model }));
  }
};
