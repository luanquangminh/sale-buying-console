/*
 * The outbound side of the sync store, kept free of React so its timing can be tested.
 * Changes are keyed by kind:id (a later change to the same record replaces the earlier one),
 * pushed after a short debounce, and re-sent with keepalive when the tab is hidden or closed.
 */

export const PUSH_DELAY_MS = 300;
export const RETRY_DELAY_MS = 2000;
export const KEEPALIVE_MAX_BYTES = 60_000; // browsers cap keepalive bodies at 64 KiB, shared per page

const utf8Bytes = (s) => new TextEncoder().encode(s).byteLength;

export function createPushQueue({ send, onVersion, onAuthError, onError, delay = PUSH_DELAY_MS, byteLength = utf8Bytes }) {
  const pending = new Map();
  let timer = null;
  let inFlight = 0;            // pushes currently awaiting a response
  let keepaliveInFlight = false; // a hide-time push is out; a second hide event must not resend
  let latest = null;           // promise of the most recent push, for drain()

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const schedule = (ms = delay) => { if (timer) return; timer = setTimeout(() => { timer = null; flush(); }, ms); };

  function flush(opts = {}) {
    if (pending.size === 0) return Promise.resolve(false);
    if (inFlight > 0 && !opts.force) return Promise.resolve(false); // the in-flight push reschedules leftovers when it lands
    if (opts.keepalive && keepaliveInFlight) return Promise.resolve(false);
    const batch = Array.from(pending.entries());
    const changes = batch.map(([, change]) => change);
    const keepalive = !!opts.keepalive && byteLength(JSON.stringify({ changes })) < KEEPALIVE_MAX_BYTES;
    inFlight += 1;
    if (keepalive) keepaliveInFlight = true;
    const push = (async () => {
      try {
        const res = await send(changes, { keepalive });
        if (onVersion) onVersion(res.version);
        for (const [key, change] of batch) if (pending.get(key) === change) pending.delete(key); // newer edits stay queued
        return true;
      } catch (err) {
        if (err && err.status === 401) { pending.clear(); if (onAuthError) onAuthError(err); }
        else { if (onError) onError(err); schedule(RETRY_DELAY_MS); }
        return false;
      } finally {
        inFlight -= 1;
        if (keepalive) keepaliveInFlight = false;
        if (latest === push) latest = null;
        if (pending.size && inFlight === 0) schedule();
      }
    })();
    latest = push;
    return push;
  }

  return {
    /** Queue a change; it goes out after the debounce. */
    queue(change) { pending.set(`${change.kind}:${change.id}`, change); schedule(); },
    flush,
    /** Tab hidden or closing: skip the debounce and send with keepalive, even over an in-flight normal push (it may be aborted with the page). */
    hide() { if (!pending.size) return Promise.resolve(false); clearTimer(); return flush({ keepalive: true, force: true }); },
    /** Before sign-out: wait for whatever is in flight, then send everything still queued. */
    async drain() { clearTimer(); while (latest) { try { await latest; } catch { /* reported via onError */ } } await flush(); },
    clear() { pending.clear(); clearTimer(); },
    get size() { return pending.size; },
    get busy() { return inFlight > 0; },
  };
}
