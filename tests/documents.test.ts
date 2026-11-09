import { describe, expect, it } from "vitest";
import { DOC_STATUSES, DOC_STATUS_LABEL, DOC_STATUS_TONE, awaitingDocuments, docProgress } from "../src/documents.js";

const doc = (id: string, status = "not_applied") => ({ id, type: "COO", content: "", fileName: "", fileUrl: "", status });
const pfi = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id, pfiNo: id.toUpperCase(), customerName: `Cust ${id}`, saleName: "Rep", createdAt,
  delivery: { loaded: "loaded" }, documents: [doc(`${id}-1`)], ...extra,
});

describe("docProgress", () => {
  it("counts only Done as done; every other status is still open", () => {
    expect(docProgress([doc("a", "done"), doc("b", "applied"), doc("c", "waiting_delivery"), doc("d")])).toEqual({ total: 4, done: 1, open: 3 });
    expect(docProgress([])).toEqual({ total: 0, done: 0, open: 0 });
    expect(docProgress(undefined as any)).toEqual({ total: 0, done: 0, open: 0 });
  });
});

describe("awaitingDocuments", () => {
  it("leaves out a PFI whose delivery is not Loaded", () => {
    const bySale = { s1: [pfi("a", "2026-11-01", { delivery: { loaded: "not_loaded" } }), pfi("b", "2026-11-02", { delivery: {} }), pfi("c", "2026-11-03")] };
    expect(awaitingDocuments(bySale).map((r) => r.pfi.id)).toEqual(["c"]);
  });
  it("leaves out a Loaded PFI without documents", () => {
    const bySale = { s1: [pfi("a", "2026-11-01", { documents: [] }), pfi("b", "2026-11-02")] };
    expect(awaitingDocuments(bySale).map((r) => r.pfi.id)).toEqual(["b"]);
  });
  it("hides a PFI whose documents are all Done unless showDone asks for it", () => {
    const bySale = { s1: [pfi("a", "2026-11-01", { documents: [doc("a-1", "done"), doc("a-2", "done")] }), pfi("b", "2026-11-02", { documents: [doc("b-1", "done"), doc("b-2", "applied")] })] };
    expect(awaitingDocuments(bySale).map((r) => r.pfi.id)).toEqual(["b"]);
    expect(awaitingDocuments(bySale, { showDone: true }).map((r) => r.pfi.id)).toEqual(["b", "a"]);
  });
  it("lists rows across reps, newest PFI first, each with its rep's id", () => {
    const bySale = { s1: [pfi("a", "2026-11-01"), pfi("c", "2026-11-03")], s2: [pfi("b", "2026-11-02")] };
    expect(awaitingDocuments(bySale).map((r) => [r.pfi.id, r.saleId])).toEqual([["c", "s1"], ["b", "s2"], ["a", "s1"]]);
  });
  it("is empty without PFIs", () => {
    expect(awaitingDocuments({})).toEqual([]);
    expect(awaitingDocuments(undefined as any)).toEqual([]);
  });
});

describe("DOC_STATUSES", () => {
  it("ends with Done, and every status has a label and a tone", () => {
    expect(DOC_STATUSES[DOC_STATUSES.length - 1]).toEqual({ value: "done", label: "Done" });
    expect(DOC_STATUSES.map((s) => s.value)).toEqual(["not_applied", "applied", "waiting_delivery", "done"]);
    for (const s of DOC_STATUSES) {
      expect(DOC_STATUS_LABEL[s.value]).toBe(s.label);
      expect(DOC_STATUS_TONE[s.value]).toBeTruthy();
    }
    expect(DOC_STATUS_TONE.done).toBe("green");
  });
});
