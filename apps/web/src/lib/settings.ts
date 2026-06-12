/**
 * App settings (key/value) helpers — FRD §18 #5 (cost visibility), and the home
 * for future toggles (digest times, etc.). Reads/writes via the service client.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export const SETTING_COST_VISIBLE = "cost_visible_to_customers";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const admin = createServiceClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", key).single();
  return (data?.value ?? fallback) as T;
}

export async function setSetting(key: string, value: unknown, userId: string | null): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId });
}

/** Whether per-load cost is shown to customers (default true per Meeting 2). */
export async function isCostVisibleToCustomers(): Promise<boolean> {
  return getSetting<boolean>(SETTING_COST_VISIBLE, true);
}
