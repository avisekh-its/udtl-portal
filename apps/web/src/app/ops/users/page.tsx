import { requireStaff } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { InviteForm, type RoleOption } from "@/components/invite-form";
import { UsersTable, type UserRow } from "@/components/users-table";

const STAFF_ROLE_OPTIONS: RoleOption[] = [
  { value: "udtl_admin", label: "UDTL Admin", isCustomer: false },
  { value: "udtl_staff", label: "UDTL Staff", isCustomer: false },
  { value: "udtl_account_manager", label: "Account Manager", isCustomer: false },
  { value: "customer_admin", label: "Customer Admin", isCustomer: true },
  { value: "customer_user", label: "Customer User", isCustomer: true },
];
const CUSTOMER_ONLY_OPTIONS = STAFF_ROLE_OPTIONS.filter((r) => r.isCustomer);

/** User administration for UDTL staff. Admins can invite any role; staff invite customers. */
export default async function OpsUsersPage() {
  const actor = await requireStaff();
  const supabase = await createServerClient();

  const [{ data: users }, { data: orgs }] = await Promise.all([
    supabase.from("users").select("id, email, name, role, organization_id, active, credit_form_required, credit_form_received").order("email"),
    supabase.from("organizations").select("id, name").order("name"),
  ]);

  const orgNames = Object.fromEntries((orgs ?? []).map((o) => [o.id, o.name]));
  const roleOptions = actor.role === "udtl_admin" ? STAFF_ROLE_OPTIONS : CUSTOMER_ONLY_OPTIONS;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          {actor.role === "udtl_admin"
            ? "Invite and manage UDTL staff and customer users."
            : "Invite and manage customer users."}
        </p>
      </div>

      <InviteForm roleOptions={roleOptions} orgs={orgs ?? []} allowCreditForm />

      <UsersTable
        title="All users"
        users={(users ?? []) as UserRow[]}
        orgNames={orgNames}
        manage
        currentUserId={actor.id}
      />
    </div>
  );
}
