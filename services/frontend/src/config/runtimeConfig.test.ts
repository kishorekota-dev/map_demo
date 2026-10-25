import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initializeRuntimeConfig } from "./runtimeConfig";

describe("chat runtime timeout budget", () => {
  beforeEach(() => vi.stubGlobal("document", { title: "" }));
  afterEach(() => vi.unstubAllGlobals());

  test.each([
    [undefined, 420000],
    [1000, 1000],
    [420000, 420000],
    [600000, 600000],
    [999, 420000],
    [600001, 420000],
    [1200.5, 420000],
    [null, 420000],
    ["invalid", 420000],
  ])(
    "normalizes configured budget %s to %s milliseconds",
    async (configured, expected) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ chatRequestTimeoutMs: configured }), {
              status: 200,
            }),
          ),
      );
      expect((await initializeRuntimeConfig()).chatRequestTimeoutMs).toBe(
        expected,
      );
    },
  );
});
