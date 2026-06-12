"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, can } from "@/lib/auth";
import { setSetting, SETTING_COST_VISIBLE } from "@/lib/settings";
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
