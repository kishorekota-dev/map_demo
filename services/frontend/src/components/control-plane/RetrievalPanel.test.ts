import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import modelProviderService from "@/services/modelProviderService";
import type { ServicingConfig } from "@/types/controlPlane";
import { parseCases } from "./RetrievalPanel";

const defaultCaseConfig = {
  prompts: { extractionSystem: "s", extractionInstructions: "i" },
  channels: [],
  journeys: [],
  queues: [],
  intents: [],
  retrieval: { strategy: "hybrid", minSimilarity: 0.5 },
} satisfies ServicingConfig;

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

describe("retrieval case parsing", () => {
  test("reads question | procedure lines and no-match markers", () => {
    expect(
      parseCases(
        "Going overseas, should I tell you? | travel_notice\n\nWhat is your mortgage rate? | none\nA | b | travel_notice",
        ["travel_notice"],
      ),
    ).toEqual({
      cases: [
        { question: "Going overseas, should I tell you?", expectedProcedureId: "travel_notice" },
        { question: "What is your mortgage rate?", expectedProcedureId: null },
        { question: "A | b", expectedProcedureId: "travel_notice" },
      ],
      errors: [],
    });
  });

  test("reports malformed lines and unknown procedures", () => {
    expect(parseCases("no separator\n | travel_notice\nq | missing_sop", ["travel_notice"]).errors).toEqual([
      'Line 1: use "question | procedure_id" or "question | none".',
      'Line 2: use "question | procedure_id" or "question | none".',
      'Line 3: "missing_sop" is not a procedure in this draft.',
    ]);
  });
});

describe("retrieval evaluation client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  test("posts the draft and cases to the orchestrator evaluation route", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ strategies: {}, results: [] }), { status: 200 }));
    const input = { config: defaultCaseConfig, cases: [{ question: "q", expectedProcedureId: null }], channel: "digital" as const };
    await modelProviderService.evaluateRetrieval(input);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gateway.example/api/orchestrator/llm/retrieval/evaluate");
    expect(init).toMatchObject({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer signed-access-token" }) });
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });
});
