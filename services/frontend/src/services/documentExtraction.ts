/**
 * Text extraction for document ingestion in the console. Files are read in the
 * browser so the author can review the extracted text before anything is sent;
 * the server validates the text it receives as it does for pasted content.
 *
 * Headings become Markdown headings and numbered or bulleted lists become
 * Markdown lists, which the procedure parser turns into steps and guardrails.
 */

export type DocumentFormat = "markdown" | "text" | "html" | "docx" | "pdf";

export interface ExtractedDocument {
  name: string;
  format: DocumentFormat;
  text: string;
  title: string;
  warnings: string[];
}

export const EXTRACTION_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  /** Uncompressed size of one Word part; guards against ZIP bombs. */
  partBytes: 25 * 1024 * 1024,
  pdfPages: 300,
  textCharacters: 500_000,
};

export const ACCEPTED_DOCUMENTS = [
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
  ".docx",
  ".pdf",
].join(",");

export class ExtractionError extends Error {}

const EXTENSIONS: Record<string, DocumentFormat> = {
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  text: "text",
  html: "html",
  htm: "html",
  docx: "docx",
  pdf: "pdf",
};

export function formatOf(name: string): DocumentFormat | null {
  const extension = name.toLowerCase().split(".").pop() || "";
  return EXTENSIONS[extension] || null;
}

/** Collapses whitespace the way the procedure parser expects. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first heading, else the first short line, else the file name. */
export function titleOf(text: string, fileName: string): string {
  const heading = text.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1];
  const line = text
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry && entry.length <= 200);
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return (heading || line || base).slice(0, 200).trim() || "Imported document";
}

// --- XML and HTML tokens --------------------------------------------------

type Token =
  | {
      type: "open";
      name: string;
      attributes: Record<string, string>;
      selfClosing: boolean;
    }
  | { type: "close"; name: string }
  | { type: "text"; value: string };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
};

export function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    },
  );
}

function attributesOf(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(
    /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    attributes[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
}

/** A forgiving tokenizer: comments, declarations and instructions are skipped. */
export function tokenize(markup: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[!?][^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:[^>"']|"[^"]{0,4096}"|'[^']{0,4096}')*?)(\/?)>|([^<]+)|</g;
  for (const match of markup.matchAll(pattern)) {
    if (match[1] !== undefined) tokens.push({ type: "text", value: match[1] });
    else if (match[2])
      tokens.push({ type: "close", name: match[2].toLowerCase() });
    else if (match[3])
      tokens.push({
        type: "open",
        name: match[3].toLowerCase(),
        attributes: attributesOf(match[4] || ""),
        selfClosing: match[5] === "/",
      });
    else if (match[6] !== undefined)
      tokens.push({ type: "text", value: decodeEntities(match[6]) });
    else if (match[0] === "<") tokens.push({ type: "text", value: "<" });
  }
  return tokens;
}

// --- HTML -----------------------------------------------------------------

const SKIPPED = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "head",
  "iframe",
  "object",
]);
const BLOCKS = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "blockquote",
  "figure",
  "figcaption",
  "form",
  "fieldset",
  "address",
  "dl",
  "dt",
  "dd",
  "hr",
]);
const VOID = new Set([
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "source",
  "track",
  "wbr",
]);

