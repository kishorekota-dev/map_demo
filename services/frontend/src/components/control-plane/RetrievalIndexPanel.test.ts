import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import modelProviderService, {
  type RetrievalIndexStatus,
} from "@/services/modelProviderService";
import type { ServicingConfig } from "@/types/controlPlane";
import { indexState } from "./RetrievalIndexPanel";

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

const status = (
  overrides: Partial<RetrievalIndexStatus> = {},
): RetrievalIndexStatus => ({
  strategy: "hybrid",
  embedding: {
    profileId: "embed",
    providerId: "mac-qwen",
    model: "nomic-embed-text",
  },
  durable: true,
  building: false,
  maxChunks: 10000,
  totals: { chunks: 12, indexed: 12 },
  channels: [{ channel: "digital", chunks: 12, indexed: 12, tooLarge: false }],
  procedures: [],
  ...overrides,
});

describe("index state wording", () => {
  test.each([
    [status(), "Ready", true],
    [
      status({ totals: { chunks: 12, indexed: 4 } }),
      "4 of 12 chunks indexed",
      false,
    ],
    [
      status({ totals: { chunks: 12, indexed: 4 }, building: true }),
      "Building: 4 of 12",
      false,
    ],
    [
      status({
        strategy: "lexical",
        embedding: null,
        reason: "lexical_strategy",
        totals: { chunks: 12, indexed: null },
      }),
      "Lexical: no index needed",
      true,
    ],
    [
      status({
        embedding: null,
        reason: "embedding_route_not_configured",
        totals: { chunks: 12, indexed: null },
      }),
      "No embedding route",
      false,
    ],
    [
      status({ totals: { chunks: 0, indexed: 0 } }),
      "No customer procedures",
      false,
    ],
    [
      status({
        channels: [
          { channel: "digital", chunks: 10001, indexed: 0, tooLarge: true },
        ],
      }),
      "Too large for semantic retrieval",
      false,
    ],
  ])("%#", (value, label, good) => {
    expect(indexState(value)).toMatchObject({ label, good });
  });
});

describe("index client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify(status()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const config = {
    prompts: { extractionSystem: "s", extractionInstructions: "i" },
    channels: [],
    journeys: [],
    queues: [],
    intents: [],
  } satisfies ServicingConfig;

  test("status posts the configuration, and the version only when known", async () => {
    await modelProviderService.retrievalIndexStatus(config);
    await modelProviderService.retrievalIndexStatus(config, 7);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://gateway.example/api/orchestrator/llm/retrieval/index/status",
      "https://gateway.example/api/orchestrator/llm/retrieval/index/status",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      config,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      config,
      version: 7,
    });
  });

  test("a build names only the published version", async () => {
    await modelProviderService.buildRetrievalIndex(7);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://gateway.example/api/orchestrator/llm/retrieval/index/build",
    );
    expect(JSON.parse(String(init?.body))).toEqual({ version: 7 });
  });
});
