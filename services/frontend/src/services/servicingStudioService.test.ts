import { expect, test, vi } from "vitest";
import { authenticatedRequest } from "./controlPlaneService";
import { operationsApi } from "./servicingStudioService";
import type { Connection } from "@/types/servicingStudio";
vi.mock("./controlPlaneService", () => ({ authenticatedRequest: vi.fn() }));

test("connection settings never submit browser endpoint or credential bindings", async () => {
  const connection: Connection = { id: "reference", revision: 3, name: "Support", kind: "case", enabled: true,
    timeoutMs: 2000, baseUrl: "https://api.example.com", credentialRef: "env:CONNECTOR_SECRET_REFERENCE",
    webhookSecretRef: "env:CONNECTOR_SECRET_REFERENCE", webhookPublicUrl: "https://example.com/api/operations/webhooks/reference" };
  await operationsApi.saveConnection(connection);
  expect(authenticatedRequest).toHaveBeenCalledWith("/operations/connections/reference", "PUT",
    { revision: 3, name: "Support", kind: "case", enabled: true, timeoutMs: 2000 });
});
