import { getCurrentUser, can } from "@/lib/auth";
import { buildTemplateCsv } from "@/lib/import/csv";

/** Download ITS's CSV order-import template (Epic 6, Flow 2). Staff/Admin only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "create_edit_loads")) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(buildTemplateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="udtl-order-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
