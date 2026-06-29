"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, can } from "@/lib/auth";
import {
  setSetting,
  setDigestTimes,
  setReportSchedule,
  SETTING_COST_VISIBLE,
  SETTING_DIGEST_TIMES,
  SETTING_REPORT_SCHEDULE,
  type ReportSchedule,
} from "@/lib/settings";
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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Configure the weekly performance-report email (Epic 12). Admin only. */
export async function setReportScheduleAction(schedule: ReportSchedule): Promise<SettingResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "manage_system_settings")) {
    return { error: "Only a UDTL Admin can change system settings." };
  }
  const day = Number.isInteger(schedule.day) && schedule.day >= 0 && schedule.day <= 6 ? schedule.day : 1;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) return { error: "Enter a valid time (HH:MM)." };
  const recipients = (schedule.recipients ?? []).map((r) => r.trim()).filter(Boolean);
  const bad = recipients.find((r) => !EMAIL_RE.test(r));
  if (bad) return { error: `Not a valid email: ${bad}` };
  if (schedule.enabled && recipients.length === 0) {
    return { error: "Add at least one recipient to turn the report on." };
  }

  const clean: ReportSchedule = { enabled: !!schedule.enabled, day, time: schedule.time, recipients };
  await setReportSchedule(clean, actor.id);
  await writeAudit({
    actorUserId: actor.id,
    action: "settings.report_schedule_changed",
    entityType: "setting",
    entityId: SETTING_REPORT_SCHEDULE,
    after: { ...clean, recipients: recipients.length },
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
