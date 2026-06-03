/**
 * UDTL FleetHunt polling worker — entry point.
 *
 * Why this exists (per Epic 0):
 *   - FRD §7 requires central polling: "every screen reads from our database,
 *     so many viewers create zero extra FleetHunt calls" (FR-TRACK-002)
 *   - FRD §7 caps the cadence at 60 req/min/key with multi-key support
 *     (FR-TRACK-004 + NFR-005). At 30s polling that's ~30 devices per key.
 *   - Vercel can't do persistent 30s polling cleanly (min cron = 1 min,
 *     no in-memory state across invocations). Hence Railway.
 *
 * Epic 0 scope: scaffold only. The actual poll loop, rate-limit budget,
 * multi-key rotation, ETA computation, and back-off land in Epic 4 (Tracking).
 */

import pino from "pino";
import * as Sentry from "@sentry/node";

const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.APP_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.APP_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
  log.info("sentry initialised");
}

const POLL_MS = Number.parseInt(process.env.FLEETHUNT_POLL_MS ?? "30000", 10);
const API_KEYS = (process.env.FLEETHUNT_API_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (API_KEYS.length === 0) {
  log.warn(
    "FLEETHUNT_API_KEYS is empty. Worker will run a heartbeat loop only. " +
      "Add keys before Epic 4.",
  );
}

log.info(
  { pollMs: POLL_MS, keyCount: API_KEYS.length },
  "UDTL polling worker starting",
);

let stopped = false;

async function pollOnce(): Promise<void> {
  // Epic 4 will implement:
  //  1. SELECT active loads with assigned devices
  //  2. Round-robin across API_KEYS, respecting 60/min budget per key
  //  3. Fetch /api/devices/<id> for each
  //  4. UPSERT into tracking_devices.last_* + INSERT into location_history
  //  5. Recompute ETA + distance for each load (cache on loads.live_*)
  //  6. Backoff on 429/503 (FR-TRACK-004)
  log.debug("poll tick");
}

async function loop(): Promise<void> {
  while (!stopped) {
    const started = Date.now();
    try {
      await pollOnce();
    } catch (err) {
      log.error({ err }, "poll failed");
      Sentry.captureException(err);
    }
    const elapsed = Date.now() - started;
    const waitMs = Math.max(POLL_MS - elapsed, 0);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function shutdown(signal: NodeJS.Signals): void {
  log.info({ signal }, "shutdown requested");
  stopped = true;
  // Give in-flight work 5s to drain, then exit.
  setTimeout(() => {
    log.info("exiting");
    process.exit(0);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

loop().catch((err) => {
  log.fatal({ err }, "loop crashed");
  Sentry.captureException(err);
  process.exit(1);
});
