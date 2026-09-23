import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPushQueue, KEEPALIVE_MAX_BYTES } from "../src/pushQueue.js";

type Sent = { changes: any[]; keepalive: boolean; resolve: (v: any) => void; reject: (e: any) => void };

/** A send() whose responses are released by the test, in any order. */
function harness(extra: Record<string, unknown> = {}) {
  const sent: Sent[] = [];
  const versions: number[] = [];
  const send = (changes: any[], opts: { keepalive: boolean }) =>
    new Promise((resolve, reject) => { sent.push({ changes, keepalive: opts.keepalive, resolve, reject }); });
  const q = createPushQueue({ send, onVersion: (v: number) => versions.push(v), onAuthError: vi.fn(), onError: vi.fn(), ...extra });
  return { q, sent, versions };
}
const ch = (id: string, n = 1) => ({ kind: "bookings", id, data: { id, n } });
const flushMicrotasks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }; // timers are faked, so no setTimeout here

describe("push queue", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("batches changes after the debounce and keeps the latest change per record", async () => {
    const { q, sent } = harness();
    q.queue(ch("a", 1));
    q.queue(ch("b"));
    q.queue(ch("a", 2));
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(sent).toHaveLength(1);
    expect(sent[0].changes.map((c: any) => [c.id, c.data.n])).toEqual([["a", 2], ["b", 1]]);
    expect(sent[0].keepalive).toBe(false);
  });

  it("hide() sends at once with keepalive, and the second hide event a close fires sends nothing more", async () => {
    const { q, sent, versions } = harness();
    q.queue(ch("a"));
    q.hide(); // visibilitychange: hidden
    q.hide(); // pagehide
    expect(sent).toHaveLength(1);
    expect(sent[0].keepalive).toBe(true);
    sent[0].resolve({ version: 5 });
    await flushMicrotasks();
    expect(versions).toEqual([5]);
    expect(q.size).toBe(0);
  });

  it("hide() during a normal in-flight push resends the batch with keepalive, and the version never goes backwards", async () => {
    const { q, sent, versions } = harness();
    q.queue(ch("a"));
    await vi.advanceTimersByTimeAsync(300); // normal push out
    q.hide();
    expect(sent).toHaveLength(2);
    expect(sent[1].keepalive).toBe(true);
    sent[1].resolve({ version: 8 }); // keepalive lands first
    await flushMicrotasks();
    sent[0].resolve({ version: 7 }); // the older push lands later
    await flushMicrotasks();
    expect(versions).toEqual([8, 7]);
    expect(q.size).toBe(0);
    expect(q.busy).toBe(false);
  });

  it("drain() (sign-out) waits for the in-flight push, then sends what was queued after it", async () => {
    const { q, sent } = harness();
    q.queue(ch("a"));
    await vi.advanceTimersByTimeAsync(300);
    q.queue(ch("b")); // typed while the first push is in flight
    const drained = q.drain();
    await flushMicrotasks();
    expect(sent).toHaveLength(1); // still waiting for the first one
    sent[0].resolve({ version: 1 });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(sent).toHaveLength(2);
    expect(sent[1].changes.map((c: any) => c.id)).toEqual(["b"]);
    sent[1].resolve({ version: 2 });
    await drained;
    expect(q.size).toBe(0);
  });

  it("an edit made while its record is in flight is kept for the next push", async () => {
    const { q, sent } = harness();
    q.queue(ch("a", 1));
    await vi.advanceTimersByTimeAsync(300);
    q.queue(ch("a", 2));
    sent[0].resolve({ version: 1 });
    await flushMicrotasks();
    expect(q.size).toBe(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(sent).toHaveLength(2);
    expect(sent[1].changes[0].data.n).toBe(2);
  });

  it("falls back to a normal request when a keepalive body would exceed the browser cap", () => {
    const { q, sent } = harness({ byteLength: () => KEEPALIVE_MAX_BYTES + 1 });
    q.queue(ch("a"));
    q.hide();
    expect(sent[0].keepalive).toBe(false);
  });

  it("retries a failed push after 2 s and clears everything on 401", async () => {
    const onAuthError = vi.fn();
    const { q, sent } = harness({ onAuthError });
    q.queue(ch("a"));
    await vi.advanceTimersByTimeAsync(300);
    sent[0].reject(new Error("boom"));
    await flushMicrotasks();
    expect(q.size).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toHaveLength(2);
    sent[1].reject(Object.assign(new Error("Not signed in"), { status: 401 }));
    await flushMicrotasks();
    expect(q.size).toBe(0);
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });
});