/** HTML to Markdown-like text: headings, lists, tables and paragraphs. */
export function htmlToText(html: string): string {
  const lines: string[] = [];
  let line = "";
  // Heading or list marker for the current line, kept out of whitespace collapsing.
  let prefix = "";
  let skip = 0;
  let pre = 0;
  const lists: Array<{ ordered: boolean; count: number }> = [];
  let cells: string[] | null = null;
  const flush = () => {
    if (pre) lines.push(...line.split("\n").filter((entry) => entry.trim()));
    else {
      const text = line.replace(/\s+/g, " ").trim();
      if (text) lines.push(prefix + text);
    }
    line = "";
    prefix = "";
  };
  const block = () => {
    flush();
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  };
  for (const token of tokenize(html)) {
    if (token.type === "text") {
      if (!skip) line += token.value;
      continue;
    }
    const name = token.name;
    if (SKIPPED.has(name)) {
      if (token.type === "open" && !token.selfClosing) skip += 1;
      else if (token.type === "close") skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip) continue;
    if (token.type === "open") {
      if (name === "br") {
        flush();
      } else if (/^h[1-6]$/.test(name)) {
        block();
        prefix = `${"#".repeat(Number(name[1]))} `;
      } else if (name === "ol" || name === "ul") {
        if (!lists.length) block();
        else flush();
        const start = Number(token.attributes.start);
        lists.push({
          ordered: name === "ol",
          count: Number.isInteger(start) ? start - 1 : 0,
        });
      } else if (name === "li") {
        flush();
        const list = lists[lists.length - 1];
        const indent = "   ".repeat(Math.max(0, lists.length - 1));
        if (list?.ordered) {
          list.count += 1;
          prefix = `${indent}${list.count}. `;
        } else prefix = `${indent}- `;
      } else if (name === "tr") {
        flush();
        cells = [];
      } else if ((name === "td" || name === "th") && cells) {
        flush();
      } else if (name === "pre") {
        block();
        pre += 1;
      } else if (BLOCKS.has(name) && !lists.length) block();
      if (VOID.has(name) || token.selfClosing) continue;
    } else {
      if (/^h[1-6]$/.test(name)) block();
      else if (name === "ol" || name === "ul") {
        flush();
        lists.pop();
        if (!lists.length) block();
      } else if (name === "li") flush();
      else if ((name === "td" || name === "th") && cells) {
        cells.push(line.replace(/\s+/g, " ").trim());
        line = "";
      } else if (name === "tr" && cells) {
        line = "";
        const row = cells.filter(Boolean).join(" | ");
        if (row) lines.push(row);
        cells = null;
      } else if (name === "table") block();
      else if (name === "pre") {
        flush();
        pre = Math.max(0, pre - 1);
        block();
      } else if (BLOCKS.has(name) && !lists.length) block();
    }
  }
  flush();
  return normalizeText(lines.join("\n"));
}

// --- Word (.docx) -----------------------------------------------------------

type NumberingFormats = Map<string, Map<string, string>>;

/** numId -> level -> numFmt, from word/numbering.xml. */
export function wordNumbering(xml: string | null): NumberingFormats {
  const abstracts = new Map<string, Map<string, string>>();
  const formats: NumberingFormats = new Map();
  if (!xml) return formats;
  let abstractId: string | null = null;
  let level: string | null = null;
  let numId: string | null = null;
  const nums = new Map<string, string>();
  for (const token of tokenize(xml)) {
    if (token.type === "open") {
      if (token.name === "w:abstractnum") {
        abstractId = token.attributes["w:abstractnumid"];
        abstracts.set(abstractId, new Map());
      } else if (token.name === "w:lvl" && abstractId !== null)
        level = token.attributes["w:ilvl"];
      else if (
        token.name === "w:numfmt" &&
        abstractId !== null &&
        level !== null
      )
        abstracts.get(abstractId)!.set(level, token.attributes["w:val"]);
      else if (token.name === "w:num") numId = token.attributes["w:numid"];
      else if (token.name === "w:abstractnumid" && numId !== null)
        nums.set(numId, token.attributes["w:val"]);
    } else if (token.type === "close") {
      if (token.name === "w:abstractnum") abstractId = null;
      else if (token.name === "w:lvl") level = null;
      else if (token.name === "w:num") numId = null;
    }
  }
  for (const [id, abstract] of nums)
    formats.set(id, abstracts.get(abstract) || new Map());
  return formats;
}

/** word/document.xml to Markdown-like text. */
interface WordStyle {
  name?: string;
  basedOn?: string;
  numId?: string;
  level?: number;
  outline?: number;
}

/** Paragraph styles from word/styles.xml: names, inheritance, numbering, outline level. */
export function wordStyles(xml: string | null): Map<string, WordStyle> {
  const styles = new Map<string, WordStyle>();
  if (!xml) return styles;
  let id: string | null = null;
  let style: WordStyle = {};
  let inParagraphProperties = false;
  for (const token of tokenize(xml)) {
    if (token.type === "open") {
      if (token.name === "w:style") {
        id =
          token.attributes["w:type"] === "paragraph" ||
          !token.attributes["w:type"]
            ? (token.attributes["w:styleid"] ?? null)
            : null;
        style = {};
      } else if (!id) continue;
      else if (token.name === "w:name") style.name = token.attributes["w:val"];
      else if (token.name === "w:basedon")
        style.basedOn = token.attributes["w:val"];
      else if (token.name === "w:ppr")
        inParagraphProperties = !token.selfClosing;
      else if (inParagraphProperties && token.name === "w:numid")
        style.numId = token.attributes["w:val"];
      else if (inParagraphProperties && token.name === "w:ilvl")
        style.level = Number(token.attributes["w:val"]) || 0;
      else if (inParagraphProperties && token.name === "w:outlinelvl")
        style.outline = Number(token.attributes["w:val"]);
    } else if (token.type === "close") {
      if (token.name === "w:ppr") inParagraphProperties = false;
      else if (token.name === "w:style") {
        if (id) styles.set(id, style);
        id = null;
      }
    }
  }
  return styles;
}

