"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { writeLoad } from "@/lib/loads-write";
import {
  validateLoadInput,
  stopsMissingContact,
  type LoadInput,
  type StopInput,
  type CommodityInput,
} from "@/lib/loads";
import { parseOrderPdf } from "@/lib/import/pdf-order";
import {
  parseCsv,
  buildHeaderMap,
  recordFromRow,
  validateRecordStructure,
  groupByOrder,
  CSV_COLUMNS,
  REQUIRED_KEYS,
  MAX_CSV_BYTES,
  type CsvRecord,
  type CsvRowResult,
} from "@/lib/import/csv";
import { parseSheetDate, cleanNumber, parseBool } from "@/lib/import/parse-helpers";

const MAX_PDF_BYTES = 10_000_000; // 10 MB

// ----------------------------- shared helpers ------------------------------

async function loadOrgMap(): Promise<Map<string, string>> {
  const admin = createServiceClient();
  const { data } = await admin.from("organizations").select("id, name").eq("active", true);
  const map = new Map<string, string>();
  for (const o of data ?? []) map.set(String(o.name).trim().toLowerCase(), o.id as string);
  return map;
}

function commodityFromRecord(rec: CsvRecord): CommodityInput {
  return {
    commodity: rec.commodity || "",
    pkgQty: cleanNumber(rec.pkg_qty),
    pkgUnit: "Pieces",
    weight: cleanNumber(rec.weight),
    weightUnit: "Pounds",
    equipment: rec.equipment || "",
    reefer: parseBool(rec.reefer),
    valueOfGoods: cleanNumber(rec.value_of_goods),
  };
}

function buildLoadFromRows(rows: CsvRowResult[], orgId: string, customerOrderNo: string): LoadInput {
  const first = rows[0]!.record;
  const shipper: StopInput = {
    type: "pickup",
    name: first.shipper_name || "",
    addressLine1: first.shipper_address || "",
    city: first.shipper_city || "",
    region: first.shipper_region || "",
    postalCode: first.shipper_postal || "",
    country: first.shipper_country || "CA",
    plannedFromAt: parseSheetDate(first.shipper_date),
    contactPerson: first.shipper_contact || "",
    phone: first.shipper_phone || "",
    commodities: [{ commodity: "", pkgUnit: "Pieces", weightUnit: "Pounds", reefer: false }],
  };
  const consignees: StopInput[] = rows.map((r) => {
    const rec = r.record;
    return {
      type: "delivery",
      name: rec.consignee_name || "",
      addressLine1: rec.consignee_address || "",
      city: rec.consignee_city || "",
      region: rec.consignee_region || "",
      postalCode: rec.consignee_postal || "",
      country: rec.consignee_country || "CA",
      plannedFromAt: parseSheetDate(rec.consignee_date),
      contactPerson: rec.consignee_contact || "",
      phone: rec.consignee_phone || "",
      commodities: [commodityFromRecord(rec)],
    };
  });
  return {
    organizationId: orgId,
    orderNumber: first.order_number || "",
    orderDate: parseSheetDate(first.order_date),
    pickupDate: parseSheetDate(first.pickup_date),
    customerReference: customerOrderNo,
    accountManagerId: "",
    currency: /usd/i.test(first.currency || "") ? "USD" : "CAD",
    specialInstructions: "",
    charges: [{ description: "Freight Charge", amount: cleanNumber(first.freight_charge) }],
    stops: [shipper, ...consignees],
  };
}

// ------------------------------- PDF (Flow 1) ------------------------------

export interface PdfParseResult {
  error?: string;
  load?: LoadInput;
  billToName?: string;
  suggestedOrgId?: string | null;
  warnings?: string[];
}

export async function parsePdfOrderAction(formData: FormData): Promise<PdfParseResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "create_edit_loads")) {
    return { error: "You don't have permission to import orders." };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a PDF file to import." };
  if (!/pdf$/i.test(file.name) && file.type !== "application/pdf") {
    return { error: "That doesn't look like a PDF. Upload a UDTL order-sheet PDF." };
  }
  if (file.size > MAX_PDF_BYTES) return { error: "PDF is too large (max 10 MB)." };

  let parsed;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    parsed = await parseOrderPdf(buf);
  } catch (e) {
    return { error: `Couldn't read that PDF: ${e instanceof Error ? e.message : "unknown error"}` };
  }

  // Suggest the customer org from the Bill-To name.
  const orgMap = await loadOrgMap();
  let suggestedOrgId: string | null = null;
  const bn = parsed.billToName.trim().toLowerCase();
  if (bn) {
    suggestedOrgId =
      orgMap.get(bn) ??
      [...orgMap.entries()].find(([name]) => name.includes(bn) || bn.includes(name))?.[1] ??
      null;
  }
  if (suggestedOrgId) parsed.load.organizationId = suggestedOrgId;

  return {
    load: parsed.load,
    billToName: parsed.billToName,
    suggestedOrgId,
    warnings: parsed.warnings,
  };
}

// ------------------------------- CSV (Flow 2) ------------------------------

export interface PreviewOrder {
  customerOrderNo: string;
  customerName: string;
  orgId: string | null;
  orderNumber: string;
  consigneeCount: number;
  totalAmount: number; // cents
  currency: string;
  rowNumbers: number[];
  errors: string[];
  missingContact: string[];
  willUpdate: boolean;
  load: LoadInput | null; // present when committable
}

export interface CsvPreviewResult {
  error?: string;
  headerWarnings?: string[];
  orders?: PreviewOrder[];
  summary?: { totalRows: number; validOrders: number; invalidOrders: number; willUpdate: number };
}

