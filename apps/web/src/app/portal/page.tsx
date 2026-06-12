import { getCurrentUser, isStaff } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/kpi-card";
import { IconBox, IconNavigation, IconCheckCircle } from "@/components/icons";
import { DataTable, type Column } from "@/components/data-table";
import { LOAD_STATUS_MAP } from "@/components/status-badge";

const SHIPMENT_COLUMNS: Column[] = [
  { key: "reference", header: "Load", type: "mono", sticky: true },
  { key: "customer_reference", header: "Your reference", type: "muted" },
  { key: "status", header: "Status", type: "status", statusMap: LOAD_STATUS_MAP },
];

/**
 * Customer dashboard. Proves RBAC end-to-end: the load list is fetched with the
 * USER'S session, so RLS returns only loads they may see (their org, or just
 * their assigned loads if restricted).
 */
export default async function PortalHome() {
  const user = (await getCurrentUser())!; // layout guaranteed a user
  const supabase = await createServerClient();

  const { data: loads } = await supabase
    .from("loads")
    .select("load_reference, status, customer_reference")
    .order("load_reference");

  const rows = loads ?? [];
  const inTransit = rows.filter((l) => l.status === "in_transit").length;
  const delivered = rows.filter((l) => l.status === "delivered").length;
  const active = rows.filter((l) => l.status !== "delivered" && l.status !== "cancelled").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Welcome{user.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isStaff(user.role)
            ? "Viewing the customer portal as UDTL staff."
            : user.restricted
              ? "The specific shipments assigned to you."
              : "Your company's shipments at a glance."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Active shipments" value={active} accent="var(--color-secondary)" icon={<IconBox />} />
        <KpiCard label="In transit" value={inTransit} accent="var(--color-accent)" icon={<IconNavigation />} />
        <KpiCard label="Delivered" value={delivered} accent="var(--color-success)" icon={<IconCheckCircle />} />
      </div>

      <DataTable
        title="Your shipments"
        columns={SHIPMENT_COLUMNS}
        rows={rows.map((l) => ({
          reference: l.load_reference,
          customer_reference: l.customer_reference ?? "",
          status: l.status,
        }))}
        idKey="reference"
        searchKeys={["reference", "customer_reference"]}
        filters={[
          {
            key: "status",
            label: "Status",
            options: Object.entries(LOAD_STATUS_MAP).map(([value, v]) => ({ value, label: v.label })),
          },
        ]}
        exportFilename="shipments"
        emptyMessage="No shipments to show yet."
      />
    </div>
  );
}
