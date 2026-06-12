"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { syncDevices } from "@/lib/tracking/sync";
import { pollActiveLoads } from "@/lib/tracking/poll";

export interface TrackingResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** On-demand asset sync (FR-TRACK-001 "refresh on demand"). Admin/Staff. */
export async function syncDevicesAction(): Promise<TrackingResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "assign_tracking_device")) return { error: "You don't have permission." };
  const admin = createServiceClient();
  try {
    const r = await syncDevices(admin);
    await writeAudit({
      actorUserId: actor.id,
      action: "fleethunt.synced",
      entityType: "device",
      entityId: "all",
      after: r,
      ip: await getRequestIp(),
    });
    revalidatePath("/ops/devices");
    return { ok: true, message: `Synced ${r.synced} device(s) (mode: ${r.mode}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
}

/** Trigger a poll sweep now (otherwise runs on the Vercel cron). Admin/Staff. */
export async function pollNowAction(): Promise<TrackingResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "assign_tracking_device")) return { error: "You don't have permission." };
  const admin = createServiceClient();
  try {
    const r = await pollActiveLoads(admin);
    revalidatePath("/ops/devices");
    return {
      ok: true,
      message: `Polled ${r.devicesPolled} device(s), updated ${r.loadsUpdated} load(s)${
        r.skippedNoBudget ? `, ${r.skippedNoBudget} skipped (rate budget)` : ""
      } (mode: ${r.mode}).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Poll failed." };
  }
}
