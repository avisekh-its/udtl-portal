import { getCurrentUser, can } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { computeReport } from "@/lib/reports/compute";
import { parseReportFilters } from "@/lib/reports/filters";
import { buildReportCsv } from "@/lib/reports/csv";
import { buildReportPdf } from "@/lib/reports/pdf";

export const dynamic = "force-dynamic";

/** Export the performance report as CSV or PDF, reflecting the URL filters. Staff-only. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "view_reports")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const filters = parseReportFilters(params);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";

  let customerName = "All customers";
  if (filters.customerId) {
    const { data } = await createServiceClient().from("organizations").select("name").eq("id", filters.customerId).maybeSingle();
    customerName = (data?.name as string) ?? "Unknown customer";
  }

  const result = await computeReport(filters);
  const base = `udtl-performance-${filters.from}_${filters.to}`;

  if (format === "pdf") {
    const bytes = await buildReportPdf(result, customerName);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(buildReportCsv(result, customerName), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
