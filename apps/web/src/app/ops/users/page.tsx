import { requireStaff, STAFF_ROLES } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { InviteForm, type RoleOption } from "@/components/invite-form";
import { UsersTable, type UserRow } from "@/components/users-table";

// UDTL-internal staff roles only. Customer Admins / Users are managed per-org
// under Customers, not here.
const STAFF_ROLE_OPTIONS: RoleOption[] = [
  { value: "udtl_admin", label: "UDTL Admin", isCustomer: false },
  { value: "udtl_staff", label: "UDTL Staff", isCustomer: false },
  { value: "udtl_account_manager", label: "Account Manager", isCustomer: false },
];

/** UDTL staff administration. Only an Admin can invite staff (FRD §4). */
export default async function OpsUsersPage() {
  const actor = await requireStaff();
  const supabase = await createServerClient();

  // Internal staff only — customer users live under their organization.
  const { data: users } = await supabase
    .from("users")
    .select("id, email, name, role, organization_id, restricted, active, credit_form_required, credit_form_received")
    .in("role", STAFF_ROLES)
    .order("email");

  const canInviteStaff = actor.role === "udtl_admin";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          UDTL staff accounts. Customer users are managed under each company in{" "}
          <span className="font-medium text-slate-600">Customers</span>.
        </p>
      </div>

      {canInviteStaff && <InviteForm roleOptions={STAFF_ROLE_OPTIONS} orgs={[]} />}

      <UsersTable
        title="UDTL staff"
        users={(users ?? []) as UserRow[]}
        orgNames={{}}
        manage
        currentUserId={actor.id}
      />
    </div>
  );
}
