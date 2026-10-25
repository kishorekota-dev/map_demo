import type { ChannelId, ControlPlaneState } from "./controlPlane";

export type ConsolePermissions = ControlPlaneState["permissions"];
export interface Connection {
  id: string;
  revision?: number;
  name: string;
  kind: "case" | "voice" | "knowledge";
  baseUrl: string;
  credentialRef: string;
  webhookSecretRef: string;
  enabled: boolean;
  timeoutMs: number;
  lastTest?: { ok: boolean; checkedAt: string; message: string };
}
export interface OperationsStatus {
  storage: string;
  workersEnabled: boolean;
  identity: { configured: boolean; issuer?: string };
  retentionDays: number;
  connectors: number;
  metrics: {
    cases: number;
    openCases: number;
    failedCases: number;
    events: number;
  };
  permissions?: ConsolePermissions;
}
export interface ExecutionCase {
  id: string;
  sessionId: string;
  channel: string;
  queue: string;
  summary: string;
  status:
    | "queued"
    | "in_progress"
    | "completed"
    | "failed"
    | "reconciliation_required";
  externalId?: string;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError?: string;
}
export interface ExecutionEvent {
  id: string;
  sessionId?: string;
  channel?: string;
  intent?: string;
  type?: string;
  eventType?: string;
  createdAt?: string;
  timestamp?: string;
  outcome?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface IdentityMapping {
  id: string;
  revision?: number;
  issuer: string;
  subject: string;
  userId: string;
  roles: string[];
  enabled: boolean;
}
export interface EvaluationStep {
  utterance: string;
  channel?: ChannelId;
  expectedIntent: string | null;
  expectedAction?: string;
  expectedTools?: string[];
  requiredFields?: string[];
  continueIntent?: boolean;
}
export interface EvaluationCase extends EvaluationStep {
  id: string;
  name?: string;
  channel: ChannelId;
  steps?: EvaluationStep[];
}
export interface EvaluationSuite {
  id: string;
  name: string;
  description: string;
  cases: EvaluationCase[];
}
export interface EvaluationRun {
  id: string;
  suiteId: string;
  fingerprint: string;
  source: string;
  version?: number;
  passed: boolean;
  passedCases: number;
  totalCases: number;
  results?: Array<{
    id: string;
    name: string;
    passed: boolean;
    steps: Array<{
      utterance: string;
      actual: Record<string, unknown>;
      passed: boolean;
      failures: string[];
    }>;
  }>;
  createdAt: string;
  createdBy: string;
  scope: string;
}
export interface EnvironmentRelease {
  id: "development" | "staging" | "production";
  stableVersion: number;
  candidateVersion: number | null;
  canaryPercent: number;
  updatedAt?: string;
  updatedBy?: string;
}
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  allowedRoles: string[];
  expiresAt: string | null;
  status: "draft" | "published" | "archived";
  version?: number;
  publishedVersion?: number | null;
  updatedAt?: string;
  versions?: Array<Record<string, unknown>>;
}
export interface StudioGovernance {
  requireEvaluationForPublish: boolean;
  requireIndependentApproval: boolean;
  requiredSuiteIds: string[];
}
export interface StudioState {
  revision: number;
  suites: EvaluationSuite[];
  evaluations: EvaluationRun[];
  environments: EnvironmentRelease[];
  approvals: Array<Record<string, unknown>>;
  knowledge: KnowledgeDocument[];
  governance: StudioGovernance;
  configDigest: string;
  promotions?: Array<Record<string, unknown>>;
  pagination?: Record<string, { total: number; limit: number; offset: number }>;
  rolloutPolicy?: {
    enabled: boolean;
    minSamples: number;
    maxFailureRate: number;
    windowMinutes: number;
  };
}
export interface Analytics {
  windowDays: number;
  items: Array<{
    intent: string;
    channel: string;
    outcome: string;
    count: number;
    averageDurationMs: number | null;
  }>;
}
export interface FinancialOperation {
  operationId: string;
  sessionId: string;
  tool: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolution?: Record<string, unknown>;
}
