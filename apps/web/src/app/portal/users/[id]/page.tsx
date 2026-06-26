import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchPortalOrders } from "@/app/portal/order-data";
import { OrderAccessManager, type AccessOrder } from "@/components/order-access-manager";

/**
 * Customer Admin manages one team member's order access (Epic 8). Customer
 * Users can be restricted to specific orders; Customer Admins always see all.
 */
export default async function TeamMemberAccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole(["customer_admin"]);
  const { id } = await params;

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("users")
    .select("id, email, name, role, organization_id, active, restricted")
    .eq("id", id)
    .single();
  // Only manage a real user in the admin's own company.
  if (!target || target.organization_id !== actor.organizationId) notFound();

  const isCustomerUser = target.role === "customer_user";

  // All of the company's orders (the admin is unrestricted, so RLS returns the
  // full org set) + this user's current assignments.
  const [orders, { data: assignedRows }] = await Promise.all([
    isCustomerUser ? fetchPortalOrders() : Promise.resolve([]),
    isCustomerUser
      ? admin.from("load_assigned_users").select("load_id").eq("user_id", id)
      : Promise.resolve({ data: [] as { load_id: number }[] }),
  ]);

  const accessOrders: AccessOrder[] = orders.map((o) => ({
    id: o.id,
    ref: o.ref,
    route: [o.origin, o.destination].filter(Boolean).join(" → "),
    status: o.status,
  }));
  const assignedIds = (assignedRows ?? []).map((r) => r.load_id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/users" className="text-sm text-[var(--color-secondary)] hover:underline">
          ← Team
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {target.name || target.email}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {target.role === "customer_admin" ? "Customer Admin" : "Customer User"} · {target.email}
          {!target.active && " · inactive"}
        </p>
      </div>

      {isCustomerUser ? (
        <OrderAccessManager
          userId={target.id}
          restricted={target.restricted}
          orders={accessOrders}
          assignedIds={assignedIds}
        />
      ) : (
        <div className="card p-4 text-sm text-slate-600">
          Customer Admins always have access to all of your company&apos;s orders, so there&apos;s
          nothing to restrict here.
        </div>
      )}
    </div>
  );
}
