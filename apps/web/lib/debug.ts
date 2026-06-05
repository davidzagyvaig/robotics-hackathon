// Fire-and-forget client logger → /api/debug-log → .debug/events.jsonl (read by Claude).
// Also mirrors to the browser console. Errors are swallowed so logging never breaks the app.

let t0 = 0;

/** Mark the start of a fresh recording (clears the log, resets the relative clock). */
export function debugReset(): void {
  t0 = typeof performance !== "undefined" ? performance.now() : 0;
  void post({ clear: true });
}

/** Append one event. `ms` is milliseconds since the last debugReset() — easy latency math. */
export function debugLog(type: string, data?: Record<string, unknown>): void {
  const ms = (typeof performance !== "undefined" ? performance.now() : 0) - t0;
  const event = { type, ms: Math.round(ms), ...data };
  // eslint-disable-next-line no-console
  console.log(`[dbg ${event.ms}ms] ${type}`, data ?? "");
  void post(event);
}

async function post(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    /* logging must never throw */
  }
}
