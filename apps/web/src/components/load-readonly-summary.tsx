import type { LoadInput } from "@/lib/loads";

/**
 * Read-only order view for staff who can see loads but not edit them (Account
 * Managers). Shows the order header, stops, and charges without any inputs —
 * the editable LoadForm is rendered only for users with create_edit_loads.
 */
const dt = (v?: string) => (v ? v.replace("T", " ") : "—");
const val = (v?: string) => (v && v.trim() ? v : "—");

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

export function LoadReadonlySummary({ initial, orgName }: { initial: LoadInput; orgName: string }) {
  const cur = initial.currency || "CAD";
  const total = initial.charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2 })} ${cur}`;
  let shipper = 0;
  let consignee = 0;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Order summary</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Customer" value={orgName} />
          <Field label="Order #" value={val(initial.orderNumber)} />
          <Field label="Customer ref" value={val(initial.customerReference)} />
          <Field label="Order date" value={dt(initial.orderDate)} />
          <Field label="Pickup date" value={dt(initial.pickupDate)} />
          <Field label="Currency" value={cur} />
        </dl>
        {initial.specialInstructions?.trim() && (
          <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Instructions:</span> {initial.specialInstructions}
          </p>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Stops</h2>
        <div className="space-y-3">
          {initial.stops.map((s, i) => {
            const label = s.type === "pickup" ? `Shipper${++shipper > 1 ? ` ${shipper}` : ""}` : `Consignee ${++consignee}`;
            const addr = [s.addressLine1, s.city, s.region, s.postalCode, s.country].filter((x) => x && x.trim()).join(", ");
            return (
              <div key={i} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{label}{s.name ? ` · ${s.name}` : ""}</span>
                  <span className="text-xs text-slate-400">{dt(s.plannedFromAt)}{s.plannedToAt ? ` → ${dt(s.plannedToAt)}` : ""}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{addr || "—"}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Contact: {val(s.contactPerson)}{s.phone ? ` · ${s.phone}` : ""}
                </p>
                {s.commodities.some((c) => c.commodity?.trim() || c.weight || c.pkgQty) && (
                  <ul className="mt-1.5 space-y-0.5">
                    {s.commodities
                      .filter((c) => c.commodity?.trim() || c.weight || c.pkgQty)
                      .map((c, j) => (
                        <li key={j} className="text-xs text-slate-600">
                          {val(c.commodity)}
                          {c.pkgQty ? ` · ${c.pkgQty} ${c.pkgUnit || ""}` : ""}
                          {c.weight ? ` · ${c.weight} ${c.weightUnit || ""}` : ""}
                          {c.equipment ? ` · ${c.equipment}` : ""}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {initial.charges.some((c) => c.description?.trim()) && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Charges</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--color-border)]">
              {initial.charges.map((c, i) => (
                <tr key={i}>
                  <td className="py-2 text-slate-600">{c.description}</td>
                  <td className="py-2 text-right font-medium text-slate-700">{money(Number(c.amount) || 0)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--color-border)]">
                <td className="py-2 font-semibold text-slate-800">Total</td>
                <td className="py-2 text-right font-semibold text-slate-900">{money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
