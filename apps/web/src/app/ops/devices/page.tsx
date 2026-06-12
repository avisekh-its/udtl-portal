import { requireCapability } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { fleethuntMode } from "@/lib/fleethunt/client";
import { DataTable, type Column } from "@/components/data-table";
import { type StatusMap } from "@/components/status-chip";
import { TrackingActions } from "@/components/tracking-actions";

const GATEWAY_MAP: StatusMap = {
  yes: { label: "GPS gateway", tone: "success" },
  no: { label: "No gateway", tone: "warning" },
};
const ACTIVE_MAP: StatusMap = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
};

const COLUMNS: Column[] = [
  { key: "name", header: "Device", type: "primary", subKey: "asset", sticky: true },
  { key: "plate", header: "Plate", type: "muted" },
  { key: "gateway", header: "Gateway", type: "status", statusMap: GATEWAY_MAP },
  { key: "last_fix", header: "Last fix", type: "muted" },
  { key: "active", header: "Status", type: "status", statusMap: ACTIVE_MAP },
];

const fmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Winnipeg" });

interface DeviceRow {
  id: number;
  fleethunt_asset_id: string;
  name: string;
  plate: string | null;
  has_gps_gateway: boolean;
  active: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_fix_at: string | null;
}

export default async function DevicesPage() {
  await requireCapability("assign_tracking_device");
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("tracking_devices")
    .select("id, fleethunt_asset_id, name, plate, has_gps_gateway, active, last_lat, last_lng, last_fix_at")
    .order("name");

  const rows = ((data ?? []) as DeviceRow[]).map((d) => ({
    id: d.id,
    name: d.name,
    asset: d.fleethunt_asset_id,
    plate: d.plate ?? "",
    gateway: d.has_gps_gateway ? "yes" : "no",
    last_fix: !d.has_gps_gateway
      ? "—"
      : d.last_fix_at
        ? `${d.last_lat?.toFixed(3)}, ${d.last_lng?.toFixed(3)} · ${fmt.format(new Date(d.last_fix_at))}`
        : "No fix yet",
    active: d.active ? "active" : "inactive",
  }));

  const mode = fleethuntMode();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tracking devices</h1>
          <p className="mt-1 text-sm text-slate-500">
            FleetHunt assets, synced into UDTL.{" "}
            <span className="font-medium text-slate-600">Mode: {mode}</span>
            {mode === "mock" && " (simulated data — set FLEETHUNT_API_KEYS to go live)"}
          </p>
        </div>
        <TrackingActions />
      </div>

      <DataTable
        title="All devices"
        columns={COLUMNS}
        rows={rows}
        searchKeys={["name", "asset", "plate"]}
        filters={[
          { key: "gateway", label: "Gateway", options: [{ value: "yes", label: "Has gateway" }, { value: "no", label: "No gateway" }] },
        ]}
        exportFilename="devices"
        emptyMessage={mode === "off" ? "FleetHunt isn't configured yet." : "No devices yet — click Sync devices."}
      />
    </div>
  );
}
