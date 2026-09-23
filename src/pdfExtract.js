/*
 * Client-side PDF preparation for "Import PDF".
 *
 * Text-layer PDFs: extract each page's text with pdf.js, re-sorted top-to-bottom and
 * left-to-right (pdf.js returns items in internal PDF order, not visual order), with
 * " | " between column gaps so table rows survive as one line each.
 * Scanned PDFs (no text layer): render the pages to JPEG data URLs for a vision model.
 * Doing this in the browser keeps the Worker under its CPU limit and halves the tokens sent.
 */
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const MIN_TEXT_CHARS_PER_PAGE = 60; // fewer than this and the page is treated as scanned
const MAX_PAGES = 8;
const RENDER_SCALE = 1.5; // ~108 dpi on A4: readable for a vision model, small enough to send
const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Returns { text, pageCount, renderPages } for PDFs with a text layer, or
 * { images, pageCount } (JPEG data URLs, one per page) for scanned PDFs.
 * `renderPages()` lets the caller fall back to page images when the text path finds no lines.
 */
export async function extractPdfForImport(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const renderPages = async () => {
    const images = [];
    for (let i = 1; i <= pageCount; i++) images.push(await renderPage(await pdf.getPage(i)));
    return images;
  };
  const texts = [];
  let scanned = false;
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const text = await pageText(page);
    if (text.replace(/\s+/g, "").length < MIN_TEXT_CHARS_PER_PAGE) { scanned = true; break; }
    texts.push(`=== Page ${i} ===\n${text}`);
  }
  if (!scanned) return { text: texts.join("\n\n"), pageCount: pdf.numPages, renderPages };
  return { images: await renderPages(), pageCount: pdf.numPages };
}

/** Downscale an uploaded image (JPEG/PNG/WebP) to a JPEG data URL for the vision model. */
export async function imageToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

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

async function renderPage(page) {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
