#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <input-markdown> [output-docx]"
  exit 1
fi

INPUT_MD="$1"
OUTPUT_DOCX="${2:-${INPUT_MD%.md}.docx}"

if [[ ! -f "$INPUT_MD" ]]; then
  echo "Input file not found: $INPUT_MD"
  exit 1
fi

if ! command -v pandoc >/dev/null 2>&1; then
  echo "pandoc is required but not installed."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required but not installed."
  exit 1
fi

if [[ -n "${TMPDIR:-}" && ! -d "${TMPDIR}" ]]; then
  export TMPDIR="/tmp"
fi

WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

PROCESSED_MD="$WORK_DIR/processed.md"
DIAGRAM_DIR="$WORK_DIR/mermaid"
mkdir -p "$DIAGRAM_DIR"

python3 - "$INPUT_MD" "$PROCESSED_MD" "$DIAGRAM_DIR" <<'PY'
import re
import sys
from pathlib import Path

input_md = Path(sys.argv[1])
output_md = Path(sys.argv[2])
diagram_dir = Path(sys.argv[3])

text = input_md.read_text(encoding="utf-8")
pattern = re.compile(r"```mermaid\s*\n(.*?)\n```", re.DOTALL)

counter = 0

def replace_block(match):
    global counter
    counter += 1
    mermaid_src = match.group(1).strip() + "\n"
    mmd_file = diagram_dir / f"diagram_{counter}.mmd"
    png_file = diagram_dir / f"diagram_{counter}.png"
    mmd_file.write_text(mermaid_src, encoding="utf-8")
    return f"![Diagram {counter}]({png_file.as_posix()})"

processed = pattern.sub(replace_block, text)
output_md.write_text(processed, encoding="utf-8")
print(counter)
PY

DIAGRAM_COUNT=$(python3 - "$PROCESSED_MD" <<'PY'
import re
import sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding='utf-8')
print(len(re.findall(r'!\[Diagram\s+\d+\]\(', text)))
PY
)

if [[ "$DIAGRAM_COUNT" -gt 0 ]]; then
  for i in $(seq 1 "$DIAGRAM_COUNT"); do
    npx -y @mermaid-js/mermaid-cli \
      -i "$DIAGRAM_DIR/diagram_${i}.mmd" \
      -o "$DIAGRAM_DIR/diagram_${i}.png" \
      -b white \
      -s 2 \
      -t default
  done
fi

pandoc "$PROCESSED_MD" -o "$OUTPUT_DOCX"

python3 - "$OUTPUT_DOCX" <<'PY'
import io
import re
import zipfile
from pathlib import Path
import sys

docx_path = Path(sys.argv[1])

replacements = {
  "Aptos Display": "Times New Roman",
  "Aptos": "Times New Roman",
  "Calibri": "Times New Roman",
  "Cambria": "Times New Roman",
  "Cambria Math": "Times New Roman",
  "Consolas": "Times New Roman",
  "Courier New": "Times New Roman",
  "Times New Roman Math": "Times New Roman",
}

target_entries = {
  "word/fontTable.xml",
  "word/styles.xml",
  "word/settings.xml",
  "word/document.xml",
  "word/footnotes.xml",
  "word/comments.xml",
  "word/_rels/document.xml.rels",
  "[Content_Types].xml",
}

with zipfile.ZipFile(docx_path, "r") as zin:
  files = {name: zin.read(name) for name in zin.namelist()}

if "word/theme/theme1.xml" in files:
  del files["word/theme/theme1.xml"]

for entry in list(files.keys()):
  if entry in target_entries:
    text = files[entry].decode("utf-8")
    for src, dst in replacements.items():
      text = text.replace(src, dst)

    if entry in {"word/styles.xml", "word/document.xml", "word/footnotes.xml", "word/comments.xml"}:
      text = re.sub(
        r"<w:rFonts\b[^>]*/>",
        '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>',
        text,
      )

      text = re.sub(r"\s+w:(asciiTheme|hAnsiTheme|eastAsiaTheme|cstheme|csTheme)=\"[^\"]*\"", "", text)

    if entry == "word/_rels/document.xml.rels":
      text = re.sub(
        r"<Relationship[^>]*Type=\"http://schemas\.openxmlformats\.org/officeDocument/2006/relationships/theme\"[^>]*/>",
        "",
        text,
      )

    if entry == "[Content_Types].xml":
      text = re.sub(
        r"<Override[^>]*PartName=\"/word/theme/theme1\.xml\"[^>]*/>",
        "",
        text,
      )

    files[entry] = text.encode("utf-8")

tmp = io.BytesIO()
with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
  for name, content in files.items():
    zout.writestr(name, content)

docx_path.write_bytes(tmp.getvalue())
PY

echo "DOCX created: $OUTPUT_DOCX"
