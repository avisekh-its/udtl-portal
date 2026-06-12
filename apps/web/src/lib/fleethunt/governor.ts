/**
 * Rate-limit governor (FR-TRACK-004 / NFR-005).
 *
 * Enforces ≤60 calls/min PER KEY across multiple keys, with 429/503 back-off.
 * Per-key window + back-off state is persisted in `fleethunt_key_state` so the
 * budget survives across stateless cron invocations. This is real, testable
 * logic — the project's core technical risk — and needs no external API.
 *
 * Device-per-key math: a key does 60 calls/min. Polling each active device once
 * per minute (cron every 60s) → one key covers ~60 devices; the 80–100 active-
 * load ceiling needs ~2 keys at 60s cadence. Adding a key linearly adds 60
 * devices of headroom.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.FLEETHUNT_MAX_PER_MIN ?? 60);
const BACKOFF_MS = Number(process.env.FLEETHUNT_BACKOFF_MS ?? 30_000);

interface KeyState {
  keyIndex: number;
  windowStartedAt: number;
  callCount: number;
  backoffUntil: number | null;
}

export class RateGovernor {
  private constructor(private states: KeyState[]) {}

  static async load(admin: SupabaseClient, keyCount: number): Promise<RateGovernor> {
    const { data } = await admin
      .from("fleethunt_key_state")
      .select("key_index, window_started_at, call_count, backoff_until");
    const byIndex = new Map<number, Record<string, unknown>>();
    for (const r of data ?? []) byIndex.set(r.key_index as number, r);

    const now = Date.now();
    const states: KeyState[] = [];
    for (let i = 0; i < keyCount; i++) {
      const r = byIndex.get(i);
      let windowStartedAt = r ? new Date(r.window_started_at as string).getTime() : now;
      let callCount = r ? (r.call_count as number) : 0;
      const backoffUntil = r?.backoff_until ? new Date(r.backoff_until as string).getTime() : null;
      // Roll the window if it's older than a minute.
      if (now - windowStartedAt >= WINDOW_MS) {
        windowStartedAt = now;
        callCount = 0;
      }
      states.push({ keyIndex: i, windowStartedAt, callCount, backoffUntil });
    }
    return new RateGovernor(states);
  }

  /** Reserve one call on the least-loaded available key, or null if all are
   *  exhausted / backed-off. */
  acquire(): number | null {
    const now = Date.now();
    let best: KeyState | null = null;
    for (const s of this.states) {
      if (s.backoffUntil && now < s.backoffUntil) continue;
      if (s.callCount >= MAX_PER_WINDOW) continue;
      if (!best || s.callCount < best.callCount) best = s;
    }
    if (!best) return null;
    best.callCount += 1;
    return best.keyIndex;
  }

  reportError(keyIndex: number, status: number): void {
    if (status === 429 || status === 503) {
      const s = this.states[keyIndex];
      if (s) s.backoffUntil = Date.now() + BACKOFF_MS;
    }
  }

  async flush(admin: SupabaseClient): Promise<void> {
    const rows = this.states.map((s) => ({
      key_index: s.keyIndex,
      window_started_at: new Date(s.windowStartedAt).toISOString(),
      call_count: s.callCount,
      backoff_until: s.backoffUntil ? new Date(s.backoffUntil).toISOString() : null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) await admin.from("fleethunt_key_state").upsert(rows, { onConflict: "key_index" });
  }

  snapshot(): KeyState[] {
    return this.states.map((s) => ({ ...s }));
  }
}
