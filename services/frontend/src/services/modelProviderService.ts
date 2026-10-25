import { authenticatedRequest as request } from "./controlPlaneService";

export interface ModelProvider {
  id: string;
  type: string;
  enabled: boolean;
  configured: boolean;
  allowedModels?: string[];
  capabilities: {
    json: boolean;
    modelDiscovery: boolean;
    temperature?: boolean;
  };
}

export interface ProviderModel {
  id: string;
  name?: string;
}

export interface ModelTestResult {
  ok: boolean;
  providerId: string;
  model: string;
  latencyMs?: number;
  text?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  error?: { code?: string; message?: string } | string;
}

const modelProviderService = {
  providers: () =>
    request<{ providers: ModelProvider[] }>("/orchestrator/llm/providers"),
  models: (id: string) =>
    request<{ providerId: string; models: ProviderModel[] }>(
      `/orchestrator/llm/providers/${encodeURIComponent(id)}/models`,
    ),
  test: (providerId: string, model: string) =>
    request<ModelTestResult>("/orchestrator/llm/test", "POST", {
      providerId,
      model,
    }),
};

export default modelProviderService;
