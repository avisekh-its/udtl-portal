import { DataTable, type Column } from "@/components/data-table";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { LOAD_STATUSES, LOAD_STATUS_LABELS } from "@/lib/loads";
import { fetchPortalOrders } from "../order-data";

const fmtDate = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "America/Winnipeg" });
const fmtDateTime = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Winnipeg" });

// Quick-view field set (placeholder pending UDTL confirmation — FRD §17 #3).
const COLUMNS: Column[] = [
  { key: "order", header: "Order #", type: "link", linkTo: "/portal/orders/{id}", sticky: true, subKey: "load_reference" },
  { key: "reference", header: "Your reference", type: "muted" },
  { key: "route", header: "Route", type: "text" },
  { key: "status", header: "Status", type: "status", statusMap: LOAD_STATUS_MAP },
  { key: "pickup", header: "Pickup", type: "muted" },
  { key: "eta", header: "Live ETA", type: "muted" },
  { key: "updated", header: "Updated", type: "muted" },
];

export default async function PortalOrdersPage() {
  const orders = await fetchPortalOrders();

  const rows = orders.map((o) => ({
    id: o.id,
    order: o.ref,
    load_reference: o.ref !== o.loadReference ? o.loadReference : "",
    reference: o.customerReference ?? "",
    route: [o.origin, o.destination].filter(Boolean).join(" → ") || "—",
    status: o.status,
    pickup: o.pickupDate ? fmtDate.format(new Date(o.pickupDate)) : "",
    eta: o.liveEtaAt ? fmtDateTime.format(new Date(o.liveEtaAt)) : "",
    updated: fmtDate.format(new Date(o.updatedAt)),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
        <p className="mt-1 text-sm text-slate-500">Search and track all of your company&apos;s orders.</p>
      </div>

      <DataTable
        title="Your orders"
        columns={COLUMNS}
        rows={rows}
        searchKeys={["order", "load_reference", "reference", "route"]}
        filters={[
          {
            key: "status",
            label: "Status",
            options: LOAD_STATUSES.map((s) => ({ value: s, label: LOAD_STATUS_LABELS[s] })),
          },
        ]}
        exportFilename="orders"
        emptyMessage="No orders to show yet."
      />
    </div>
  );
}
