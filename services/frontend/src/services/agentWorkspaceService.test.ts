import { beforeEach, expect, test, vi } from "vitest";
import { authenticatedRequest } from "./controlPlaneService";
import { agentWorkspaceApi, type AgentCase } from "./agentWorkspaceService";
vi.mock("./controlPlaneService", () => ({ authenticatedRequest: vi.fn() }));
beforeEach(() => vi.mocked(authenticatedRequest).mockReset());
test("assignment uses both server revisions and never sends a browser-selected assignee", async () => {
  const item = {
    id: "case/one",
    caseRevision: 8,
    work: { revision: 3 },
  } as AgentCase;
  await agentWorkspaceApi.claim(item, "Taking ownership");
  expect(authenticatedRequest).toHaveBeenCalledWith(
    "/operations/agent/cases/case%2Fone/claim",
    "POST",
    { revision: 3, caseRevision: 8, note: "Taking ownership" },
  );
});
test("queue and knowledge queries use encoded literal values", async () => {
  await agentWorkspaceApi.list({
    queue: "support & priority",
    assignment: "mine",
    offset: 25,
  });
  expect(authenticatedRequest).toHaveBeenCalledWith(
    "/operations/agent/cases?limit=25&queue=support+%26+priority&assignment=mine&offset=25",
  );
  await agentWorkspaceApi.knowledge("case-one", "replacement & delivery");
  expect(authenticatedRequest).toHaveBeenLastCalledWith(
    "/operations/agent/cases/case-one/knowledge?query=replacement+%26+delivery",
  );
});
