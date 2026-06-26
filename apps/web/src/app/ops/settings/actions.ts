"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, can } from "@/lib/auth";
import { setSetting, setDigestTimes, SETTING_COST_VISIBLE, SETTING_DIGEST_TIMES } from "@/lib/settings";
import { getRequestIp, writeAudit } from "@/lib/audit";

export interface SettingResult {
  ok?: boolean;
  error?: string;
}

/** Toggle whether per-load cost is visible to customers (FRD §18 #5). Admin only. */
export async function setCostVisibilityAction(visible: boolean): Promise<SettingResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "manage_system_settings")) {
    return { error: "Only a UDTL Admin can change system settings." };
  }

  await setSetting(SETTING_COST_VISIBLE, visible, actor.id);
  await writeAudit({
    actorUserId: actor.id,
    action: "settings.cost_visibility_changed",
    entityType: "setting",
    entityId: SETTING_COST_VISIBLE,
    after: { visible },
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/settings");
  return { ok: true };
}

/** Set the twice-daily digest send times ("HH:MM", America/Winnipeg). Admin only. */
export async function setDigestTimesAction(times: string[]): Promise<SettingResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "manage_system_settings")) {
    return { error: "Only a UDTL Admin can change system settings." };
  }
  const valid = times
    .map((t) => t.trim())
    .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  if (valid.length === 0) return { error: "Enter at least one valid time (HH:MM)." };

  await setDigestTimes(valid, actor.id);
  await writeAudit({
    actorUserId: actor.id,
    action: "settings.digest_times_changed",
    entityType: "setting",
    entityId: SETTING_DIGEST_TIMES,
    after: { times: valid },
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/settings");
  return { ok: true };
}
