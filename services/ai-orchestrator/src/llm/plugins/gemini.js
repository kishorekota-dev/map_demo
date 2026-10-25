const { usage } = require('../contract');
module.exports = {
  async generate(provider, input, client) {
    const system = input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
    const contents = input.messages.filter(message => message.role !== 'system').map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
    const model = input.model.replace(/^models\//, '');
    const path = provider.type === 'vertex_gemini'
      ? `/v1/projects/${encodeURIComponent(provider.project)}/locations/${encodeURIComponent(provider.location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
      : `/models/${encodeURIComponent(model)}:generateContent`;
    const data = await client.request(path, { ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents,
      generationConfig: { ...(provider.supportsTemperature ? { temperature: input.temperature } : {}), maxOutputTokens: input.maxOutputTokens, candidateCount: 1,
        ...(input.format === 'json' ? { responseMimeType: 'application/json' } : {}) } });
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== 'STOP')
      || candidate?.content?.parts?.some(part => part.functionCall)) client.invalidResponse();
    return { text: (candidate?.content?.parts || []).filter(part => typeof part.text === 'string' && !part.thought).map(part => part.text).join(''),
      usage: usage(data.usageMetadata?.promptTokenCount, data.usageMetadata?.candidatesTokenCount, data.usageMetadata?.totalTokenCount), finishReason: candidate?.finishReason || null };
  },
  async embed(provider, input, client) {
    const model = input.model.replace(/^models\//, '');
    const taskType = input.purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    if (provider.type === 'vertex_gemini') {
      const data = await client.request(`/v1/projects/${encodeURIComponent(provider.project)}/locations/${encodeURIComponent(provider.location)}/publishers/google/models/${encodeURIComponent(model)}:predict`,
        { instances: input.input.map(content => ({ content, task_type: taskType })) });
      const predictions = Array.isArray(data.predictions) ? data.predictions : [];
      const tokens = predictions.reduce((total, prediction) => total + (Number(prediction.embeddings?.statistics?.token_count) || 0), 0);
      return { vectors: predictions.map(prediction => prediction.embeddings?.values), usage: usage(tokens || undefined) };
    }
    const data = await client.request(`/models/${encodeURIComponent(model)}:batchEmbedContents`,
      { requests: input.input.map(text => ({ model: `models/${model}`, content: { parts: [{ text }] }, taskType })) });
    return { vectors: (Array.isArray(data.embeddings) ? data.embeddings : []).map(embedding => embedding.values), usage: {} };
  },
  async models(provider, client) {
    if (provider.type === 'vertex_gemini') return (provider.allowedModels || []).map(id => ({ id, name: id }));
    const data = await client.request('/models');
    return (Array.isArray(data.models) ? data.models : []).filter(model => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent'))
      .map(model => ({ id: String(model.name || '').replace(/^models\//, ''), name: model.displayName || model.name }));
  }
};
