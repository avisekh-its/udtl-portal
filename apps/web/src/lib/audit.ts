/**
 * Audit logging service (FRD §13.2 / FR-AUDIT-001).
 *
 * One place to record sensitive actions: who / what / when / IP, with optional
 * before+after snapshots. Writes via the service-role client so an audit row is
 * never blocked by the actor's RLS, and so later epics (load edits, status
 * changes, device assignment, link generation) can call it uniformly.
 *
 * Auditing must never break the user's action — every failure is swallowed and
 * surfaced to the server log only.
 */
import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

export interface AuditEntry {
  /** The acting user's id, or null for unauthenticated/system actions. */
  actorUserId: string | null;
  /** Dotted action name, e.g. "auth.login", "load.status_changed". */
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

/** Write one audit row. Safe to await without try/catch — it never throws. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createServiceClient();
    const { error } = await admin.from("audit_log").insert({
      actor_user_id: entry.actorUserId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      source_ip: entry.ip ?? null,
    });
    if (error) console.error("[audit] insert failed:", error.message);
  } catch (e) {
    console.error("[audit] unexpected error:", e);
  }
}
