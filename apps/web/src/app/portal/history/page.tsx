import { DataTable, type Column } from "@/components/data-table";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { fetchPortalOrders } from "../order-data";

const fmtDate = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "America/Winnipeg" });

const COLUMNS: Column[] = [
  { key: "order", header: "Order #", type: "link", linkTo: "/portal/orders/{id}", sticky: true, subKey: "load_reference" },
  { key: "reference", header: "Your reference", type: "muted" },
  { key: "route", header: "Route", type: "text" },
  { key: "status", header: "Status", type: "status", statusMap: LOAD_STATUS_MAP },
  { key: "updated", header: "Completed", type: "muted" },
];

const ARCHIVE_STATUSES = ["delivered", "cancelled"];

/** Order history archive — completed (delivered/cancelled) orders, with CSV export. */
export default async function PortalHistoryPage() {
  const orders = (await fetchPortalOrders()).filter((o) => ARCHIVE_STATUSES.includes(o.status));

  const rows = orders.map((o) => ({
    id: o.id,
    order: o.ref,
    load_reference: o.ref !== o.loadReference ? o.loadReference : "",
    reference: o.customerReference ?? "",
    route: [o.origin, o.destination].filter(Boolean).join(" → ") || "—",
    status: o.status,
    updated: fmtDate.format(new Date(o.updatedAt)),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">History</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your completed orders. Use Export to download the archive as CSV.
        </p>
      </div>

      <DataTable
        title="Completed orders"
        columns={COLUMNS}
        rows={rows}
        searchKeys={["order", "load_reference", "reference", "route"]}
        filters={[
          {
            key: "status",
            label: "Status",
            options: ARCHIVE_STATUSES.map((s) => ({ value: s, label: LOAD_STATUS_MAP[s]?.label ?? s })),
          },
        ]}
        exportFilename="order-history"
        emptyMessage="No completed orders yet."
      />
    </div>
  );
}