/** Heading level and inherited numbering for a paragraph style. */
function resolveStyle(styles: Map<string, WordStyle>, styleId: string | null) {
  const resolved: { heading: number; numId?: string; level?: number } = {
    heading: 0,
  };
  const seen = new Set<string>();
  for (
    let id = styleId;
    id && !seen.has(id) && seen.size < 10;
    id = styles.get(id)?.basedOn ?? null
  ) {
    seen.add(id);
    const style = styles.get(id);
    const name = (style?.name || id).toLowerCase();
    // Built-in heading names are stable even when the style id is localized.
    const named = name.match(
      /^(?:heading|berschrift|titre|titolo|encabezado)\s?(\d)$/,
    );
    if (!resolved.heading) {
      if (named) resolved.heading = Math.min(6, Number(named[1]));
      else if (name === "title") resolved.heading = 1;
      else if (name === "subtitle") resolved.heading = 2;
      else if (
        style?.outline !== undefined &&
        style.outline >= 0 &&
        style.outline < 6
      )
        resolved.heading = style.outline + 1;
    }
    if (resolved.numId === undefined && style?.numId !== undefined)
      resolved.numId = style.numId;
    if (resolved.level === undefined && style?.level !== undefined)
      resolved.level = style.level;
  }
  return resolved;
}

export function wordXmlToText(
  documentXml: string,
  numberingXml: string | null = null,
  stylesXml: string | null = null,
): string {
  const numbering = wordNumbering(numberingXml);
  const styles = wordStyles(stylesXml);
  const lines: string[] = [];
  const counters = new Map<string, number[]>();
  let paragraph: {
    text: string;
    style: string | null;
    numId: string | null;
    level: number | null;
    outline: number | null;
  } | null = null;
  let inText = false;
  let tableDepth = 0;
  let cells: string[] = [];
  let cell: string[] = [];
  let lastWasList = false;
  const emit = (text: string, list: boolean) => {
    if (!list && lines.length && lines[lines.length - 1] !== "") lines.push("");
    if (list && !lastWasList && lines.length && lines[lines.length - 1] !== "")
      lines.push("");
    lines.push(text);
    lastWasList = list;
  };
  for (const token of tokenize(documentXml)) {
    if (token.type === "text") {
      if (inText && paragraph) paragraph.text += token.value;
      continue;
    }
    const name = token.name;
    if (token.type === "open") {
      if (name === "w:p") {
        paragraph = {
          text: "",
          style: null,
          numId: null,
          level: null,
          outline: null,
        };
        if (token.selfClosing) paragraph = null;
      } else if (name === "w:pstyle" && paragraph) {
        paragraph.style = token.attributes["w:val"] || null;
      } else if (name === "w:outlinelvl" && paragraph) {
        paragraph.outline = Number(token.attributes["w:val"]);
      } else if (name === "w:ilvl" && paragraph)
        paragraph.level = Number(token.attributes["w:val"]) || 0;
      else if (name === "w:numid" && paragraph)
        paragraph.numId = token.attributes["w:val"] || null;
      else if (name === "w:t") inText = !token.selfClosing;
      else if ((name === "w:tab" || name === "w:ptab") && paragraph)
        paragraph.text += " ";
      else if ((name === "w:br" || name === "w:cr") && paragraph)
        paragraph.text += "\n";
      else if (name === "w:tbl") tableDepth += 1;
      else if (name === "w:tr" && tableDepth === 1) cells = [];
      else if (name === "w:tc" && tableDepth === 1) cell = [];
    } else {
      if (name === "w:t") inText = false;
      else if (name === "w:p" && paragraph) {
        const text = paragraph.text.replace(/[ \t]+/g, " ").trim();
        const direct = paragraph;
        paragraph = null;
        if (!text) continue;
        if (tableDepth) {
          cell.push(text.replace(/\s*\n\s*/g, " "));
          continue;
        }
        // Direct paragraph properties override the style; numId 0 removes numbering.
        const styled = resolveStyle(styles, direct.style);
        const current = {
          heading:
            direct.outline !== null && direct.outline >= 0 && direct.outline < 6
              ? direct.outline + 1
              : styled.heading,
          numId: direct.numId ?? styled.numId ?? null,
          level: direct.level ?? styled.level ?? 0,
        };
        const formats =
          current.numId && current.numId !== "0"
            ? numbering.get(current.numId)
            : undefined;
        if (current.heading) {
          emit(
            `${"#".repeat(current.heading)} ${text.replace(/\s*\n\s*/g, " ")}`,
            false,
          );
        } else if (current.numId && current.numId !== "0") {
          const format = formats?.get(String(current.level)) || "decimal";
          const levels = counters.get(current.numId) || [];
          levels[current.level] = (levels[current.level] || 0) + 1;
          levels.length = current.level + 1;
          counters.set(current.numId, levels);
          const indent = "   ".repeat(current.level);
          const marker =
            format === "bullet" || format === "none"
              ? "-"
              : `${levels[current.level]}.`;
          emit(`${indent}${marker} ${text.replace(/\s*\n\s*/g, " ")}`, true);
        } else {
          emit(text, false);
        }
      } else if (name === "w:tc" && tableDepth === 1)
        cells.push(cell.join(" "));
      else if (name === "w:tr" && tableDepth === 1) {
        const row = cells.filter(Boolean).join(" | ");
        if (row) emit(row, false);
      } else if (name === "w:tbl") tableDepth = Math.max(0, tableDepth - 1);
    }
  }
  return normalizeText(lines.join("\n"));
}

