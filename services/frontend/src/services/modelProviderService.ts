import { authenticatedRequest as request } from "./controlPlaneService";
import type {
  ChannelId,
  RetrievalStrategy,
  ServicingConfig,
} from "@/types/controlPlane";

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
    embeddings?: boolean;
  };
}

export interface RetrievalCase {
  question: string;
  /** null when no procedure should answer the question. */
  expectedProcedureId: string | null;
}

export type StrategyScore =
  | {
      available: true;
      answerable: number;
      unanswerable: number;
      hitAt1: number | null;
      hitAt3: number | null;
      mrr: number | null;
      correctRejections: number | null;
      fallbacks: number;
    }
  | { available: false; reason: string };

export interface RetrievalIndexBuild {
  state: "running" | "succeeded" | "failed";
  version: number;
  startedAt: string;
  startedBy: string;
  finishedAt?: string;
  missingAtStart: number;
  remaining?: number;
  inputTokens: number;
  reason?: string;
}

/** Embedded procedure chunks for a configuration; indexed is null when not semantic. */
export interface RetrievalIndexStatus {
  strategy: RetrievalStrategy;
  embedding: { profileId: string; providerId: string; model: string } | null;
  reason?: "lexical_strategy" | "embedding_route_not_configured";
  durable: boolean;
  building: boolean;
  maxChunks: number;
  totals: { chunks: number; indexed: number | null };
  channels: Array<{
    channel: ChannelId;
    chunks: number;
    indexed: number | null;
    tooLarge: boolean;
  }>;
  procedures: Array<{
    id: string;
    title: string;
    chunks: number;
    indexed: number | null;
  }>;
  build?: RetrievalIndexBuild;
}

export interface RetrievalEvaluation {
  channel: ChannelId;
  minSimilarity: number;
  embedding: { profileId: string; providerId: string; model: string } | null;
  strategies: Record<RetrievalStrategy, StrategyScore>;
  calibration: {
    minSimilarity: number;
    correct: number;
    cases: number;
    basis: string;
  } | null;
  results: Array<{
    question: string;
    expectedProcedureId: string | null;
    strategies: Partial<
      Record<
        RetrievalStrategy,
        { procedures: string[]; mode: string; fallbackReason?: string }
      >
    >;
    similarity?: {
      expected: number | null;
      best: number | null;
      bestProcedureId: string | null;
    };
  }>;
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
  /** Compares lexical, semantic and hybrid procedure retrieval on labelled cases. */
  evaluateRetrieval: (input: {
    config: ServicingConfig;
    cases: RetrievalCase[];
    channel?: ChannelId;
    minSimilarity?: number;
  }) =>
    request<RetrievalEvaluation>(
      "/orchestrator/llm/retrieval/evaluate",
      "POST",
      input,
    ),
  retrievalIndexStatus: (config: ServicingConfig, version?: number) =>
    request<RetrievalIndexStatus>(
      "/orchestrator/llm/retrieval/index/status",
      "POST",
      version ? { config, version } : { config },
    ),
  buildRetrievalIndex: (version: number) =>
    request<RetrievalIndexStatus>(
      "/orchestrator/llm/retrieval/index/build",
      "POST",
      { version },
    ),
};

export default modelProviderService;
