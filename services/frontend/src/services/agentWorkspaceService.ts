import { authenticatedRequest as request } from "./controlPlaneService";

export type HandlingStatus =
  | "unclaimed"
  | "in_progress"
  | "waiting"
  | "resolved";
export type AgentDisposition =
  | "information_provided"
  | "follow_up_required"
  | "escalated"
  | "service_completed"
  | "unable_to_complete";
export interface AgentCitation {
  id: string;
  version: number;
  title?: string;
}
export interface AgentHistory {
  id: string;
  timestamp: string;
  action: string;
  status: HandlingStatus;
  disposition: AgentDisposition | null;
  actor: string;
  note: string;
  citations: AgentCitation[];
  evidenceId: string;
}
export interface AgentCase {
  id: string;
  caseRevision: number;
  sessionId: string;
  channel: string;
  reference: string;
  summary: string;
  queue: string;
  journeyId: string;
  releaseVersion: number;
  executionStatus: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
  work: {
    revision: number;
    status: HandlingStatus;
    disposition: AgentDisposition | null;
    assigned: boolean;
    assignee: string | null;
    mine: boolean;
    updatedAt: string | null;
    history?: AgentHistory[];
  };
  actions: {
    canClaim: boolean;
    canEdit: boolean;
    canRelease: boolean;
    canResolve: boolean;
  };
}
export interface AgentQueueSummary {
  queue: string;
  total: number;
  unassigned: number;
  waiting: number;
  uncertain: number;
  overdue: number;
}
export interface AgentCaseList {
  items: AgentCase[];
  total: number;
  limit: number;
  offset: number;
  queues: string[];
  queueSummary: AgentQueueSummary[];
  scope: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canPublish: boolean;
    canOperate: boolean;
  };
}
export interface AgentCaseDetail {
  item: AgentCase;
  journey: {
    id: string;
    name: string;
    fulfillment: string;
    slaMinutes: number;
    releaseVersion: number;
  } | null;
  nextSteps: Array<{ id: string; title: string; detail: string }>;
  evidence: Array<{
    id: string;
    sequence: number;
    type: string;
    timestamp: string;
    outcome: string | null;
    status: string | null;
  }>;
  contextScope: string;
}
export interface AgentKnowledge {
  matches: Array<{
    id: string;
    title: string;
    version: number;
    content: string;
    truncated: boolean;
    source: string;
    sourceUrl: string | null;
  }>;
  scope: string;
}
export interface AgentFilters {
  queue?: string;
  channel?: string;
  status?: string;
  assignment?: string;
  overdue?: string;
  executionStatus?: string;
  offset?: number;
}
export interface AgentWorkInput {
  revision: number;
  caseRevision: number;
  note: string;
  status: Exclude<HandlingStatus, "unclaimed">;
  disposition: AgentDisposition;
  citations: Array<{ id: string; version: number }>;
}
const base = "/operations/agent/cases";
const casePath = (id: string) => `${base}/${encodeURIComponent(id)}`;
export const agentWorkspaceApi = {
  list: (filters: AgentFilters = {}) => {
    const query = new URLSearchParams({ limit: "25" });
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<AgentCaseList>(`${base}?${query}`);
  },
  detail: (id: string) => request<AgentCaseDetail>(casePath(id)),
  knowledge: (id: string, query: string) =>
    request<AgentKnowledge>(
      `${casePath(id)}/knowledge?${new URLSearchParams({ query })}`,
    ),
  claim: (item: AgentCase, note: string) =>
    request<{ item: AgentCase }>(`${casePath(item.id)}/claim`, "POST", {
      revision: item.work.revision,
      caseRevision: item.caseRevision,
      note,
    }),
  release: (item: AgentCase, note: string) =>
    request<{ item: AgentCase }>(`${casePath(item.id)}/release`, "POST", {
      revision: item.work.revision,
      caseRevision: item.caseRevision,
      note,
    }),
  update: (id: string, input: AgentWorkInput) =>
    request<{ item: AgentCase }>(`${casePath(id)}/work`, "PATCH", input),
};