// --- ZIP --------------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  offset: number;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let index = bytes.length - 22;
    index >= Math.max(0, bytes.length - 65557);
    index -= 1
  ) {
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0)
    throw new ExtractionError("The file is not a valid Word document.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff)
    throw new ExtractionError(
      "Large (ZIP64) Word documents are not supported.",
    );
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new ExtractionError("The Word document is damaged.");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      flags: view.getUint16(offset + 8, true),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      offset: view.getUint32(offset + 42, true),
      name: decoder.decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength),
      ),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  // slice() copies into a plain ArrayBuffer, as Blob requires.
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new ExtractionError(
        "The Word document expands beyond the size limit.",
      );
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}

export async function readZipEntry(
  bytes: Uint8Array,
  name: string,
  limit = EXTRACTION_LIMITS.partBytes,
): Promise<string | null> {
  const entry = zipEntries(bytes).find((candidate) => candidate.name === name);
  if (!entry) return null;
  if (entry.flags & 1)
    throw new ExtractionError(
      "Password-protected Word documents are not supported.",
    );
  if (entry.size > limit)
    throw new ExtractionError(
      "The Word document expands beyond the size limit.",
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50)
    throw new ExtractionError("The Word document is damaged.");
  const start =
    entry.offset +
    30 +
    view.getUint16(entry.offset + 26, true) +
    view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (data.length !== entry.compressedSize)
    throw new ExtractionError("The Word document is damaged.");
  let content: Uint8Array;
  if (entry.method === 0) content = data;
  else if (entry.method === 8) content = await inflate(data, limit);
  else
    throw new ExtractionError(
      "The Word document uses an unsupported compression method.",
    );
  return new TextDecoder().decode(content);
}

export async function docxToText(bytes: Uint8Array): Promise<string> {
  const documentXml = await readZipEntry(bytes, "word/document.xml");
  if (documentXml === null)
    throw new ExtractionError(
      "No Word document body was found. Save the file as .docx.",
    );
  return wordXmlToText(
    documentXml,
    await readZipEntry(bytes, "word/numbering.xml"),
    await readZipEntry(bytes, "word/styles.xml"),
  );
}

// --- PDF --------------------------------------------------------------------

export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  /** pdf.js text transform; [3] is the font height and [5] the baseline. */
  transform?: number[];
  height?: number;
}

const LIST_MARKER = /^(?:\d{1,3}[.)]|[•▪◦●‣∙·*-])\s+/;

/**
 * Rebuilds lines from positioned text, joins wrapped lines into paragraphs and
 * list items, and marks lines set noticeably larger than body text as headings.
 */
