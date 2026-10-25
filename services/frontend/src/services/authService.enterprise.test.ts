import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import authService from "./authService";

vi.mock("@/config/runtimeConfig", () => ({
  getRuntimeConfig: () => ({
    tenantId: "dedicated-test",
    apiBaseUrl: "https://gateway.example/api",
    authBaseUrl: "https://gateway.example/api/banking/v1",
  }),
}));
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
const fetchMock = vi.fn<typeof fetch>();
const key = (name: string) => `enterprise-chat:dedicated-test:${name}`;
const token = () =>
  `header.${btoa(JSON.stringify({ userId: "enterprise-1", exp: Math.floor(Date.now() / 1000) + 600 }))}.signature`;
const response = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("enterprise identity session handoff", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());
  test("consumes a credentialed server session and removes an unrelated local refresh token", async () => {
    localStorage.setItem(key("refresh_token"), "previous-customer-refresh");
    const accessToken = token();
    fetchMock.mockResolvedValue(
      response(200, {
        accessToken,
        user: {
          userId: "enterprise-1",
          username: "Operator",
          roles: ["control_plane_operator"],
        },
      }),
    );
    await authService.completeEnterpriseSignIn();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/api/identity/session",
      { credentials: "include", cache: "no-store" },
    );
    expect(authService.getAccessToken()).toBe(accessToken);
    expect(authService.getRefreshToken()).toBeNull();
    expect(authService.hasEnterpriseSession()).toBe(true);
    expect(authService.getUserProfile()?.userId).toBe("enterprise-1");
  });
  test("never stores a session from a denied callback or an incomplete response", async () => {
    fetchMock.mockResolvedValue(
      response(403, {
        error: "Identity is not mapped",
        user: { userId: "untrusted" },
      }),
    );
    await expect(authService.completeEnterpriseSignIn()).rejects.toThrow(
      "Identity is not mapped",
    );
    expect(authService.getAccessToken()).toBeNull();
    expect(authService.hasEnterpriseSession()).toBe(false);
  });
  test("refreshes an enterprise token through the HttpOnly session rather than a banking refresh token", async () => {
    localStorage.setItem(key("enterprise_session"), "true");
    fetchMock.mockResolvedValue(
      response(200, {
        accessToken: token(),
        user: { userId: "enterprise-1", username: "Operator", roles: [] },
      }),
    );
    const refreshed = await authService.refreshToken();
    expect(refreshed?.accessToken).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://gateway.example/api/identity/session",
    );
  });
  test("enterprise logout clears local credentials and requests server cookie invalidation", async () => {
    localStorage.setItem(key("enterprise_session"), "true");
    localStorage.setItem(key("access_token"), token());
    fetchMock.mockResolvedValue(response(200, { success: true }));
    authService.logout();
    expect(authService.getAccessToken()).toBeNull();
    expect(authService.hasEnterpriseSession()).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/api/identity/logout",
      { method: "POST", credentials: "include" },
    );
  });
});
