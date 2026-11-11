import { describe, expect, it } from "vitest";
import { CHUNK_BYTES, chunkRanges, fmtBytes, uploadInChunks } from "../src/upload.js";

const K = 1024;
const fakeFile = (size: number, name = "scan.pdf", type = "application/pdf") => new File([new Uint8Array(size)], name, { type });
/** A transport that notes every call; `failPart(n, attempt)` says when a part's request is to break like a dropped line. */
const transport = (failPart: (n: number, attempt: number) => boolean = () => false) => {
  const calls: string[] = [];
  const attempts = new Map<number, number>();
  return {
    calls,
    start: async (meta: any) => { calls.push(`start ${meta.fileName} ${meta.size}`); return { id: "file-1-abc" }; },
    part: async (id: string, n: number, blob: Blob) => {
      const a = (attempts.get(n) || 0) + 1; attempts.set(n, a);
      if (failPart(n, a)) throw new Error("socket closed");
      calls.push(`part ${id} ${n} ${blob.size}`); return { ok: true };
    },
    finish: async (id: string, meta: any) => { calls.push(`finish ${id} ${meta.parts}`); return { ok: true, id, fileName: meta.fileName, url: `/api/files/${id}` }; },
  };
};
const noWait = async () => {};

describe("uploads in parts", () => {
  it("cuts a file into parts of the chunk size, the last one shorter; one part for an empty file", () => {
    expect(chunkRanges(0, 4)).toEqual([{ n: 1, start: 0, end: 0 }]);
    expect(chunkRanges(4, 4)).toEqual([{ n: 1, start: 0, end: 4 }]);
    expect(chunkRanges(5, 4)).toEqual([{ n: 1, start: 0, end: 4 }, { n: 2, start: 4, end: 5 }]);
    expect(chunkRanges(3 * CHUNK_BYTES + 1).length).toBe(4);
  });
  it("sends start, every part in order with its bytes, then finish with the count; progress reaches the size", async () => {
    const t = transport(); const seen: number[] = [];
    const out = await uploadInChunks(fakeFile(5 * K + 10), t, { chunk: 2 * K, onProgress: (done: number) => seen.push(done), wait: noWait });
    expect(t.calls).toEqual(["start scan.pdf 5130", "part file-1-abc 1 2048", "part file-1-abc 2 2048", "part file-1-abc 3 1034", "finish file-1-abc 3"]);
    expect(seen).toEqual([2048, 4096, 5130]);
    expect(out).toEqual({ ok: true, id: "file-1-abc", fileName: "scan.pdf", url: "/api/files/file-1-abc" });
  });
  it("tries a part again when the line drops, up to three times, then gives up", async () => {
    const t = transport((n, attempt) => n === 2 && attempt < 3);
    await uploadInChunks(fakeFile(3 * K), t, { chunk: K, wait: noWait });
    expect(t.calls.filter((c) => c.startsWith("part"))).toEqual(["part file-1-abc 1 1024", "part file-1-abc 2 1024", "part file-1-abc 3 1024"]);
    const dead = transport((n) => n === 1);
    await expect(uploadInChunks(fakeFile(K), dead, { chunk: K, wait: noWait })).rejects.toThrow("socket closed");
    expect(dead.calls).toEqual(["start scan.pdf 1024"]);
  });
  it("does not send again what the server refused", async () => {
    const t = transport(); let tries = 0;
    t.part = async () => { tries++; throw Object.assign(new Error("A part is larger than 2 MB"), { status: 413 }); };
    await expect(uploadInChunks(fakeFile(K), t, { chunk: K, wait: noWait })).rejects.toThrow("larger");
    expect(tries).toBe(1);
  });
  it("reads sizes the way people do", () => {
    expect(fmtBytes(0)).toBe("0 KB"); expect(fmtBytes(512)).toBe("1 KB"); expect(fmtBytes(300 * K)).toBe("300 KB"); expect(fmtBytes(4.8 * K * K)).toBe("4.8 MB");
  });
});
