import { describe, expect, it } from "vitest";
import {
  docxToText,
  extractDocument,
  htmlToText,
  identifierFor,
  pdfItemsToText,
  readZipEntry,
  titleOf,
  wordXmlToText,
} from "./documentExtraction";

// A minimal ZIP writer for fixtures: stored or deflated entries.
async function zip(
  files: Record<string, string>,
  { deflate = true, encrypted = false } = {},
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = encoder.encode(content);
    const data = deflate
      ? new Uint8Array(
          await new Response(
            new Blob([raw])
              .stream()
              .pipeThrough(new CompressionStream("deflate-raw")),
          ).arrayBuffer(),
        )
      : raw;
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(6, encrypted ? 1 : 0, true);
    lv.setUint16(8, deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(8, encrypted ? 1 : 0, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce(
    (total, entry) => total + entry.length,
    0,
  );
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

const p = (body: string, properties = "") =>
  `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${body}</w:p>`;
const run = (text: string) =>
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const heading = (level: number) => `<w:pStyle w:val="Heading${level}"/>`;
const listed = (numId: number, level = 0) =>
  `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p(run("Card replacement"), '<w:pStyle w:val="Title"/>')}
${p(run("Use this procedure when a customer reports a lost card &amp; needs a new one."))}
${p(run("Steps"), heading(2))}
${p(run("Verify the customer&#8217;s identity."), listed(1))}
${p(run("Confirm the delivery") + run(" address."), listed(1))}
${p(run("Check for a recent address change."), listed(1, 1))}
${p(run("Order the replacement card."), listed(1))}
${p(run("Guardrails"), heading(2))}
${p(run("Require confirmation"), listed(2))}
${p(run("Escalate when amount &gt; 5000"), listed(2))}
${p("<w:r><w:delText>Deleted wording</w:delText></w:r>" + run("Kept"))}
${p(run("Fee") + "<w:r><w:tab/></w:r>" + run("Waived"))}
<w:tbl><w:tr><w:tc>${p(run("Card"))}</w:tc><w:tc>${p(run("Fee"))}</w:tc></w:tr>
<w:tr><w:tc>${p(run("Debit"))}</w:tc><w:tc>${p(run("None"))}</w:tc></w:tr></w:tbl>
${p(run("Not numbered"), listed(0))}
<w:p/>
</w:body></w:document>`;

const numberingXml = `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="11"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="11"/></w:num>
</w:numbering>`;

const expectedWordText = `# Card replacement

Use this procedure when a customer reports a lost card & needs a new one.

## Steps

1. Verify the customer’s identity.
2. Confirm the delivery address.
   1. Check for a recent address change.
3. Order the replacement card.

## Guardrails

- Require confirmation
- Escalate when amount > 5000

Kept

Fee Waived

Card | Fee

Debit | None

Not numbered`;

describe("Word documents", () => {
  it("keeps headings, numbered and bulleted lists, tables and accepted text", () => {
    expect(wordXmlToText(documentXml, numberingXml)).toBe(expectedWordText);
  });

  it("treats numbered paragraphs as ordered when numbering definitions are missing", () => {
    expect(
      wordXmlToText(`<w:body>${p(run("Only step"), listed(4))}</w:body>`),
    ).toBe("1. Only step");
  });

  it.each([true, false])(
    "reads a .docx package (deflated: %s)",
    async (deflate) => {
      const bytes = await zip(
        {
          "[Content_Types].xml": "<Types/>",
          "word/document.xml": documentXml,
          "word/numbering.xml": numberingXml,
        },
        { deflate },
      );
      expect(await docxToText(bytes)).toBe(expectedWordText);
    },
  );

  it("rejects packages without a document body, encrypted entries and oversized parts", async () => {
    await expect(
      docxToText(await zip({ "xl/workbook.xml": "<x/>" })),
    ).rejects.toThrow("No Word document body");
    await expect(
      docxToText(
        await zip({ "word/document.xml": documentXml }, { encrypted: true }),
      ),
    ).rejects.toThrow("Password-protected");
    const bomb = await zip({ "word/document.xml": "a".repeat(200_000) });
    await expect(readZipEntry(bomb, "word/document.xml", 1000)).rejects.toThrow(
      "size limit",
    );
    await expect(
      docxToText(new TextEncoder().encode("not a zip at all")),
    ).rejects.toThrow("not a valid Word document");
  });
});

describe("Word styles", () => {
  const styles = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ProcedureStep"><w:name w:val="Procedure Step"/><w:basedOn w:val="ListNumber"/></w:style>
<w:style w:type="paragraph" w:styleId="SectionTitle"><w:name w:val="Section Title"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Strong"><w:name w:val="heading 1"/></w:style>
</w:styles>`;
  const styled = (style: string, text: string, extra = "") =>
    p(run(text), `<w:pStyle w:val="${style}"/>${extra}`);

  it("applies headings and numbering inherited from paragraph styles", () => {
    const body = `<w:body>
${styled("berschrift2", "Schritte")}
${styled("ListNumber", "Verify identity.")}
${styled("ProcedureStep", "Order the card.")}
${styled("ListNumber", "Not a step.", '<w:numPr><w:numId w:val="0"/></w:numPr>')}
${styled("SectionTitle", "Guardrails")}
${styled("Strong", "Character styles are not headings.")}
</w:body>`;
    expect(wordXmlToText(body, numberingXml, styles)).toBe(`## Schritte

1. Verify identity.
2. Order the card.

Not a step.

## Guardrails

Character styles are not headings.`);
  });
});

describe("HTML", () => {
  it("converts structure to Markdown and drops scripts, styles and markup", () => {
    const html = `<!doctype html><html><head><title>x</title><style>p{color:red}</style></head><body>
      <h1>Travel   notice</h1>
      <p>Tell us before you travel &mdash; it avoids
         declined payments.</p>
      <script>alert("no")</script>
      <h2>Steps</h2>
      <ol start="1">
        <li><p>Ask for the dates.</p></li>
        <li>Ask for the countries.
          <ul><li>Include stopovers.</li></ul>
        </li>
      </ol>
      <h2>Guardrails</h2>
      <ul><li>Disclose: Notices last 90 days.</li></ul>
      <table><tr><th>Region</th><th>Days</th></tr><tr><td>EU</td><td>90</td></tr></table>
      <p>Line one<br>Line two &amp; three</p>
      <pre>  keep
  this</pre>
    </body></html>`;
    expect(htmlToText(html)).toBe(`# Travel notice

Tell us before you travel — it avoids declined payments.

## Steps

1. Ask for the dates.
2. Ask for the countries.
   - Include stopovers.

## Guardrails

- Disclose: Notices last 90 days.

Region | Days
EU | 90

Line one
Line two & three

  keep
  this`);
  });

  it("does not stall on unterminated quotes", () => {
    const text = htmlToText(
      `<p title="${"x".repeat(50_000)}>Hello</p>`.repeat(20),
    );
    expect(typeof text).toBe("string");
  });
});

