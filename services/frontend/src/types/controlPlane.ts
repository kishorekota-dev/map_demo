export type ChannelId = "digital" | "ava" | "ivr";
export type FulfillmentMode = "automated" | "human";

export interface ServicingChannel {
  id: ChannelId;
  name: string;
  enabled: boolean;
  mode: FulfillmentMode;
  queue: string;
  timeoutSeconds: number;
}

export interface ServicingIntent {
  id: string;
  baseIntent?: string;
  name: string;
  description: string;
  enabled: boolean;
  patterns: string[];
  requiredData: string[];
  optionalData: string[];
  tools: string[];
  needsConfirmation: boolean;
  systemPrompt: string;
  userPromptTemplate: string;
  llmProfileId?: string;
  confirmationMessage?: string;
  fieldSchemas?: Record<
    string,
    {
      type: "string" | "number" | "boolean";
      enum?: Array<string | number | boolean>;
      min?: number;
      max?: number;
      minLength?: number;
      maxLength?: number;
    }
  >;
}

export interface ServicingJourney {
  id: string;
  name: string;
  intents: string[];
  channels: string[];
  enabled: boolean;
  fulfillment: FulfillmentMode;
  queue: string;
  slaMinutes: number;
}

export interface ModelProfile {
  id: string;
  name: string;
  providerId: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface ModelConfiguration {
  enabled: boolean;
  profiles: ModelProfile[];
  routing: {
    generation?: string;
    extraction?: string;
    recognition?: string;
  };
}

export interface ServicingConfig {
  prompts: {
    extractionSystem: string;
    extractionInstructions: string;
    recognitionSystem?: string;
    clarificationText?: string;
    handoffText?: string;
    unavailableText?: string;
    dataCollectionText?: string;
  };
  channels: ServicingChannel[];
  journeys: ServicingJourney[];
  queues: Array<{ id: string; name: string }>;
  intents: ServicingIntent[];
  llm?: ModelConfiguration;
  recognition?: {
    strategy: "lexical" | "external" | "llm";
    confidenceThreshold: number;
    ambiguityMargin: number;
    ambiguityAction: "clarify" | "human";
    synonyms: Record<string, string[]>;
  };
  procedures?: ServicingProcedure[];
}

export type GuardrailOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";
type GuardrailBase = { id: string; message?: string; sourceText?: string };
export type ProcedureGuardrail = GuardrailBase &
  (
    | { type: "require_fields"; fields: string[] }
    | { type: "require_confirmation" }
    | {
        type: "escalate_when";
        field: string;
        operator: GuardrailOperator;
        value: string | number | boolean | Array<string | number>;
        action: "handoff" | "block";
      }
    | { type: "prohibited_phrases"; phrases: string[] }
    | { type: "required_disclosure"; text: string }
  );

export interface ServicingProcedure {
  id: string;
  title: string;
  source: string;
  enabled: boolean;
  /** internal: instructions and guardrails only. customer: may also ground customer answers. */
  audience?: "internal" | "customer";
  intents: string[];
  channels: ChannelId[];
  summary?: string;
  steps: Array<{ id: string; instruction: string }>;
  body?: string;
  guardrails?: ProcedureGuardrail[];
}

export interface ProcedureImport {
  procedure: ServicingProcedure;
  suggestions: Array<{ guardrail: ProcedureGuardrail; sourceText: string; note?: string }>;
  warnings: string[];
  errors: string[];
  replaces: boolean;
}

export interface ControlRelease {
  version: number;
  config: ServicingConfig;
  publishedAt: string;
  publishedBy: string;
  note?: string;
}

export type WorkStatus =
  | "queued"
  | "in_progress"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkItem {
  id: string;
  journeyId: string;
  channel: ChannelId;
  reference: string;
  summary: string;
  status: WorkStatus;
  queue: string;
  assignee?: string | null;
  version?: number;
  releaseVersion?: number;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  note?: string;
  history?: Array<{
    timestamp: string;
    actor: string;
    status: WorkStatus;
    note: string;
  }>;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor?: string;
  actorId?: string;
  timestamp?: string;
  at?: string;
  revision?: number;
  details?: Record<string, unknown>;
  note?: string;
  resourceId?: string;
}

export interface ControlPlaneState {
  tenant: { id: string; name: string };
  revision: number;
  draft: ServicingConfig;
  published: ControlRelease;
  releases: ControlRelease[];
  audit: AuditEntry[];
  workItems: WorkItem[];
  permissions: { canEdit: boolean; canPublish: boolean; canOperate: boolean };
  capabilities?: {
    runtimeEnforcementEnabled?: boolean;
    persistence?: string;
    tenancy?: string;
    channels?: Array<{ id: ChannelId; status: string; description: string }>;
    intentCatalog?: Array<{
      id: string;
      allowedTools: string[];
      requiredData: string[];
      confirmationRequired: boolean;
    }>;
    workItemTransitions?: Record<WorkStatus, WorkStatus[]>;
    limitations?: string[];
  };
}

export interface RoutingDecision {
  action: "automated" | "human" | "disabled" | "clarify";
  reason: string;
  version: number | null;
  journeyId?: string;
  queue?: string;
  slaMinutes?: number;
  intent?: string;
  configuredModelProfiles?: Partial<
    Record<
      "generation" | "extraction" | "recognition",
      { profileId: string; providerId: string; model: string }
    >
  >;
  modelProfilesTested?: boolean;
  externalProviderExecuted?: boolean;
  scope?: string;
  procedure?: {
    id: string;
    title: string;
    source: string;
    steps: number;
    guardrails: Array<{ id: string; type: ProcedureGuardrail["type"] }>;
  };
  requiredFields?: string[];
  recognition?: {
    intent: string | null;
    confidence: number;
    ambiguous: boolean;
    candidates: unknown[];
    source: string;
    reason: string;
  };
}
