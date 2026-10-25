import { describe, expect, it } from "vitest";
import { knowledgeDocument, type KnowledgeItem } from "./KnowledgeIngestion";
import {
  counts,
  sourceFor,
  uniqueId,
  type IngestItem,
} from "./procedureIngestion";

describe("ingestion sources", () => {
  it.each([
    ["", "Card SOP.docx", "Card SOP.docx"],
    ["Servicing SOPs", "Card SOP.docx", "Servicing SOPs / Card SOP.docx"],
    [
      "https://docs.example/sops",
      "Card SOP.docx",
      "https://docs.example/sops/Card%20SOP.docx",
    ],
    [
      "https://docs.example/sops/",
      "fees.pdf",
      "https://docs.example/sops/fees.pdf",
    ],
  ])("%j + %j", (location, name, expected) => {
    expect(sourceFor(location, name)).toBe(expected);
  });
});

describe("batch ids", () => {
  it("suffixes ids already used in the batch and stays within 64 characters", () => {
    expect(uniqueId("card", new Set())).toBe("card");
    expect(uniqueId("card", new Set(["card", "card_2"]))).toBe("card_3");
    const long = "a".repeat(64);
    const id = uniqueId(long, new Set([long]));
    expect(id).toHaveLength(64);
    expect(id.endsWith("_2")).toBe(true);
  });
});

describe("batch status", () => {
  const item = (status: IngestItem["status"], text = "x"): IngestItem => ({
    key: status,
    name: `${status}.md`,
    format: "markdown",
    status,
    text,
    extractionWarnings: [],
  });
  it("counts what can be parsed and what is still working", () => {
    expect(
      counts([
        item("extracting", ""),
        item("extracted"),
        item("ready"),
        item("blocked"),
        item("failed"),
        item("failed", ""),
        item("added"),
      ]),
    ).toEqual({
      ready: 1,
      blocked: 1,
      failed: 2,
      added: 1,
      busy: 1,
      parseable: 4,
    });
  });
});

describe("knowledge drafts from files", () => {
  it("are drafts with the shared roles and a source under the location", () => {
    const item: KnowledgeItem = {
      key: "k",
      name: "Fee schedule.pdf",
      format: "pdf",
      status: "unchecked",
      id: "fee_schedule",
      title: "Fee schedule",
      text: "Monthly maintenance fees are waived with a minimum balance.",
      warnings: [],
      errors: [],
    };
    expect(
      knowledgeDocument(item, {
        location: "Policy library",
        allowedRoles: ["customer", "agent"],
      }),
    ).toEqual({
      id: "fee_schedule",
      title: "Fee schedule",
      content: item.text,
      source: "Policy library / Fee schedule.pdf",
      allowedRoles: ["customer", "agent"],
      expiresAt: null,
      status: "draft",
    });
  });
});
