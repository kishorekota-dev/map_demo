import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import authService from "./authService";
import controlPlaneService, {
  authenticatedRequest,
  ControlPlaneError,
} from "./controlPlaneService";
import type { ServicingConfig } from "@/types/controlPlane";

vi.mock("./authService", () => ({
  default: {
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    hasEnterpriseSession: vi.fn(() => false),
    refreshToken: vi.fn(),
  },
}));
vi.mock("@/config/runtimeConfig", () => ({
  getRuntimeConfig: () => ({ apiBaseUrl: "https://gateway.example/api/" }),
}));

const fetchMock = vi.fn<typeof fetch>();
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("control-plane client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(authService.getAccessToken).mockReturnValue(
      "signed-access-token",
    );
    vi.mocked(authService.getRefreshToken).mockReturnValue(null);
    vi.mocked(authService.refreshToken).mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  test("does not treat a missing API route returning the frontend HTML as a successful action", async () => {
    fetchMock.mockResolvedValue(
      new Response("<!doctype html><html>App</html>", { status: 200 }),
    );
    await expect(controlPlaneService.state()).rejects.toMatchObject({
      status: 502,
    });
  });

  test("shows the sanitized provider failure when model discovery returns a structured error", async () => {
    fetchMock.mockResolvedValue(
      response(503, {
        error: {
          code: "LLM_PROVIDER_UNAVAILABLE",
          message: "The configured model provider is unavailable.",
        },
      }),
    );
    await expect(
      authenticatedRequest("/orchestrator/llm/providers/mac-qwen/models"),
    ).rejects.toMatchObject({
      status: 503,
      message: "The configured model provider is unavailable.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("uses configured gateway and authenticated access, without client-selected tenant or roles", async () => {
    fetchMock.mockResolvedValue(response(200, { revision: 4 }));
    await expect(controlPlaneService.state()).resolves.toEqual({ revision: 4 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/api/control-plane/state",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer signed-access-token",
        },
      },
    );
  });

  test("preserves conflict status and does not replay a stale draft write", async () => {
    fetchMock.mockResolvedValue(
      response(409, {
        error: "Revision conflict",
        errors: ["Reload the current revision."],
      }),
    );
    const config = {
      channels: [],
      intents: [],
      journeys: [],
      queues: [],
      prompts: {
        extractionSystem: "Extract structured entities.",
        extractionInstructions: "Use the declared schema.",
      },
    } satisfies ServicingConfig;
    const result = controlPlaneService.saveDraft(3, config);
    await expect(result).rejects.toMatchObject({
      status: 409,
      message: "Revision conflict",
      details: ["Reload the current revision."],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      revision: 3,
      config,
    });
  });

  test("does not retry a fulfillment request after an ambiguous network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network failure"));
    await expect(
      controlPlaneService.createWorkItem({
        revision: 4,
        channel: "digital",
        journeyId: "cards",
        reference: "case-1",
        summary: "Review replacement",
        idempotencyKey: "request-1",
      }),
    ).rejects.toThrow("Network failure");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("refreshes an expired access token once and reuses the identical mutation body", async () => {
    vi.mocked(authService.getRefreshToken).mockReturnValue("refresh-token");
    vi.mocked(authService.refreshToken).mockImplementation(async () => {
      vi.mocked(authService.getAccessToken).mockReturnValue(
        "renewed-access-token",
      );
      return {
        accessToken: "renewed-access-token",
        refreshToken: "refresh-token",
      };
    });
    fetchMock
      .mockResolvedValueOnce(response(401, { error: "Expired" }))
      .mockResolvedValueOnce(response(200, { revision: 5 }));
    await expect(
      controlPlaneService.publish(4, "Reviewed intent changes"),
    ).resolves.toEqual({ revision: 5 });
    expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: "Bearer renewed-access-token",
    });
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      fetchMock.mock.calls[0][1]?.body,
    );
  });

  test("reports denied authorization without refreshing or claiming success", async () => {
    fetchMock.mockResolvedValue(
      response(403, { error: "Control-plane role required" }),
    );
    await expect(controlPlaneService.state()).rejects.toBeInstanceOf(
      ControlPlaneError,
    );
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });

  test("submits explicitly selected preview source", async () => {
    fetchMock.mockResolvedValue(
      response(200, {
        action: "disabled",
        version: 2,
        reason: "IVR is disabled",
      }),
    );
    await controlPlaneService.simulate("ivr", "balance_inquiry", "published");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      channel: "ivr",
      intent: "balance_inquiry",
      source: "published",
    });
  });
});
