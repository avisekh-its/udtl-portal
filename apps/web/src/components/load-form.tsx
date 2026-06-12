"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FormSection, FieldShell, controlClass } from "@/components/form/form-section";
import { StickyActionBar, CancelLink, PrimaryButton } from "@/components/form/sticky-action-bar";
import {
  validateLoadInput,
  stopsMissingContact,
  type LoadInput,
  type StopInput,
  type CommodityInput,
  type ChargeInput,
} from "@/lib/loads";
import { saveLoadAction } from "@/app/ops/loads/actions";

export interface OrgOption {
  id: string;
  name: string;
}
export interface AmOption {
  id: string;
  label: string;
}

function emptyCommodity(): CommodityInput {
  return {
    commodity: "",
    pkgQty: "",
    pkgUnit: "Pieces",
    weight: "",
    weightUnit: "Pounds",
    lengthIn: "",
    breadthIn: "",
    heightIn: "",
    equipment: "",
    rateMethod: "",
    reefer: false,
    valueOfGoods: "",
  };
}
function emptyStop(type: StopInput["type"]): StopInput {
  return {
    type,
    name: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "CA",
    plannedFromAt: "",
    plannedToAt: "",
    actualAt: "",
    contactPerson: "",
    phone: "",
    notes: "",
    commodities: [emptyCommodity()],
  };
}
function emptyLoad(): LoadInput {
  return {
    organizationId: "",
    orderNumber: "",
    orderDate: "",
    pickupDate: "",
    customerReference: "",
    accountManagerId: "",
    currency: "CAD",
    specialInstructions: "",
    charges: [{ description: "Freight Charge", amount: "" }],
    stops: [emptyStop("pickup"), emptyStop("delivery")],
  };
}

