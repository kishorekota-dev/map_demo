import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import controlPlaneService from "@/services/controlPlaneService";
import { describeGuardrail } from "./ProcedureConsole";

vi.mock("@/services/authService", () => ({
  default: {
    getAccessToken: vi.fn(() => "signed-access-token"),
    getRefreshToken: vi.fn(() => null),
    hasEnterpriseSession: vi.fn(() => false),
    refreshToken: vi.fn(),
  },
}));
vi.mock("@/config/runtimeConfig", () => ({
  getRuntimeConfig: () => ({ apiBaseUrl: "https://gateway.example/api" }),
}));

describe("procedure guardrail wording", () => {
  test.each([
    [{ id: "a", type: "require_fields", fields: ["replacementAddress", "reason"] }, "Collect before acting: replacementAddress, reason"],
    [{ id: "b", type: "require_confirmation" }, "Ask the customer to confirm before acting"],
    [{ id: "c", type: "escalate_when", field: "amount", operator: "gt", value: 5000, action: "handoff" }, "Hand off to a specialist when amount is over 5000"],
    [{ id: "d", type: "escalate_when", field: "reason", operator: "in", value: ["lost", "stolen"], action: "block" }, "Stop the request when reason is one of lost, stolen"],
    [{ id: "e", type: "prohibited_phrases", phrases: ["no fee"] }, "Never say: “no fee”"],
    [{ id: "f", type: "required_disclosure", text: "Fees may apply." }, "Always include: Fees may apply."],
  ] as const)("%j", (guardrail, expected) => {
    expect(describeGuardrail(guardrail as Parameters<typeof describeGuardrail>[0])).toBe(expected);
  });
});

describe("procedure import client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  test("posts the document to the Studio parse route with the operator token", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ procedure: { id: "p" }, suggestions: [], warnings: [], errors: [], replaces: false }), { status: 200 }),
    );
    const document = { source: "SOP-1", content: "1. Confirm the address with the customer.", intents: ["card_replacement"], audience: "internal" as const };
    await expect(controlPlaneService.parseProcedure(document)).resolves.toMatchObject({ procedure: { id: "p" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gateway.example/api/control-plane/studio/procedures/parse");
    expect(init).toMatchObject({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer signed-access-token" }) });
    expect(JSON.parse(String(init?.body))).toEqual({ document });
  });
});
