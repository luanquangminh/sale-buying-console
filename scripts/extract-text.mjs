// Node replica of src/pdfExtract.js pageText() so the Worker prompt can be tested outside the browser.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const data = new Uint8Array(readFileSync(process.argv[2]));
const pdf = await pdfjsLib.getDocument({ data }).promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const text = await pageText(page);
  pages.push(`=== Page ${i} ===\n${text}`);
}
writeFileSync(process.argv[3], pages.join("\n\n"));

async function pageText(page) {
  const content = await page.getTextContent();
  const items = content.items
    .filter((it) => typeof it.str === "string" && it.str.trim())
    .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, h: it.height || Math.abs(it.transform[3]) || 10, str: it.str.trim() }));
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  // 1. Cluster items into visual lines (same baseline within half a line height).
  const lines = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(2, it.h * 0.45)) last.items.push(it);
    else lines.push({ y: it.y, h: it.h, items: [it] });
  }

  // 2. Turn each line into column segments: items closer than a small gap belong to one cell.
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.segments = [];
    for (const it of line.items) {
      const seg = line.segments[line.segments.length - 1];
      if (seg && it.x - seg.x1 <= Math.max(6, it.h * 0.6)) { seg.text += " " + it.str; seg.x1 = Math.max(seg.x1, it.x + it.w); }
      else line.segments.push({ x0: it.x, x1: it.x + it.w, text: it.str });
    }
  }

  // 3. A wrapped cell shows up as a short line just below its row, indented and sitting inside the
  //    x-range of one of the row's cells. Fold such lines back into that cell so the model sees
  //    "10 x 400g" and "20.0% S" instead of two fragments.
  const merged = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    const close = prev && prev.y - line.y <= Math.max(prev.h, line.h) * 1.7;
    const indented = prev && line.segments[0].x0 > prev.segments[0].x0 + 2;
    if (close && indented && prev.segments.length >= 2) {
      const targets = line.segments.map((seg) => prev.segments.find((p) => seg.x0 < p.x1 + 3 && seg.x1 > p.x0 - 3));
      if (targets.every(Boolean)) {
        line.segments.forEach((seg, i) => { targets[i].text += " " + seg.text; targets[i].x1 = Math.max(targets[i].x1, seg.x1); });
        prev.y = line.y;
        continue;
      }
    }
    merged.push(line);
  }
  return merged.map((line) => line.segments.map((s) => s.text).join(" | ")).join("\n");
}

console.log("pages:", pdf.numPages, "chars:", pages.join("\n\n").length);
