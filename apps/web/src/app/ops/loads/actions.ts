"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { writeLoad } from "@/lib/loads-write";
import {
  validateLoadInput,
  isBackwardTransition,
  type LoadInput,
  type LoadStatus,
} from "@/lib/loads";
import { notifyLoadEvent, eventForStatus } from "@/lib/notifications/dispatch";

export interface LoadActionResult {
  ok?: boolean;
  id?: number;
  error?: string;
}

/**
 * Create or edit a load mapped to UDTL's order sheet: 1 shipper + 1+ consignees,
 * each stop with a commodity block; order-level charges → total (FR-OPS-010).
 * Edit replaces the stop/commodity/charge set wholesale. Status is changed via
 * updateLoadStatusAction, not here.
 */
export async function saveLoadAction(
  input: LoadInput,
  loadId?: number,
): Promise<LoadActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "create_edit_loads")) {
    return { error: "You don't have permission to manage loads." };
  }

  const invalid = validateLoadInput(input, { requireAccountManager: true });
  if (invalid) return { error: invalid };

  const admin = createServiceClient();

  let priorAm: string | null = null;
  if (loadId) {
    const { data: prev } = await admin
      .from("loads")
      .select("account_manager_id")
      .eq("id", loadId)
      .single();
    priorAm = (prev?.account_manager_id as string | null) ?? null;
  }

  let id: number;
  let total: number;
  try {
    const res = await writeLoad(admin, input, { actorId: actor.id, existingId: loadId });
    id = res.id;
    total = res.total;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the load." };
  }

  await writeAudit({
    actorUserId: actor.id,
    action: loadId ? "load.updated" : "load.created",
    entityType: "load",
    entityId: String(id),
    after: { organizationId: input.organizationId, stops: input.stops.length, total },
    ip: await getRequestIp(),
  });

  // Dedicated Account-Manager audit so comment-routing (Epic 10) has a clean trail.
  const newAm = input.accountManagerId || null;
  if (newAm !== priorAm) {
    await writeAudit({
      actorUserId: actor.id,
      action: newAm ? "load.am_assigned" : "load.am_cleared",
      entityType: "load",
      entityId: String(id),
      before: { accountManagerId: priorAm },
      after: { accountManagerId: newAm },
      ip: await getRequestIp(),
    });
  }

  revalidatePath("/ops/loads");
  if (id) revalidatePath(`/ops/loads/${id}`);
  return { ok: true, id };
}

/**
 * Assign / change / clear the FleetHunt tracking device on a load (FR-TRACK-003).
 * Pass deviceId=null to clear. Non-gateway devices are allowed but flagged by the
 * picker; the load simply won't produce live positions. All changes audited.
 */
export async function assignDeviceAction(
  loadId: number,
  deviceId: number | null,
): Promise<LoadActionResult & { message?: string }> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "assign_tracking_device")) {
    return { error: "You don't have permission to assign tracking devices." };
  }

  const admin = createServiceClient();

  const { data: load, error: loadErr } = await admin
    .from("loads")
    .select("id, load_reference, tracking_device_id")
    .eq("id", loadId)
    .single();
  if (loadErr || !load) return { error: "Load not found." };

  const prevDeviceId = (load.tracking_device_id as number | null) ?? null;
  if (prevDeviceId === deviceId) return { ok: true, id: loadId, message: "No change." };

  let deviceName: string | null = null;
  if (deviceId !== null) {
    const { data: device } = await admin
      .from("tracking_devices")
      .select("id, name, active")
      .eq("id", deviceId)
      .single();
    if (!device) return { error: "That device no longer exists." };
    if (!device.active) return { error: "That device is inactive in FleetHunt." };
    deviceName = device.name as string;

    // A device can only track one active load at a time — otherwise the poll
    // writes the same position/ETA to both and the map badge is ambiguous.
    const { data: clash } = await admin
      .from("loads")
      .select("id, load_reference, order_number")
      .eq("tracking_device_id", deviceId)
      .in("status", ["new", "assigned", "in_transit"])
      .neq("id", loadId)
      .maybeSingle();
    if (clash) {
      const ref = (clash.order_number as string) || (clash.load_reference as string);
      return { error: `That device is already tracking ${ref}. Clear it there first.` };
    }
  }

  // Clearing the device also drops the now-stale live position cache on the load.
  const patch: Record<string, unknown> = {
    tracking_device_id: deviceId,
    updated_at: new Date().toISOString(),
  };
  if (deviceId === null) {
    patch.live_eta_at = null;
    patch.live_distance_km = null;
    patch.live_eta_computed_at = null;
    patch.metadata = null;
  }

  const { error } = await admin.from("loads").update(patch).eq("id", loadId);
  if (error) return { error: error.message };

  const action =
    deviceId === null ? "load.device_cleared" : prevDeviceId === null ? "load.device_assigned" : "load.device_changed";
  await writeAudit({
    actorUserId: actor.id,
    action,
    entityType: "load",
    entityId: String(loadId),
    before: { trackingDeviceId: prevDeviceId },
    after: { trackingDeviceId: deviceId },
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/loads");
  revalidatePath(`/ops/loads/${loadId}`);
  revalidatePath("/ops/map");
  return {
    ok: true,
    id: loadId,
    message:
      deviceId === null
        ? "Device cleared — this load is no longer tracked."
        : `Now tracking with ${deviceName}.`,
  };
}

/** Change a load's status; backward moves are audited as exceptions (FRD §6). */
export async function updateLoadStatusAction(
  loadId: number,
  newStatus: LoadStatus,
): Promise<LoadActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "update_status_dates_cost")) {
    return { error: "You don't have permission to change load status." };
  }

  const admin = createServiceClient();
  const { data: current, error: readErr } = await admin
    .from("loads")
    .select("status")
    .eq("id", loadId)
    .single();
  if (readErr || !current) return { error: "Load not found." };

  const from = current.status as LoadStatus;
  if (from === newStatus) return { ok: true, id: loadId };

  const backward = isBackwardTransition(from, newStatus);

  const { error } = await admin
    .from("loads")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", loadId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: backward ? "load.status_reverted" : "load.status_changed",
    entityType: "load",
    entityId: String(loadId),
    before: { status: from },
    after: { status: newStatus, exception: backward },
    ip: await getRequestIp(),
  });

  // Auto-notify subscribers of this load's new status (Epic 9). Best-effort.
  const event = eventForStatus(newStatus);
  if (event) await notifyLoadEvent(loadId, event);

  revalidatePath("/ops/loads");
  revalidatePath(`/ops/loads/${loadId}`);
  return { ok: true, id: loadId };
}

/**
 * Manually send a "Delayed" alert to a load's subscribers (FRD §9, Epic 9).
 * Does NOT change the load status — it's an out-of-band heads-up. Admin/Staff.
 */
export async function sendDelayedAlertAction(loadId: number): Promise<LoadActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "trigger_delayed_or_rating")) {
    return { error: "You don't have permission to send a delayed alert." };
  }
  await notifyLoadEvent(loadId, "delayed");
  await writeAudit({
    actorUserId: actor.id,
    action: "load.delayed_alert_sent",
    entityType: "load",
    entityId: String(loadId),
    ip: await getRequestIp(),
  });
  return { ok: true, id: loadId };
}
