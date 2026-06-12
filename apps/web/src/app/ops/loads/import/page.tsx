import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { loadFormOptions } from "../form-data";
import { ImportTabs } from "@/components/import/import-tabs";
import type { OrgOption, AmOption } from "@/components/load-form";

/** Order import (Epic 6): single-order PDF extraction + ITS CSV bulk upload. */
export default async function ImportOrdersPage() {
  await requireCapability("create_edit_loads");
  const { orgs, accountManagers } = await loadFormOptions();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops/loads" className="text-sm text-[var(--color-secondary)] hover:underline">
          ← Loads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Import orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create one order from a UDTL order-sheet PDF, or many at once from the ITS CSV template.
        </p>
      </div>
      <ImportTabs orgs={orgs as OrgOption[]} accountManagers={accountManagers as AmOption[]} />
    </div>
  );
}