export function LoadForm({
  mode,
  loadId,
  orgs,
  accountManagers,
  initial,
}: {
  mode: "create" | "edit";
  loadId?: number;
  orgs: OrgOption[];
  accountManagers: AmOption[];
  initial?: LoadInput;
}) {
  const router = useRouter();
  const [form, setForm] = useState<LoadInput>(initial ?? emptyLoad());
  const [error, setError] = useState<string | null>(null);
  const [confirmLabels, setConfirmLabels] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const shipperIdx = form.stops.findIndex((s) => s.type === "pickup");
  const consigneeIdxs = form.stops.map((s, i) => (s.type === "delivery" ? i : -1)).filter((i) => i >= 0);

  function setField<K extends keyof LoadInput>(key: K, value: LoadInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function patchStop(i: number, patch: Partial<StopInput>) {
    setForm((f) => ({ ...f, stops: f.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }
  function addConsignee() {
    setForm((f) => ({ ...f, stops: [...f.stops, emptyStop("delivery")] }));
  }
  function removeStop(i: number) {
    setForm((f) => ({ ...f, stops: f.stops.filter((_, j) => j !== i) }));
  }
  function setCharge(i: number, patch: Partial<ChargeInput>) {
    setForm((f) => ({ ...f, charges: f.charges.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  }
  function addCharge() {
    setForm((f) => ({ ...f, charges: [...f.charges, { description: "", amount: "" }] }));
  }
  function removeCharge(i: number) {
    setForm((f) => ({ ...f, charges: f.charges.filter((_, j) => j !== i) }));
  }

  const total = useMemo(
    () => form.charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [form.charges],
  );

  function doSave() {
    setConfirmLabels(null);
    startTransition(async () => {
      const res = await saveLoadAction(form, loadId);
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/ops/loads/${res.id}`);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = validateLoadInput(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    // Missing-contact rule: confirm before saving if any stop lacks contact/phone.
    const missing = stopsMissingContact(form);
    if (missing.length > 0) {
      setConfirmLabels(missing);
      return;
    }
    doSave();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      <FormSection title="Order details" description="From UDTL's order sheet.">
        <FieldShell label="Customer (Bill To)" htmlFor="organizationId" required>
          <select id="organizationId" value={form.organizationId} onChange={(e) => setField("organizationId", e.target.value)} className={controlClass}>
            <option value="">Select customer…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </FieldShell>
        <FieldShell label="Order #" htmlFor="orderNumber" hint="UDTL order number, e.g. LC26051800.">
          <input id="orderNumber" value={form.orderNumber} onChange={(e) => setField("orderNumber", e.target.value)} className={controlClass} />
        </FieldShell>
        <FieldShell label="Customer order # / PO" htmlFor="customerReference">
          <input id="customerReference" value={form.customerReference} onChange={(e) => setField("customerReference", e.target.value)} className={controlClass} />
        </FieldShell>
        <FieldShell label="Account manager" htmlFor="accountManagerId">
          <select id="accountManagerId" value={form.accountManagerId} onChange={(e) => setField("accountManagerId", e.target.value)} className={controlClass}>
            <option value="">Unassigned</option>
            {accountManagers.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </FieldShell>
        <FieldShell label="Order date" htmlFor="orderDate">
          <input id="orderDate" type="datetime-local" value={form.orderDate} onChange={(e) => setField("orderDate", e.target.value)} className={controlClass} />
        </FieldShell>
        <FieldShell label="Pickup date" htmlFor="pickupDate">
          <input id="pickupDate" type="datetime-local" value={form.pickupDate} onChange={(e) => setField("pickupDate", e.target.value)} className={controlClass} />
        </FieldShell>
        <FieldShell label="Notes" htmlFor="specialInstructions" full>
          <textarea id="specialInstructions" rows={2} value={form.specialInstructions} onChange={(e) => setField("specialInstructions", e.target.value)} className={controlClass} />
        </FieldShell>
      </FormSection>

      {shipperIdx >= 0 && (
        <StopCard
          title="Shipper (pickup)"
          stop={form.stops[shipperIdx]!}
          onStopChange={(patch) => patchStop(shipperIdx, patch)}
        />
      )}

      {consigneeIdxs.map((idx, n) => (
        <StopCard
          key={idx}
          title={`Consignee ${n + 1} (delivery)`}
          stop={form.stops[idx]!}
          canRemove={consigneeIdxs.length > 1}
          onRemove={() => removeStop(idx)}
          onStopChange={(patch) => patchStop(idx, patch)}
        />
      ))}

      <button
        type="button"
        onClick={addConsignee}
        className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-3 text-sm font-medium text-[var(--color-secondary)] transition hover:bg-[var(--color-secondary)]/5"
      >
        + Add consignee
      </button>

      {/* Order-level charges → total */}
      <FormSection title="Charges" description="Order-level total (no per-stop pricing). Visible to customers." columns={1}>
        <div className="space-y-2">
          {form.charges.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_160px_auto] gap-2">
              <input placeholder="Description (e.g. Freight Charge)" value={c.description} onChange={(e) => setCharge(i, { description: e.target.value })} className={controlClass} />
              <input type="number" step="0.01" placeholder="0.00" value={c.amount} onChange={(e) => setCharge(i, { amount: e.target.value })} className={controlClass} />
              {form.charges.length > 1 ? (
                <button type="button" onClick={() => removeCharge(i)} className="px-2 text-xs font-medium text-[var(--color-error)] hover:underline">Remove</button>
              ) : (
                <span />
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={addCharge} className="text-xs font-medium text-[var(--color-secondary)] hover:underline">+ Add charge</button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Total</span>
              <span className="font-semibold text-slate-900">{total.toFixed(2)}</span>
              <select value={form.currency} onChange={(e) => setField("currency", e.target.value)} className={`${controlClass} w-24`}>
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
        </div>
      </FormSection>

      <StickyActionBar>
        <CancelLink href="/ops/loads" />
        <PrimaryButton disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create load" : "Save changes"}
        </PrimaryButton>
      </StickyActionBar>

      {/* Missing-contact confirm */}
      {confirmLabels && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Missing stop contact</h3>
            <p className="mt-2 text-sm text-slate-600">
              These stops have no contact person or phone:{" "}
              <span className="font-medium text-slate-800">{confirmLabels.join(", ")}</span>.
              Save the order without it?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmLabels(null)} className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={doSave} disabled={pending} className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-secondary-700)] disabled:opacity-60">
                {pending ? "Saving…" : "Save anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function StopCard({
  title,
  stop,
  canRemove,
  onRemove,
  onStopChange,
}: {
  title: string;
  stop: StopInput;
  canRemove?: boolean;
  onRemove?: () => void;
  onStopChange: (patch: Partial<StopInput>) => void;
}) {
  function patchCommodity(j: number, patch: Partial<CommodityInput>) {
    onStopChange({ commodities: stop.commodities.map((c, k) => (k === j ? { ...c, ...patch } : c)) });
  }
  function addCommodity() {
    onStopChange({ commodities: [...stop.commodities, emptyCommodity()] });
  }
  function removeCommodity(j: number) {
    onStopChange({ commodities: stop.commodities.filter((_, k) => k !== j) });
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {canRemove && onRemove && (
          <button type="button" onClick={onRemove} className="text-xs font-medium text-[var(--color-error)] hover:underline">Remove</button>
        )}
      </div>

      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <FieldShell label="Name / location" full>
          <input value={stop.name} onChange={(e) => onStopChange({ name: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Address line 1" full>
          <input value={stop.addressLine1} onChange={(e) => onStopChange({ addressLine1: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="City" required>
          <input value={stop.city} onChange={(e) => onStopChange({ city: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Province / State">
          <input value={stop.region} onChange={(e) => onStopChange({ region: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Postal / ZIP">
          <input value={stop.postalCode} onChange={(e) => onStopChange({ postalCode: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Country">
          <input value={stop.country} onChange={(e) => onStopChange({ country: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Date & time">
          <input type="datetime-local" value={stop.plannedFromAt} onChange={(e) => onStopChange({ plannedFromAt: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Actual date & time" hint="Set when completed.">
          <input type="datetime-local" value={stop.actualAt} onChange={(e) => onStopChange({ actualAt: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Contact person">
          <input value={stop.contactPerson} onChange={(e) => onStopChange({ contactPerson: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Phone">
          <input value={stop.phone} onChange={(e) => onStopChange({ phone: e.target.value })} className={controlClass} />
        </FieldShell>
        <FieldShell label="Notes" full>
          <input value={stop.notes} onChange={(e) => onStopChange({ notes: e.target.value })} className={controlClass} />
        </FieldShell>
      </div>

      {/* Commodity block */}
      <div className="mt-5 border-t border-[var(--color-border)] pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Commodity</h4>
          <button type="button" onClick={addCommodity} className="text-xs font-medium text-[var(--color-secondary)] hover:underline">+ Add commodity</button>
        </div>
        <div className="space-y-3">
          {stop.commodities.map((c, j) => (
            <div key={j} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <input placeholder="Commodity" value={c.commodity} onChange={(e) => patchCommodity(j, { commodity: e.target.value })} className={`${controlClass} sm:col-span-2`} />
                <input type="number" step="any" placeholder="PKG qty" value={c.pkgQty} onChange={(e) => patchCommodity(j, { pkgQty: e.target.value })} className={controlClass} />
                <input type="number" step="any" placeholder="Weight (lb)" value={c.weight} onChange={(e) => patchCommodity(j, { weight: e.target.value })} className={controlClass} />
                <input type="number" step="any" placeholder="L (in)" value={c.lengthIn} onChange={(e) => patchCommodity(j, { lengthIn: e.target.value })} className={controlClass} />
                <input type="number" step="any" placeholder="B (in)" value={c.breadthIn} onChange={(e) => patchCommodity(j, { breadthIn: e.target.value })} className={controlClass} />
                <input type="number" step="any" placeholder="H (in)" value={c.heightIn} onChange={(e) => patchCommodity(j, { heightIn: e.target.value })} className={controlClass} />
                <input type="number" step="any" placeholder="Value of goods" value={c.valueOfGoods} onChange={(e) => patchCommodity(j, { valueOfGoods: e.target.value })} className={controlClass} />
                <input placeholder="Equipment" value={c.equipment} onChange={(e) => patchCommodity(j, { equipment: e.target.value })} className={`${controlClass} sm:col-span-2`} />
                <input placeholder="Rate method" value={c.rateMethod} onChange={(e) => patchCommodity(j, { rateMethod: e.target.value })} className={controlClass} />
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={!!c.reefer} onChange={(e) => patchCommodity(j, { reefer: e.target.checked })} className="h-4 w-4 rounded border-slate-300 accent-[var(--color-secondary)]" />
                  Reefer
                </label>
              </div>
              {stop.commodities.length > 1 && (
                <div className="mt-2 text-right">
                  <button type="button" onClick={() => removeCommodity(j)} className="text-xs font-medium text-[var(--color-error)] hover:underline">Remove commodity</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
