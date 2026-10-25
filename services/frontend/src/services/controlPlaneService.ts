import { getRuntimeConfig } from "@/config/runtimeConfig";
import authService from "@/services/authService";
import type {
  ChannelId,
  ControlPlaneState,
  RoutingDecision,
  ServicingConfig,
  WorkStatus,
} from "@/types/controlPlane";

export class ControlPlaneError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: string[] = [],
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

let refreshPromise: Promise<boolean> | null = null;

export async function authenticatedRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  retried = false,
): Promise<T> {
  const token = authService.getAccessToken();
  const response = await fetch(
    `${getRuntimeConfig().apiBaseUrl.replace(/\/$/, "")}${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );

  if (
    response.status === 401 &&
    !retried &&
    (authService.getRefreshToken() || authService.hasEnterpriseSession())
  ) {
    if (!refreshPromise) {
      refreshPromise = authService
        .refreshToken()
        .then((tokens) => tokens !== null)
        .catch(() => false)
        .finally(() => {
          refreshPromise = null;
        });
    }
    if (await refreshPromise)
      return authenticatedRequest<T>(path, method, body, true);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    if (response.ok)
      throw new ControlPlaneError(
        "The API returned an invalid response. Check the gateway route and service availability.",
        502,
      );
    payload = {};
  }
  if (
    response.ok &&
    (!payload || typeof payload !== "object" || Array.isArray(payload))
  ) {
    throw new ControlPlaneError(
      "The API returned an invalid response object.",
      502,
    );
  }
  if (!response.ok) {
    const structuredError =
      payload.error && typeof payload.error === "object"
        ? (payload.error as { message?: unknown })
        : null;
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof structuredError?.message === "string"
          ? structuredError.message
          : typeof payload.message === "string"
            ? payload.message
            : `Request failed (${response.status}).`;
    const details = Array.isArray(payload.errors)
      ? payload.errors.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    throw new ControlPlaneError(message, response.status, details);
  }
  return payload as T;
}

const request = <T>(path: string, method = "GET", body?: unknown) =>
  authenticatedRequest<T>(`/control-plane${path}`, method, body);

const controlPlaneService = {
  state: () => request<ControlPlaneState>("/state"),
  saveDraft: (revision: number, config: ServicingConfig) =>
    request<ControlPlaneState>("/draft", "PUT", { revision, config }),
  validate: (config: ServicingConfig) =>
    request<{ valid: boolean; errors: string[] }>("/validate", "POST", {
      config,
    }),
  publish: (revision: number, note: string) =>
    request<ControlPlaneState>("/publish", "POST", { revision, note }),
  rollback: (revision: number, version: number, note: string) =>
    request<ControlPlaneState>("/rollback", "POST", {
      revision,
      version,
      note,
    }),
  simulate: (
    channel: ChannelId,
    intent: string,
    source: "draft" | "published",
  ) =>
    request<RoutingDecision>("/simulate", "POST", { channel, intent, source }),
  previewUtterance: (
    channel: ChannelId,
    utterance: string,
    source: "draft" | "published",
  ) =>
    request<RoutingDecision>("/simulate", "POST", {
      channel,
      utterance,
      source,
    }),
  createWorkItem: (input: {
    revision: number;
    journeyId: string;
    channel: ChannelId;
    reference: string;
    summary: string;
    idempotencyKey: string;
  }) => request<ControlPlaneState>("/work-items", "POST", input),
  updateWorkItem: (
    id: string,
    input: {
      revision: number;
      status: WorkStatus;
      assignee?: string | null;
      note?: string;
    },
  ) =>
    request<ControlPlaneState>(
      `/work-items/${encodeURIComponent(id)}`,
      "PATCH",
      input,
    ),
};

export default controlPlaneService;
