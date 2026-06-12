import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { LoadForm, type OrgOption, type AmOption } from "@/components/load-form";
import { loadFormOptions } from "../form-data";

/** Create a load (FR-OPS-010). Staff/Admin only. */
export default async function NewLoadPage() {
  await requireCapability("create_edit_loads");
  const { orgs, accountManagers } = await loadFormOptions();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops/loads" className="text-sm text-[var(--color-secondary)] hover:underline">
          ← Loads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">New load</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add the load details and one or more stops. A load reference is assigned automatically.
        </p>
      </div>
      <LoadForm
        mode="create"
        orgs={orgs as OrgOption[]}
        accountManagers={accountManagers as AmOption[]}
      />
    </div>
  );
}
