import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { OrgForm } from "@/components/org-form";

/** Create a customer organization (FR-OPS-001). Staff/Admin only. */
export default async function NewCustomerPage() {
  await requireCapability("manage_customer_orgs");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops/customers" className="text-sm text-[var(--color-secondary)] hover:underline">
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">New customer</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add the company and its primary contact. After saving, you can invite that contact as the
          Customer Admin in one step.
        </p>
      </div>
      <OrgForm mode="create" />
    </div>
  );
}
