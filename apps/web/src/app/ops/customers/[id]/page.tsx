import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { OrgForm } from "@/components/org-form";
import { OrgStatusToggle } from "@/components/org-status-toggle";
import { ContactsManager, type ContactRow } from "@/components/contacts-manager";
import { UsersTable, type UserRow } from "@/components/users-table";
import { InviteForm, type RoleOption } from "@/components/invite-form";

/** This customer's users are invited here (Customer Admin / Customer User), scoped to this org. */
const CUSTOMER_ROLE_OPTIONS: RoleOption[] = [
  { value: "customer_admin", label: "Customer Admin", isCustomer: true },
  { value: "customer_user", label: "Customer User", isCustomer: true },
];

/** Edit a customer org: profile, status, additional contacts, and its users. */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireCapability("manage_customer_orgs");
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, name, primary_contact_name, primary_contact_email, primary_contact_phone, address_line_1, address_line_2, city, region, postal_code, country, active",
    )
    .eq("id", id)
    .single();
  if (!org) notFound();

  const [{ data: contacts }, { data: users }] = await Promise.all([
    supabase
      .from("organization_contacts")
      .select("id, type, name, email, phone")
      .eq("organization_id", id)
      .order("id"),
    supabase
      .from("users")
      .select("id, email, name, role, organization_id, active, credit_form_required, credit_form_received")
      .eq("organization_id", id)
      .order("email"),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/ops/customers" className="text-sm text-[var(--color-secondary)] hover:underline">
            ← Customers
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{org.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.active ? "Active customer" : "Inactive customer"}
          </p>
        </div>
        <OrgStatusToggle orgId={org.id} active={org.active} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Company profile</h2>
        <OrgForm
          mode="edit"
          orgId={org.id}
          initial={{
            name: org.name,
            primaryContactName: org.primary_contact_name,
            primaryContactEmail: org.primary_contact_email,
            primaryContactPhone: org.primary_contact_phone,
            addressLine1: org.address_line_1,
            addressLine2: org.address_line_2,
            city: org.city,
            region: org.region,
            postalCode: org.postal_code,
            country: org.country,
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Additional contacts</h2>
        <ContactsManager orgId={org.id} contacts={(contacts ?? []) as ContactRow[]} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Team</h2>
        <InviteForm
          roleOptions={CUSTOMER_ROLE_OPTIONS}
          orgs={[]}
          lockedOrgId={org.id}
        />
        <UsersTable
          title="Users at this customer"
          users={(users ?? []) as UserRow[]}
          orgNames={{ [org.id]: org.name }}
          manage
          currentUserId={actor.id}
        />
      </section>
    </div>
  );
}
