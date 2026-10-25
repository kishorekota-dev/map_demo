import { authenticatedRequest as request } from "./controlPlaneService";
import type {
  Analytics,
  Connection,
  FinancialOperation,
  OperationsStatus,
  ExecutionCase,
  ExecutionEvent,
  IdentityMapping,
  StudioState,
  EvaluationSuite,
  EvaluationRun,
  StudioGovernance,
  KnowledgeDocument,
} from "@/types/servicingStudio";

const studio = "/control-plane/studio";
const operations = "/operations";
export const studioApi = {
  state: () => request<StudioState>(`${studio}/state`),
  evaluation: (id: string) =>
    request<EvaluationRun>(`${studio}/evaluations/${encodeURIComponent(id)}`),
  records: <T>(
    kind: "suites" | "evaluations" | "knowledge" | "approvals" | "promotions",
    offset = 0,
  ) =>
    request<{ items: T[]; total: number; limit: number; offset: number }>(
      `${studio}/${kind}?limit=50&offset=${offset}`,
    ),
  knowledgeVersions: (id: string, offset = 0) =>
    request<{
      items: KnowledgeDocument[];
      total: number;
      offset: number;
      limit: number;
    }>(
      `${studio}/knowledge/${encodeURIComponent(id)}/versions?limit=25&offset=${offset}`,
    ),
  saveSuite: (revision: number, suite: EvaluationSuite) =>
    request<StudioState>(
      `${studio}/suites/${encodeURIComponent(suite.id)}`,
      "PUT",
      { revision, suite },
    ),
  evaluate: (
    revision: number,
    suiteId: string,
    source: "draft" | "published",
  ) =>
    request<StudioState>(`${studio}/evaluations`, "POST", {
      revision,
      suiteId,
      source,
    }),
  governance: (revision: number, governance: StudioGovernance) =>
    request<StudioState>(`${studio}/governance`, "PUT", {
      revision,
      governance,
    }),
  rolloutPolicy: (
    revision: number,
    policy: NonNullable<StudioState["rolloutPolicy"]>,
  ) =>
    request<StudioState>(`${studio}/rollout-policy`, "PUT", {
      revision,
      policy,
    }),
  approve: (revision: number, note: string) =>
    request<StudioState>(`${studio}/approvals`, "POST", { revision, note }),
  promote: (
    revision: number,
    environment: string,
    version: number,
    note: string,
    canaryPercent: number,
  ) =>
    request<StudioState>(`${studio}/promote`, "POST", {
      revision,
      environment,
      version,
      note,
      canaryPercent,
    }),
  saveKnowledge: (revision: number, document: KnowledgeDocument) =>
    request<StudioState>(
      `${studio}/knowledge/${encodeURIComponent(document.id)}`,
      "PUT",
      { revision, document },
    ),
  importKnowledge: (revision: number, documents: KnowledgeDocument[]) =>
    request<StudioState>(`${studio}/knowledge/import`, "POST", {
      revision,
      documents,
    }),
  validateKnowledge: (documents: KnowledgeDocument[]) =>
    request<{
      valid: boolean;
      results: Array<{ id: string | null; valid: boolean; errors: string[] }>;
    }>(`${studio}/knowledge/validate`, "POST", { documents }),
  searchKnowledge: (query: string) =>
    request<Record<string, unknown>>(
      "/control-plane/runtime/knowledge/search",
      "POST",
      { query, limit: 5 },
    ),
};
export const operationsApi = {
  status: () => request<OperationsStatus>(`${operations}/status`),
  connections: (offset = 0) =>
    request<{ items: Connection[]; total: number }>(
      `${operations}/connections?limit=50&offset=${offset}`,
    ),
  connectorCatalog: () =>
    request<{
      items: Array<
        Pick<
          Connection,
          | "id"
          | "name"
          | "kind"
          | "baseUrl"
          | "credentialRef"
          | "webhookSecretRef"
          | "webhookPublicUrl"
        >
      >;
    }>(`${operations}/connections/catalog`),
  saveConnection: (connection: Connection) =>
    request<Connection>(
      `${operations}/connections/${encodeURIComponent(connection.id)}`,
      "PUT",
      {
        name: connection.name,
        kind: connection.kind,
        enabled: connection.enabled,
        timeoutMs: connection.timeoutMs,
        ...(connection.revision !== undefined
          ? { revision: connection.revision }
          : {}),
      },
    ),
  testConnection: (id: string) =>
    request<{ ok: boolean; checkedAt: string; message: string }>(
      `${operations}/connections/${encodeURIComponent(id)}/test`,
      "POST",
      {},
    ),
  syncConnection: (id: string, revision: number) =>
    request<StudioState>(
      `${operations}/connections/${encodeURIComponent(id)}/sync`,
      "POST",
      { revision },
    ),
  cases: (offset = 0) =>
    request<{ items: ExecutionCase[]; total: number }>(
      `${operations}/cases?limit=25&offset=${offset}`,
    ),
  reconcile: (
    id: string,
    outcome: "completed" | "retry" | "failed",
    note: string,
    externalId?: string,
  ) =>
    request<Record<string, unknown>>(
      `${operations}/cases/${encodeURIComponent(id)}/reconcile`,
      "POST",
      { outcome, note, ...(externalId ? { externalId } : {}) },
    ),
  events: (sessionId = "", offset = 0) =>
    request<{ items: ExecutionEvent[]; total: number }>(
      `${operations}/events?limit=25&offset=${offset}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ""}`,
    ),
  analytics: () => request<Analytics>(`${operations}/analytics`),
  context: (sessionId: string) =>
    request<Record<string, unknown>>(
      `/orchestrator/session/${encodeURIComponent(sessionId)}/context`,
    ),
  financialOperations: () =>
    request<{ operations: FinancialOperation[] }>(
      "/orchestrator/operations?status=reconciliation_required",
    ),
  reconcileFinancial: (
    operationId: string,
    outcome: "completed" | "failed",
    reference: string,
    note: string,
  ) =>
    request<{ operation: FinancialOperation }>(
      `/orchestrator/operations/${encodeURIComponent(operationId)}/reconcile`,
      "POST",
      { outcome, reference, note },
    ),
  mappings: (offset = 0) =>
    request<{ items: IdentityMapping[]; total: number }>(
      `${operations}/identity/mappings?limit=50&offset=${offset}`,
    ),
  saveMapping: (mapping: IdentityMapping) =>
    request<IdentityMapping>(
      `${operations}/identity/mappings/${encodeURIComponent(mapping.id)}`,
      "PUT",
      mapping,
    ),
  retention: (days: number, dryRun: boolean) =>
    request<Record<string, unknown>>(
      `${operations}/maintenance/retention`,
      "POST",
      { days, dryRun },
    ),
  exportAudit: (after = 0) =>
    request<Record<string, unknown> & { nextAfter: number | null }>(
      `${operations}/audit/export?after=${after}`,
    ),
};
