import Link from "next/link";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { KpiCard } from "@/components/kpi-card";
import { IconBox, IconNavigation, IconCheckCircle } from "@/components/icons";
import { MiniTable } from "@/components/mini-table";
import { StatusChip } from "@/components/status-chip";
import { LOAD_STATUS_MAP } from "@/components/status-badge";
import { fetchPortalOrders } from "./order-data";

const fmtDateTime = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Winnipeg" });

/**
 * Customer dashboard. Orders are fetched with the USER'S session, so RLS scopes
 * them to their organization (or just assigned loads if restricted).
 */
export default async function PortalHome() {
  const user = (await getCurrentUser())!; // layout guaranteed a user
  const orders = await fetchPortalOrders();

  const inTransit = orders.filter((o) => o.status === "in_transit");
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const active = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length;

  const chip = (status: string) => {
    const c = LOAD_STATUS_MAP[status];
    return c ? <StatusChip label={c.label} tone={c.tone} /> : status;
  };
  const orderLink = (id: number, ref: string) => (
    <Link href={`/portal/orders/${id}`} className="font-mono text-[var(--color-secondary)] hover:underline">
      {ref}
    </Link>
  );

  return (
    <div className="space-y-6 lg:space-y-7">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Welcome{user.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isStaff(user.role)
            ? "Viewing the customer portal as UDTL staff."
            : user.restricted
              ? "The specific shipments assigned to you."
              : "Your company's shipments at a glance."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Active shipments" value={active} accent="var(--color-secondary)" icon={<IconBox />} />
        <KpiCard label="In transit" value={inTransit.length} accent="var(--color-accent)" icon={<IconNavigation />} />
        <KpiCard label="Delivered" value={delivered} accent="var(--color-success)" icon={<IconCheckCircle />} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <MiniTable
          title="Recent orders"
          viewAllHref="/portal/orders"
          columns={[
            { key: "order", header: "Order #" },
            { key: "route", header: "Route" },
            { key: "status", header: "Status", align: "right" },
          ]}
          rows={orders.slice(0, 6).map((o) => ({
            order: orderLink(o.id, o.ref),
            route: <span className="text-slate-600">{[o.origin, o.destination].filter(Boolean).join(" → ") || "—"}</span>,
            status: chip(o.status),
          }))}
          emptyMessage="No orders yet."
        />

        <MiniTable
          title="In transit now"
          columns={[
            { key: "order", header: "Order #" },
            { key: "dest", header: "Destination" },
            { key: "eta", header: "Live ETA", align: "right" },
          ]}
          rows={inTransit.slice(0, 6).map((o) => ({
            order: orderLink(o.id, o.ref),
            dest: <span className="text-slate-600">{o.destination || "—"}</span>,
            eta: <span className="text-slate-500">{o.liveEtaAt ? fmtDateTime.format(new Date(o.liveEtaAt)) : "—"}</span>,
          }))}
          emptyMessage="Nothing in transit right now."
        />
      </div>
    </div>
  );
}
