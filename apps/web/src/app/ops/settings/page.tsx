import { requireCapability } from "@/lib/auth";
import { isCostVisibleToCustomers } from "@/lib/settings";
import { SettingsCostToggle } from "@/components/settings-cost-toggle";

/** System settings — UDTL Admin only (manage_system_settings). */
export default async function SettingsPage() {
  await requireCapability("manage_system_settings");
  const costVisible = await isCostVisibleToCustomers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">System-wide configuration for UDTL.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Customer visibility</h2>
        <SettingsCostToggle initial={costVisible} />
      </section>
    </div>
  );
}