describe("PDF text layout", () => {
  const item = (str: string, y: number, height = 10, hasEOL = true) => ({
    str,
    hasEOL,
    height,
    transform: [height, 0, 0, height, 72, y],
  });

  it("rebuilds headings, paragraphs and steps with wrapped lines", () => {
    const text = pdfItemsToText([
      [
        item("Card replacement", 760, 18),
        item("Use this procedure when a customer reports a lost", 730),
        item("or stolen card.", 718),
        item("Steps", 690, 13),
        item("1. Verify the customer's identity using two", 668),
        item("factors.", 656),
        item("2) Order the replacement.", 644),
        item("Guardrails", 616, 13),
        item("• Require confirmation", 594),
        item("Never say: ", 582, 10, false),
        item('"no fee"', 582),
      ],
      [item("Page two paragraph.", 760)],
    ]);
    expect(text).toBe(`# Card replacement

Use this procedure when a customer reports a lost or stolen card.

## Steps

1. Verify the customer's identity using two factors.
2. Order the replacement.

## Guardrails

- Require confirmation Never say: "no fee"

Page two paragraph.`);
  });

  it("returns nothing for pages without text", () => {
    expect(pdfItemsToText([[], []])).toBe("");
  });
});

describe("extractDocument", () => {
  it("reads Markdown, HTML and Word files and derives a title", async () => {
    const markdown = await extractDocument(
      new File(["# Travel notice\n\n1. Ask for dates.\r\n"], "travel.md"),
    );
    expect(markdown).toMatchObject({
      format: "markdown",
      title: "Travel notice",
      text: "# Travel notice\n\n1. Ask for dates.",
    });
    const html = await extractDocument(
      new File(["<h2>Fees</h2><p>Monthly fees.</p>"], "fees.HTML"),
    );
    expect(html).toMatchObject({ format: "html", title: "Fees" });
    const word = await extractDocument(
      new File(
        [
          (
            await zip({
              "word/document.xml": documentXml,
              "word/numbering.xml": numberingXml,
            })
          ).slice(),
        ],
        "card.docx",
      ),
    );
    expect(word).toMatchObject({
      format: "docx",
      title: "Card replacement",
      warnings: [],
    });
  });

  it("rejects unsupported, empty and oversized files", async () => {
    await expect(
      extractDocument(new File(["x"], "sheet.xlsx")),
    ).rejects.toThrow("Use a Markdown");
    await expect(
      extractDocument(new File(["   \n"], "empty.txt")),
    ).rejects.toThrow("No text");
    const large = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.txt");
    await expect(extractDocument(large)).rejects.toThrow("10 MB");
  });
});

describe("names", () => {
  it.each([
    ["Card Replacement SOP (rev 3).docx", "card_replacement_sop_rev_3"],
    ["2026-fees.pdf", "doc_2026_fees"],
    ["Café notes.md", "cafe_notes"],
    [`${"a".repeat(80)}.txt`, "a".repeat(64)],
  ])("%s -> %s", (name, id) => expect(identifierFor(name)).toBe(id));

  it("titles come from the first heading, then the first line, then the file name", () => {
    expect(titleOf("intro\n## Real title", "x.md")).toBe("Real title");
    expect(titleOf("First line\nSecond", "x.md")).toBe("First line");
    expect(titleOf("", "card_replacement-sop.pdf")).toBe(
      "card replacement sop",
    );
  });
});
