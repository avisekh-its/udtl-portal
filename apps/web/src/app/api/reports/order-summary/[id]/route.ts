import { getCurrentUser, can } from "@/lib/auth";
import { buildOrderSummaryPdf } from "@/lib/reports/pdf";

export const dynamic = "force-dynamic";

/** Per-order summary PDF (Epic 12). Staff-only internal document. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "view_reports")) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await params;
  const loadId = Number(id);
  if (!Number.isFinite(loadId)) return new Response("Bad request", { status: 400 });

  const bytes = await buildOrderSummaryPdf(loadId);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="udtl-order-${loadId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