export async function previewCsvAction(formData: FormData): Promise<CsvPreviewResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "create_edit_loads")) {
    return { error: "You don't have permission to import orders." };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file to import." };
  if (!/csv$/i.test(file.name) && !/csv|text\/plain/i.test(file.type)) {
    return { error: "Upload a .csv file (use the ITS template)." };
  }
  if (file.size > MAX_CSV_BYTES) return { error: `CSV is too large (max ${MAX_CSV_BYTES / 1000} KB).` };

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return { error: "Couldn't read the file as UTF-8. Re-save the CSV with UTF-8 encoding." };
  }

  const { headers, rows } = parseCsv(text);
  if (rows.length === 0) return { error: "No data rows found under the header." };

  const headerMap = buildHeaderMap(headers);
  const headerWarnings: string[] = [];
  const missingRequiredCols = REQUIRED_KEYS.filter((k) => headerMap[k] == null);
  if (missingRequiredCols.length) {
    const labels = missingRequiredCols.map((k) => CSV_COLUMNS.find((c) => c.key === k)!.label);
    return { error: `Missing required column(s): ${labels.join(", ")}. Use the ITS template.` };
  }

  const orgMap = await loadOrgMap();

  // Per-row structural validation.
  const rowResults: CsvRowResult[] = rows.map((row, i) => {
    const record = recordFromRow(row, headerMap);
    return { rowNumber: i + 1, record, errors: validateRecordStructure(record) };
  });

  // Group into orders and resolve org + existing load for upsert.
  const groups = groupByOrder(rowResults);
  const keys = groups.map((g) => g.key);
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("loads")
    .select("id, customer_reference, organization_id")
    .in("customer_reference", keys);
  const existingByKeyOrg = new Map<string, number>();
  for (const e of existing ?? []) {
    existingByKeyOrg.set(`${e.customer_reference}::${e.organization_id}`, e.id as number);
  }

  const orders: PreviewOrder[] = groups.map((g) => {
    const first = g.rows[0]!.record;
    const customerName = first.customer_name || "";
    const orgId = orgMap.get(customerName.trim().toLowerCase()) ?? null;
    const rowErrors = g.rows.flatMap((r) => r.errors.map((e) => `Row ${r.rowNumber}: ${e}`));
    const errors = [...rowErrors];
    if (customerName && !orgId) errors.push(`Unknown customer "${customerName}" — add the customer first or fix the name.`);

    const totalAmount = Math.round((Number(cleanNumber(first.freight_charge)) || 0) * 100);
    const willUpdate = orgId ? existingByKeyOrg.has(`${g.key}::${orgId}`) : false;

    let load: LoadInput | null = null;
    let missingContact: string[] = [];
    if (orgId && errors.length === 0) {
      load = buildLoadFromRows(g.rows, orgId, g.key);
      const invalid = validateLoadInput(load);
      if (invalid) {
        errors.push(invalid);
        load = null;
      } else {
        missingContact = stopsMissingContact(load);
      }
    }

    return {
      customerOrderNo: g.key,
      customerName,
      orgId,
      orderNumber: first.order_number || "",
      consigneeCount: g.rows.length,
      totalAmount,
      currency: /usd/i.test(first.currency || "") ? "USD" : "CAD",
      rowNumbers: g.rows.map((r) => r.rowNumber),
      errors,
      missingContact,
      willUpdate,
      load,
    };
  });

  const validOrders = orders.filter((o) => o.load).length;
  return {
    headerWarnings,
    orders,
    summary: {
      totalRows: rows.length,
      validOrders,
      invalidOrders: orders.length - validOrders,
      willUpdate: orders.filter((o) => o.willUpdate && o.load).length,
    },
  };
}

export interface CommitOrder {
  customerOrderNo: string;
  load: LoadInput;
}
export interface CommitResult {
  error?: string;
  created?: number;
  updated?: number;
  failed?: { order: string; reason: string }[];
}

export async function commitCsvImportAction(commits: CommitOrder[]): Promise<CommitResult> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "create_edit_loads")) {
    return { error: "You don't have permission to import orders." };
  }
  if (!commits?.length) return { error: "Nothing to import." };

  const admin = createServiceClient();
  let created = 0;
  let updated = 0;
  const failed: { order: string; reason: string }[] = [];

  for (const c of commits) {
    const invalid = validateLoadInput(c.load);
    if (invalid) {
      failed.push({ order: c.customerOrderNo, reason: invalid });
      continue;
    }
    try {
      // Re-resolve existing (upsert by Customer Order # within the same customer).
      const { data: ex } = await admin
        .from("loads")
        .select("id")
        .eq("customer_reference", c.customerOrderNo)
        .eq("organization_id", c.load.organizationId)
        .maybeSingle();
      const existingId = (ex?.id as number | undefined) ?? undefined;
      const { id } = await writeLoad(admin, c.load, { actorId: actor.id, existingId });
      if (existingId) updated++;
      else created++;
      await writeAudit({
        actorUserId: actor.id,
        action: existingId ? "load.imported_update" : "load.imported_create",
        entityType: "load",
        entityId: String(id),
        after: { source: "csv", customerOrderNo: c.customerOrderNo, stops: c.load.stops.length },
        ip: await getRequestIp(),
      });
    } catch (e) {
      failed.push({ order: c.customerOrderNo, reason: e instanceof Error ? e.message : "write failed" });
    }
  }

  revalidatePath("/ops/loads");
  return { created, updated, failed };
}
