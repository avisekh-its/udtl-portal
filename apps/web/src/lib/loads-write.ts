/**
 * Single source of truth for persisting a load (insert or replace-edit) mapped to
 * UDTL's order sheet: 1 shipper + N consignees, each with a commodity block, plus
 * order-level charges → total. Used by the manual form action (saveLoadAction) AND
 * the Epic-6 importers so create/edit/upsert all behave identically.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoadInput } from "@/lib/loads";

/** datetime-local ("YYYY-MM-DDTHH:mm") → ISO (stored as wall-clock UTC). */
export function toTs(v?: string): string | null {
  if (!v) return null;
  const withSeconds = v.length === 16 ? `${v}:00` : v;
  return `${withSeconds}Z`;
}
export function toCents(v?: string): number | null {
  if (!v || !String(v).trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export function toReal(v?: string): number | null {
  if (!v || !String(v).trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface WriteLoadResult {
  id: number;
  total: number;
}

/**
 * Create or replace-edit a load. On edit, the stop/commodity/charge set is replaced
 * wholesale (same semantics as the form). Returns the load id + computed total cents.
 * Caller is responsible for permission checks, validation, audit, and revalidation.
 */
export async function writeLoad(
  admin: SupabaseClient,
  input: LoadInput,
  opts: { actorId: string; existingId?: number },
): Promise<WriteLoadResult> {
  const total = input.charges.reduce((sum, c) => sum + (toCents(c.amount) ?? 0), 0);

  const loadFields = {
    order_number: input.orderNumber?.trim() || null,
    order_date: toTs(input.orderDate),
    pickup_date: toTs(input.pickupDate),
    customer_reference: input.customerReference?.trim() || null,
    organization_id: input.organizationId,
    account_manager_id: input.accountManagerId || null,
    per_load_cost_cents: total || null,
    per_load_cost_currency: input.currency || "CAD",
    special_instructions: input.specialInstructions?.trim() || null,
  };

  let id = opts.existingId;

  if (id) {
    const { error } = await admin
      .from("loads")
      .update({ ...loadFields, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await admin.from("stops").delete().eq("load_id", id); // cascades commodities
    await admin.from("load_charges").delete().eq("load_id", id);
  } else {
    const { data: refData, error: refErr } = await admin.rpc("next_load_reference");
    if (refErr) throw new Error(`Could not generate a load reference: ${refErr.message}`);
    const token = `trk_${(globalThis.crypto.randomUUID() as string).replace(/-/g, "")}`;
    const { data, error } = await admin
      .from("loads")
      .insert({
        ...loadFields,
        load_reference: refData as string,
        public_tracking_token: token,
        status: "new",
        created_by: opts.actorId,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not create the load.");
    id = data.id as number;
  }

  // Stops
  const stopRows = input.stops.map((s, i) => ({
    load_id: id,
    sequence: i + 1,
    type: s.type,
    name: s.name?.trim() || null,
    address_line_1: s.addressLine1?.trim() || null,
    address_line_2: s.addressLine2?.trim() || null,
    city: s.city.trim(),
    region: s.region?.trim() || null,
    postal_code: s.postalCode?.trim() || null,
    country: s.country?.trim() || "CA",
    planned_from_at: toTs(s.plannedFromAt),
    planned_to_at: toTs(s.plannedToAt),
    actual_at: toTs(s.actualAt),
    contact_person: s.contactPerson?.trim() || null,
    phone: s.phone?.trim() || null,
    notes: s.notes?.trim() || null,
  }));
  const { data: insertedStops, error: stopErr } = await admin
    .from("stops")
    .insert(stopRows)
    .select("id, sequence");
  if (stopErr) throw new Error(`Could not save stops: ${stopErr.message}`);

  const bySeq = new Map<number, number>();
  for (const row of insertedStops ?? []) bySeq.set(row.sequence as number, row.id as number);

  // Commodity blocks
  const commodityRows: Record<string, unknown>[] = [];
  input.stops.forEach((s, i) => {
    const stopId = bySeq.get(i + 1);
    if (!stopId) return;
    s.commodities.forEach((c, j) => {
      const hasAny =
        c.commodity?.trim() || c.pkgQty || c.weight || c.equipment?.trim() || c.valueOfGoods;
      if (!hasAny) return;
      commodityRows.push({
        stop_id: stopId,
        sequence: j + 1,
        commodity: c.commodity?.trim() || null,
        pkg_qty: toReal(c.pkgQty),
        pkg_unit: c.pkgUnit?.trim() || "Pieces",
        weight: toReal(c.weight),
        weight_unit: c.weightUnit?.trim() || "Pounds",
        length_in: toReal(c.lengthIn),
        breadth_in: toReal(c.breadthIn),
        height_in: toReal(c.heightIn),
        equipment: c.equipment?.trim() || null,
        rate_method: c.rateMethod?.trim() || null,
        reefer: !!c.reefer,
        value_of_goods: toReal(c.valueOfGoods),
      });
    });
  });
  if (commodityRows.length) {
    const { error: cErr } = await admin.from("stop_commodities").insert(commodityRows);
    if (cErr) throw new Error(`Could not save commodities: ${cErr.message}`);
  }

  // Charges
  const chargeRows = input.charges
    .filter((c) => c.description?.trim())
    .map((c, i) => ({
      load_id: id,
      sequence: i + 1,
      description: c.description.trim(),
      amount_cents: toCents(c.amount) ?? 0,
    }));
  if (chargeRows.length) {
    const { error: chErr } = await admin.from("load_charges").insert(chargeRows);
    if (chErr) throw new Error(`Could not save charges: ${chErr.message}`);
  }

  return { id: id!, total };
}
