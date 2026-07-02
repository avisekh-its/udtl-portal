import Link from "next/link";
import { requireCapability, can } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { DataTable, type Column, type RowAction } from "@/components/data-table";
import { IconDownload } from "@/components/icons";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { LOAD_STATUS_LABELS, LOAD_STATUSES } from "@/lib/loads";

const COLUMNS: Column[] = [
  { key: "order_no", header: "Order #", type: "link", linkTo: "/ops/loads/{id}", sticky: true, subKey: "load_reference" },
  { key: "customer", header: "Customer", type: "text" },
  { key: "status", header: "Status", type: "status", statusMap: LOAD_STATUS_MAP },
  { key: "amount", header: "Amount", type: "muted" },
  { key: "stops", header: "Stops", type: "muted", align: "right" },
  { key: "updated", header: "Updated", type: "muted" },
];

const EDIT_ACTIONS: RowAction[] = [{ key: "edit", label: "Edit", linkTo: "/ops/loads/{id}" }];
const VIEW_ACTIONS: RowAction[] = [{ key: "view", label: "View", linkTo: "/ops/loads/{id}" }];

const fmtDate = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "America/Winnipeg" });

function money(cents: number | null, currency: string | null): string {
  if (cents === null || cents === undefined) return "";
  return `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2 })} ${currency ?? "CAD"}`;
}

interface LoadListRow {
  id: number;
  load_reference: string;
  order_number: string | null;
  status: string;
  per_load_cost_cents: number | null;
  per_load_cost_currency: string | null;
  updated_at: string;
  organization: { name: string } | { name: string }[] | null;
  stops: { count: number }[];
}

export default async function LoadsPage() {
  const actor = await requireCapability("view_all_loads");
  const canEdit = can(actor.role, "create_edit_loads");
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("loads")
    .select(
      "id, load_reference, order_number, status, per_load_cost_cents, per_load_cost_currency, updated_at, organization:organization_id ( name ), stops ( count )",
    )
    .order("updated_at", { ascending: false });

  const rows = ((data ?? []) as unknown as LoadListRow[]).map((l) => {
    const org = Array.isArray(l.organization) ? l.organization[0] : l.organization;
    return {
      id: l.id,
      order_no: l.order_number || l.load_reference,
      load_reference: l.order_number ? l.load_reference : "",
      customer: org?.name ?? "—",
      status: l.status,
      amount: money(l.per_load_cost_cents, l.per_load_cost_currency),
      stops: String(l.stops?.[0]?.count ?? 0),
      updated: fmtDate.format(new Date(l.updated_at)),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Loads</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canEdit ? "Create and manage orders and their stops." : "View orders and their stops."}
          </p>
        </div>
        {canEdit && (
          <Link
            href="/ops/loads/import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <IconDownload className="h-4 w-4" /> Import orders
          </Link>
        )}
      </div>

      <DataTable
        title="All loads"
        columns={COLUMNS}
        rows={rows}
        searchKeys={["order_no", "load_reference", "customer"]}
        filters={[
          {
            key: "status",
            label: "Status",
            options: LOAD_STATUSES.map((s) => ({ value: s, label: LOAD_STATUS_LABELS[s] })),
          },
        ]}
        exportFilename="loads"
        emptyMessage={canEdit ? "No loads yet. Create your first one." : "No loads yet."}
        headerAction={canEdit ? { label: "New load", href: "/ops/loads/new" } : undefined}
        rowActions={canEdit ? EDIT_ACTIONS : VIEW_ACTIONS}
      />
    </div>
  );
}
