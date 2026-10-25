import { authenticatedRequest as request } from "./controlPlaneService";
import type { ModelProfile } from "@/types/controlPlane";

export type QualityTask = "generation" | "extraction" | "recognition";
export type QualityCategory = "happy_path" | "negative" | "prompt_injection";
export type QualityAssertion =
  | { type: "exact" | "contains" | "not_contains"; value: string }
  | { type: "json_valid" }
  | { type: "json_required"; paths: string[] }
  | {
      type: "json_equals";
      path: string;
      value: string | number | boolean | null;
    }
  | { type: "refusal"; phrases: string[] };
export interface QualityCase {
  id: string;
  category: QualityCategory;
  input: string;
  variables?: { context?: string; userId?: string };
  assertions: QualityAssertion[];
}
export interface QualitySuite {
  id: string;
  name: string;
  description?: string;
  dataPolicy: "synthetic_only";
  task: QualityTask;
  intentId?: string;
  cases: QualityCase[];
}
export interface QualitySuiteRecord extends QualitySuite {
  version: number;
  suiteFingerprint: string;
  updatedAt: string;
  updatedBy: string;
}
export interface QualityPolicy {
  requirements: Array<{ suiteId: string; profileId: string }>;
}
export interface QualitySummary {
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number | null;
  medianLatencyMs: number | null;
  maxLatencyMs: number | null;
  usage: Record<string, number | null>;
  usageCoverage: string;
  byCategory: Record<
    string,
    { totalCases: number; completedCases: number; passedCases: number }
  >;
}
export interface QualityResult {
  id: string;
  category: QualityCategory;
  status: string;
  passed?: boolean;
  assertions?: Array<QualityAssertion & { passed: boolean }>;
  output?: string;
  outputTruncated?: boolean;
  error?: string;
  latencyMs: number;
  usage: Record<string, number>;
  callId?: string | null;
  promptFingerprint?: string;
}
export interface QualityRun {
  id: string;
  suiteId: string;
  source: "draft" | "published";
  version: number | null;
  profileId: string;
  profile: ModelProfile;
  configFingerprint: string;
  suiteFingerprint: string;
  profileFingerprint: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted";
  passed: boolean;
  createdAt: string;
  createdBy: string;
  evidencePending?: boolean;
  usageMayBeIncomplete?: boolean;
  summary: QualitySummary;
  results?: QualityResult[];
  suite?: QualitySuite;
  limitations?: string[];
}
interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface QualityState {
  revision: number;
  configFingerprint: string;
  policy: QualityPolicy;
  suites: Page<QualitySuiteRecord>;
  runs: Page<QualityRun>;
  limits: {
    maxCases: number;
    maxConcurrency: number;
    maxDurationMs: number;
    maxOutputTokens: number;
  };
  permissions: { canView: boolean; canEdit: boolean; canPublish: boolean };
  scope: string;
  limitations: string[];
}
export interface QualityComparison {
  comparable: boolean;
  warnings: string[];
  left: QualityRun;
  right: QualityRun;
  passRateDelta: number | null;
}
export function suiteDefinition(record: QualitySuiteRecord): QualitySuite {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    dataPolicy: record.dataPolicy,
    task: record.task,
    ...(record.intentId ? { intentId: record.intentId } : {}),
    cases: record.cases,
  };
}
export const qualityApi = {
  state: () => request<QualityState>("/quality/state"),
  suite: (revision: number, suite: QualitySuite) =>
    request<{ revision: number; suite: QualitySuiteRecord }>(
      `/quality/suites/${encodeURIComponent(suite.id)}`,
      "PUT",
      { revision, suite },
    ),
  run: (body: {
    suiteId: string;
    source: "draft" | "published";
    version?: number;
    profileId: string;
    budget: {
      concurrency: number;
      maxDurationMs: number;
      maxOutputTokens: number;
    };
  }) => request<QualityRun>("/quality/runs", "POST", body),
  detail: (id: string) =>
    request<QualityRun>(`/quality/runs/${encodeURIComponent(id)}`),
  cancel: (id: string) =>
    request<QualityRun>(
      `/quality/runs/${encodeURIComponent(id)}/cancel`,
      "POST",
      {},
    ),
  policy: (revision: number, policy: QualityPolicy) =>
    request<{ revision: number; policy: QualityPolicy }>(
      "/quality/policy",
      "PUT",
      { revision, policy },
    ),
  compare: (left: string, right: string) =>
    request<QualityComparison>(
      `/quality/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`,
    ),
};