export function pdfItemsToText(pages: PdfTextItem[][]): string {
  type Line = { text: string; y: number; height: number };
  const pageLines: Line[][] = pages.map((items) => {
    const lines: Line[] = [];
    let text = "";
    let y = NaN;
    let height = 0;
    const flush = () => {
      if (text.trim())
        lines.push({ text: text.replace(/\s+/g, " ").trim(), y, height });
      text = "";
      y = NaN;
      height = 0;
    };
    for (const item of items) {
      const itemY = item.transform?.[5] ?? NaN;
      const itemHeight = Math.abs(item.height || item.transform?.[3] || 0);
      if (
        text &&
        Number.isFinite(y) &&
        Number.isFinite(itemY) &&
        Math.abs(itemY - y) > Math.max(2, height * 0.5)
      )
        flush();
      if (!Number.isFinite(y)) y = itemY;
      text += item.str;
      height = Math.max(height, itemHeight);
      if (item.hasEOL) flush();
    }
    flush();
    return lines;
  });
  const heights = pageLines
    .flat()
    .map((line) => line.height)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const body = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  const output: string[] = [];
  for (const lines of pageLines) {
    let previous: Line | null = null;
    for (const line of lines) {
      const gap =
        previous && Number.isFinite(previous.y) && Number.isFinite(line.y)
          ? Math.abs(previous.y - line.y)
          : 0;
      const spacing = Math.max(previous?.height || 0, line.height, 1);
      const heading =
        body > 0 &&
        line.height >= body * 1.2 &&
        line.text.length <= 120 &&
        !/[.,;]$/.test(line.text);
      const newBlock = !previous || heading || gap > spacing * 1.6;
      if (heading) {
        if (output.length) output.push("");
        output.push(`${line.height >= body * 1.6 ? "#" : "##"} ${line.text}`);
        output.push("");
        previous = null;
        continue;
      }
      if (LIST_MARKER.test(line.text)) {
        if (
          newBlock &&
          output.length &&
          output[output.length - 1] !== "" &&
          !LIST_MARKER.test(output[output.length - 1].trim())
        )
          output.push("");
        const ordered = line.text.match(/^(\d{1,3})[.)]\s+/);
        output.push(
          ordered
            ? line.text.replace(/^(\d{1,3})\)\s+/, "$1. ")
            : line.text.replace(LIST_MARKER, "- "),
        );
      } else if (
        !newBlock &&
        output.length &&
        output[output.length - 1] !== ""
      ) {
        output[output.length - 1] = `${output[output.length - 1]} ${line.text}`;
      } else {
        if (output.length && output[output.length - 1] !== "") output.push("");
        output.push(line.text);
      }
      previous = line;
    }
    if (output.length && output[output.length - 1] !== "") output.push("");
  }
  return normalizeText(output.join("\n"));
}

async function pdfToText(
  bytes: Uint8Array,
  warnings: string[],
): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // pdf.js 6 never evaluates font code; fonts and XFA forms are not rendered.
  const task = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    enableXfa: false,
  });
  let document;
  try {
    document = await task.promise;
  } catch (error) {
    const name = (error as Error)?.name;
    throw new ExtractionError(
      name === "PasswordException"
        ? "Password-protected PDFs are not supported."
        : "The PDF could not be read.",
    );
  }
  try {
    const pageCount = Math.min(document.numPages, EXTRACTION_LIMITS.pdfPages);
    if (document.numPages > pageCount)
      warnings.push(
        `Only the first ${pageCount} of ${document.numPages} pages were read.`,
      );
    const pages: PdfTextItem[][] = [];
    for (let number = 1; number <= pageCount; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(
        content.items.flatMap((item) =>
          "str" in item
            ? [
                {
                  str: item.str,
                  hasEOL: item.hasEOL,
                  transform: item.transform,
                  height: item.height,
                },
              ]
            : [],
        ),
      );
      page.cleanup();
    }
    const text = pdfItemsToText(pages);
    if (!text)
      throw new ExtractionError(
        "The PDF has no extractable text. Scanned documents need OCR before import.",
      );
    warnings.push(
      "PDF layout is approximated. Review the extracted headings and lists.",
    );
    return text;
  } finally {
    void task.destroy();
  }
}

// --- Entry point ------------------------------------------------------------

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const format = formatOf(file.name);
  if (!format)
    throw new ExtractionError(
      "Use a Markdown, text, HTML, Word (.docx) or PDF file.",
    );
  if (file.size > EXTRACTION_LIMITS.fileBytes)
    throw new ExtractionError(
      `Files must be ${EXTRACTION_LIMITS.fileBytes / 1024 / 1024} MB or smaller.`,
    );
  const warnings: string[] = [];
  let text: string;
  if (format === "markdown" || format === "text")
    text = normalizeText(await file.text());
  else if (format === "html") text = htmlToText(await file.text());
  else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    text =
      format === "docx"
        ? await docxToText(bytes)
        : await pdfToText(bytes, warnings);
  }
  if (!text) throw new ExtractionError("No text was found in the file.");
  if (text.length > EXTRACTION_LIMITS.textCharacters) {
    text = text.slice(0, EXTRACTION_LIMITS.textCharacters);
    warnings.push("The extracted text was truncated.");
  }
  return {
    name: file.name,
    format,
    text,
    title: titleOf(text, file.name),
    warnings,
  };
}

/** A knowledge or procedure identifier derived from a file name. */
export function identifierFor(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const id = /^[a-z]/.test(base) ? base : `doc_${base}`;
  return id.slice(0, 64).replace(/_+$/, "") || "document";
}
