import { requireCapability } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { DataTable, type Column, type RowAction } from "@/components/data-table";
import { type StatusMap } from "@/components/status-chip";
import { orgRowAction } from "./actions";

const STATUS_MAP: StatusMap = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
};

const COLUMNS: Column[] = [
  { key: "name", header: "Company", type: "link", linkTo: "/ops/customers/{id}", sticky: true },
  { key: "primary_contact", header: "Primary contact", type: "text" },
  { key: "location", header: "Location", type: "muted" },
  { key: "status", header: "Status", type: "status", statusMap: STATUS_MAP },
];

const ROW_ACTIONS: RowAction[] = [
  { key: "edit", label: "Edit", linkTo: "/ops/customers/{id}" },
  {
    key: "deactivate",
    label: "Deactivate",
    danger: true,
    showWhen: { key: "active", equals: true },
    confirm: {
      title: "Deactivate this customer?",
      message:
        "{name} and all of their portal users will immediately lose access. You can reactivate them at any time.",
      confirmLabel: "Deactivate",
    },
  },
  {
    key: "reactivate",
    label: "Reactivate",
    showWhen: { key: "active", equals: false },
    confirm: {
      title: "Reactivate this customer?",
      message: "{name} will be restored as an active customer.",
      confirmLabel: "Reactivate",
    },
  },
];

/** Customer organizations list (FR-OPS-001). Staff/Admin only. */
export default async function CustomersPage() {
  await requireCapability("manage_customer_orgs");
  const supabase = await createServerClient();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, primary_contact_name, city, region, active")
    .order("name");

  const rows = (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    primary_contact: o.primary_contact_name ?? "",
    location: [o.city, o.region].filter(Boolean).join(", "),
    status: o.active ? "active" : "inactive",
    active: o.active,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">Onboard and manage customer companies.</p>
      </div>

      <DataTable
        title="All customers"
        columns={COLUMNS}
        rows={rows}
        searchKeys={["name", "primary_contact", "location"]}
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
        ]}
        exportFilename="customers"
        emptyMessage="No customers yet. Create your first one."
        headerAction={{ label: "New customer", href: "/ops/customers/new" }}
        rowActions={ROW_ACTIONS}
        onRowAction={orgRowAction}
      />
    </div>
  );
}
