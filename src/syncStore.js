/*
 * Server-backed replacement for the artifact's useState slices.
 *
 * The UI's store logic stays exactly as written; each slice setter still takes a value or an
 * updater. This hook diffs the previous and next slice per record and hands the changed records to
 * a push queue (src/pushQueue.js) that batches them to POST /api/sync. A version poll pulls other
 * people's changes while the tab is visible.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { diffSlice } from "./sliceDiff";
import { createPushQueue } from "./pushQueue";

const POLL_MS = 20_000;

export function useSyncStore({ onRemote } = {}) {
  const [user, setUser] = useState(undefined); // undefined = checking session, null = signed out
  const [slices, setSlices] = useState(null);
  const version = useRef(0);
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;

  const queue = useRef(null);
  if (!queue.current) {
    queue.current = createPushQueue({
      send: (changes, opts) => api.sync(changes, opts),
      onVersion: (v) => { version.current = Math.max(version.current, v); },
      onAuthError: () => setUser(null),
      onError: (err) => console.error("sync failed, will retry", err),
    });
  }

  const loadState = useCallback(async () => {
    const res = await api.state();
    version.current = res.version;
    const next = onRemoteRef.current ? onRemoteRef.current(res.slices) : res.slices;
    setSlices(next);
  }, []);

  const setSlice = useCallback((name, updater, meta) => {
    setSlices((prev) => {
      if (!prev) return prev;
      const current = prev[name];
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next === current) return prev;
      for (const change of diffSlice(name, current, next)) queue.current.queue(meta ? { ...change, ...meta } : change);
      return { ...prev, [name]: next };
    });
  }, []);

  // Session check on mount.
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  // Load the snapshot after sign-in; drop it on sign-out.
  useEffect(() => {
    if (!user) { setSlices(null); return; }
    loadState().catch((err) => { if (err && err.status === 401) setUser(null); else console.error(err); });
  }, [user, loadState]);

  // Poll for other people's changes.
  useEffect(() => {
    if (!user) return undefined;
    let stopped = false;
    const tick = async () => {
      const q = queue.current;
      if (stopped || document.visibilityState !== "visible" || q.size || q.busy) return;
      try {
        const res = await api.version();
        if (!stopped && res.version !== version.current) await loadState();
      } catch (err) {
        if (err && err.status === 401) setUser(null);
      }
    };
    const id = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => { stopped = true; clearInterval(id); window.removeEventListener("focus", tick); };
  }, [user, loadState]);

  // Tab hidden or closing: push what is pending at once (keepalive). The queue ignores the second
  // of the two events a close fires, so nothing is sent twice.
  useEffect(() => {
    const onHide = () => { queue.current.hide(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") onHide(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await queue.current.drain(); // in-flight push first, then anything queued meanwhile
    try { await api.logout(); } catch { /* cookie is gone either way */ }
    setUser(null);
  }, []);

  return { user, slices, setSlice, login, logout };
}
