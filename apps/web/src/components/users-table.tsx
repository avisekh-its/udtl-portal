import { DataTable, type Column, type RowAction } from "@/components/data-table";
import { type StatusMap } from "@/components/status-chip";
import { userRowAction } from "@/app/ops/users/actions";

const ROLE_LABELS: Record<string, string> = {
  udtl_admin: "UDTL Admin",
  udtl_staff: "UDTL Staff",
  udtl_account_manager: "Account Manager",
  customer_admin: "Customer Admin",
  customer_user: "Customer User",
};

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organization_id: string | null;
  restricted?: boolean;
  active: boolean;
  credit_form_required?: boolean;
  credit_form_received?: boolean;
}

const STATUS_MAP: StatusMap = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  awaiting_credit: { label: "Awaiting credit", tone: "warning" },
};

const COLUMNS: Column[] = [
  { key: "display", header: "User", type: "primary", subKey: "email", sticky: true },
  { key: "role_label", header: "Role", type: "text" },
  { key: "org_name", header: "Organization", type: "muted" },
  { key: "status", header: "Status", type: "status", statusMap: STATUS_MAP },
];

const ROW_ACTIONS: RowAction[] = [
  {
    key: "mark_credit_received",
    label: "Mark credit received",
    showWhen: { key: "credit_status", equals: "awaiting" },
    confirm: {
      title: "Mark credit received?",
      message:
        "This confirms UDTL has received the completed credit application for {display} and activates their account immediately.",
      confirmLabel: "Mark received",
    },
  },
  {
    key: "deactivate",
    label: "Deactivate",
    danger: true,
    showWhen: { key: "active", equals: true },
    confirm: {
      title: "Deactivate this user?",
      message: "{display} will immediately lose access to the portal. You can reactivate them at any time.",
      confirmLabel: "Deactivate",
    },
  },
  {
    key: "reactivate",
    label: "Reactivate",
    showWhen: { key: "active", equals: false },
    confirm: {
      title: "Reactivate this user?",
      message: "{display} will regain portal access right away.",
      confirmLabel: "Reactivate",
    },
  },
];

/**
 * @param manage      when true, shows the kebab actions (activate/deactivate,
 *                    mark credit received).
 * @param currentUserId the viewer's id — its row never shows actions (no self-lockout).
 */
export function UsersTable({
  users,
  orgNames,
  manage = false,
  currentUserId,
  title = "Users",
  linkTo,
}: {
  users: UserRow[];
  orgNames: Record<string, string>;
  manage?: boolean;
  currentUserId?: string;
  title?: string;
  /** When set, the user name links to this template (e.g. "/portal/users/{id}"). */
  linkTo?: string;
}) {
  const columns: Column[] = linkTo
    ? [{ key: "display", header: "User", type: "link", linkTo, subKey: "email", sticky: true }, ...COLUMNS.slice(1)]
    : COLUMNS;
  const rows = users.map((u) => {
    const awaitingCredit = !!u.credit_form_required && !u.credit_form_received;
    return {
      id: u.id,
      display: u.name || u.email,
      email: u.name ? u.email : "",
      role_label: (ROLE_LABELS[u.role] ?? u.role) + (u.restricted ? " · Restricted" : ""),
      org_name: u.organization_id ? (orgNames[u.organization_id] ?? "—") : "UDTL",
      status: u.active ? "active" : awaitingCredit ? "awaiting_credit" : "inactive",
      active: u.active,
      credit_status: awaitingCredit ? "awaiting" : "na",
    };
  });

  return (
    <DataTable
      title={title}
      columns={columns}
      rows={rows}
      searchKeys={["display", "email", "role_label", "org_name"]}
      filters={[
        {
          key: "status",
          label: "Status",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "awaiting_credit", label: "Awaiting credit" },
          ],
        },
      ]}
      exportFilename="users"
      emptyMessage="No users yet."
      rowActions={manage ? ROW_ACTIONS : []}
      onRowAction={manage ? userRowAction : undefined}
      hideActionsForRowId={currentUserId}
    />
  );
}
