import { requireCapability } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { DataTable, type Column } from "@/components/data-table";

/**
 * Audit log viewer — UDTL Admin only (FR-AUDIT-002).
 * App gate (requireCapability) + admin-only RLS (migration 0002) both apply.
 */
const PAGE_SIZE = 500;

const fmt = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});

interface ActorRef {
  email: string | null;
}
interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  source_ip: string | null;
  created_at: string;
  actor: ActorRef | ActorRef[] | null;
}

const COLUMNS: Column[] = [
  { key: "when", header: "When", type: "muted", sticky: true },
  { key: "actor", header: "Actor", type: "text" },
  { key: "action", header: "Action", type: "mono" },
  { key: "entity", header: "Entity", type: "muted" },
  { key: "ip", header: "IP", type: "muted" },
];

export default async function AuditPage() {
  await requireCapability("view_audit_log");
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, source_ip, created_at, actor:actor_user_id ( email )")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = ((data ?? []) as unknown as AuditRow[]).map((r) => {
    const actor = Array.isArray(r.actor) ? r.actor[0] : r.actor;
    return {
      id: r.id,
      when: fmt.format(new Date(r.created_at)),
      actor: actor?.email ?? "system",
      action: r.action,
      entity: `${r.entity_type} · ${r.entity_id.slice(0, 8)}`,
      entity_type: r.entity_type,
      ip: r.source_ip ?? "—",
    };
  });

  const entityTypes = Array.from(new Set(rows.map((r) => r.entity_type))).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sensitive actions across the system — who, what, when, and from where.
        </p>
      </div>

      <DataTable
        title="Recent activity"
        columns={COLUMNS}
        rows={rows}
        searchKeys={["actor", "action", "entity", "ip"]}
        filters={[
          {
            key: "entity_type",
            label: "Entity",
            options: entityTypes.map((t) => ({ value: t, label: t })),
          },
        ]}
        exportFilename="audit-log"
        emptyMessage="No audit entries yet."
      />
      <p className="text-xs text-slate-400">Showing the most recent {PAGE_SIZE} entries.</p>
    </div>
  );
}
