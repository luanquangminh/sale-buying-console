/*
 * Uploads in parts: a file above CHUNK_BYTES goes up 512 KB at a time, one short request each, so a slow line (the one from
 * Vietnam to the Worker hosts runs at tens of KB/s and drops long requests) still gets it through; the server joins the parts.
 */

export const CHUNK_BYTES = 512 * 1024;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** The parts of a file of `size` bytes: `{ n, start, end }`, n from 1, the last one shorter; one empty part for an empty file. */
export function chunkRanges(size, chunk = CHUNK_BYTES) {
  const out = [];
  for (let start = 0, n = 1; start < size || n === 1; start += chunk, n++) out.push({ n, start, end: Math.min(size, start + chunk) });
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tries `fn` up to `attempts` times, waiting 1 s, then 2 s… between tries; what the server refused (4xx) is not sent again. */
async function retry(fn, attempts, wait) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (err) {
      if (i >= attempts || (err && err.status >= 400 && err.status < 500)) throw err;
      await wait(1000 * i);
    }
  }
}

/**
 * Sends `file` in parts through `transport` ({ start(meta), part(id, n, blob), finish(id, meta) }), each part tried up to
 * three times; `onProgress(done, size)` after each part. Resolves with what finish answers: the stored file's name and url.
 */
export async function uploadInChunks(file, transport, { onProgress, chunk = CHUNK_BYTES, attempts = 3, wait = sleep } = {}) {
  const meta = { fileName: file.name, contentType: file.type || "", size: file.size };
  const { id } = await transport.start(meta);
  const ranges = chunkRanges(file.size, chunk);
  for (const r of ranges) {
    await retry(() => transport.part(id, r.n, file.slice(r.start, r.end)), attempts, wait);
    if (onProgress) onProgress(r.end, file.size);
  }
  return transport.finish(id, { ...meta, parts: ranges.length });
}

/** "4.8 MB", "300 KB", "0 KB". */
export const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
