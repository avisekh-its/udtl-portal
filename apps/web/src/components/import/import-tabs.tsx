"use client";

import { useState } from "react";
import { PdfImport } from "./pdf-import";
import { CsvImport } from "./csv-import";
import type { OrgOption, AmOption } from "@/components/load-form";

export function ImportTabs({ orgs, accountManagers }: { orgs: OrgOption[]; accountManagers: AmOption[] }) {
  const [tab, setTab] = useState<"pdf" | "csv">("pdf");

  const tabCls = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition ${
      active ? "bg-[var(--color-secondary)] text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        <button type="button" className={tabCls(tab === "pdf")} onClick={() => setTab("pdf")}>
          PDF — single order
        </button>
        <button type="button" className={tabCls(tab === "csv")} onClick={() => setTab("csv")}>
          CSV — bulk upload
        </button>
      </div>

      {tab === "pdf" ? (
        <PdfImport orgs={orgs} accountManagers={accountManagers} />
      ) : (
        <CsvImport accountManagers={accountManagers} />
      )}
    </div>
  );
}
