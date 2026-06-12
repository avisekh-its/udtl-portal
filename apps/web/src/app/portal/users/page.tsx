import { requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { InviteForm, type RoleOption } from "@/components/invite-form";
import { UsersTable, type UserRow } from "@/components/users-table";

const CUSTOMER_ROLE_OPTIONS: RoleOption[] = [
  { value: "customer_user", label: "Customer User", isCustomer: true },
  { value: "customer_admin", label: "Customer Admin", isCustomer: true },
];

/** Customer Admin self-service: manage your own company's users (FR-OPS / §4). */
export default async function PortalUsersPage() {
  const actor = await requireRole(["customer_admin"]);
  const supabase = await createServerClient();

  // RLS scopes this to the admin's own organization.
  const { data: users } = await supabase
    .from("users")
    .select("id, email, name, role, organization_id, active, credit_form_required, credit_form_received")
    .order("email");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Invite and manage users for your company.
        </p>
      </div>

      <InviteForm
        roleOptions={CUSTOMER_ROLE_OPTIONS}
        orgs={[]}
        lockedOrgId={actor.organizationId}
      />

      <UsersTable
        title="Team members"
        users={(users ?? []) as UserRow[]}
        orgNames={{}}
        manage
        currentUserId={actor.id}
      />
    </div>
  );
}
