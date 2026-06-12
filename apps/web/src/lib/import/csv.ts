/**
 * Flow 2 (Epic 6): ITS's own CSV template for bulk order creation.
 * UDTL's TMS can't export CSV/Excel, so ITS defines this format. One row = one
 * (order + shipper + one consignee + that consignee's commodity). Rows that share
 * a Customer Order # form ONE multi-stop order (shipper from the first such row,
 * a consignee added per row). The Customer Order # is the dedupe/upsert key.
 *
 * Pure module (no server-only / DOM) so the parser + validation are unit-testable
 * and can run on either side. Org-name → id resolution happens in the action.
 */

export interface CsvColumn {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
  example1?: string;
  example2?: string;
}

/** The published template. `required` reflects the Epic-3 confirmed field list. */
export const CSV_COLUMNS: CsvColumn[] = [
  { key: "customer_order_no", label: "Customer Order #", required: true, hint: "Unique key. Re-importing the same value UPDATES the order instead of duplicating.", example1: "PO-5001", example2: "PO-5001" },
  { key: "customer_name", label: "Customer Name", required: true, hint: "Must match an existing UDTL customer exactly.", example1: "Acme Industries", example2: "Acme Industries" },
  { key: "order_number", label: "Order #", required: false, hint: "UDTL order number. Leave blank to auto-assign.", example1: "", example2: "" },
  { key: "order_date", label: "Order Date", required: false, hint: "MM/DD/YYYY HH:MM AM/PM", example1: "06/10/2026 09:00 AM", example2: "06/10/2026 09:00 AM" },
  { key: "pickup_date", label: "Pickup Date", required: false, hint: "MM/DD/YYYY HH:MM AM/PM", example1: "06/12/2026 08:00 AM", example2: "06/12/2026 08:00 AM" },
  { key: "currency", label: "Currency", required: false, hint: "CAD or USD (default CAD).", example1: "CAD", example2: "CAD" },
  { key: "freight_charge", label: "Freight Charge", required: false, hint: "Order total amount.", example1: "4200.00", example2: "4200.00" },

  { key: "shipper_name", label: "Shipper Name", required: false, example1: "Prairie Steel Ltd", example2: "Prairie Steel Ltd" },
  { key: "shipper_address", label: "Shipper Address", required: false, example1: "120 Industrial Dr", example2: "120 Industrial Dr" },
  { key: "shipper_city", label: "Shipper City", required: true, example1: "Winnipeg", example2: "Winnipeg" },
  { key: "shipper_region", label: "Shipper Province/State", required: false, example1: "MB", example2: "MB" },
  { key: "shipper_postal", label: "Shipper Postal/ZIP", required: false, example1: "R3C 1A5", example2: "R3C 1A5" },
  { key: "shipper_country", label: "Shipper Country", required: false, hint: "CA or US (default CA).", example1: "CA", example2: "CA" },
  { key: "shipper_date", label: "Shipper Date", required: false, example1: "06/12/2026 08:00 AM", example2: "06/12/2026 08:00 AM" },
  { key: "shipper_contact", label: "Shipper Contact", required: false, example1: "Dave R", example2: "Dave R" },
  { key: "shipper_phone", label: "Shipper Phone", required: false, example1: "204-555-0101", example2: "204-555-0101" },

  { key: "consignee_name", label: "Consignee Name", required: false, example1: "BuildRight Supply", example2: "North Yard Depot" },
  { key: "consignee_address", label: "Consignee Address", required: false, example1: "88 Commerce Way", example2: "12 Rail Ave" },
  { key: "consignee_city", label: "Consignee City", required: true, example1: "Regina", example2: "Calgary" },
  { key: "consignee_region", label: "Consignee Province/State", required: false, example1: "SK", example2: "AB" },
  { key: "consignee_postal", label: "Consignee Postal/ZIP", required: false, example1: "S4N 6E3", example2: "T2E 8P5" },
  { key: "consignee_country", label: "Consignee Country", required: false, example1: "CA", example2: "CA" },
  { key: "consignee_date", label: "Consignee Date", required: false, example1: "06/13/2026 02:00 PM", example2: "06/14/2026 10:00 AM" },
  { key: "consignee_contact", label: "Consignee Contact", required: false, example1: "Sara P", example2: "" },
  { key: "consignee_phone", label: "Consignee Phone", required: false, example1: "306-555-0144", example2: "" },

  { key: "commodity", label: "Commodity", required: false, example1: "Steel beams", example2: "Steel plate" },
  { key: "pkg_qty", label: "PKG Qty", required: false, example1: "12", example2: "4" },
  { key: "weight", label: "Weight (lb)", required: false, example1: "18000", example2: "9000" },
  { key: "equipment", label: "Equipment", required: false, example1: "Flatdeck", example2: "Flatdeck" },
  { key: "reefer", label: "Reefer (Y/N)", required: false, example1: "N", example2: "N" },
  { key: "value_of_goods", label: "Value of Goods", required: false, example1: "50000", example2: "25000" },
];

export const REQUIRED_KEYS = CSV_COLUMNS.filter((c) => c.required).map((c) => c.key);
export const MAX_CSV_BYTES = 1_000_000; // 1 MB

export type CsvRecord = Record<string, string>;

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function csvLine(fields: string[]): string {
  return fields.map(csvField).join(",");
}

/** The downloadable template: header row + two example rows that together form one
 *  two-consignee order (same Customer Order #), demonstrating multi-stop encoding. */
export function buildTemplateCsv(): string {
  const header = CSV_COLUMNS.map((c) => c.label);
  const row1 = CSV_COLUMNS.map((c) => c.example1 ?? "");
  const row2 = CSV_COLUMNS.map((c) => c.example2 ?? "");
  return [csvLine(header), csvLine(row1), csvLine(row2)].join("\r\n") + "\r\n";
}

/** RFC-4180-ish CSV parse: quoted fields, escaped quotes, CRLF/LF, BOM-tolerant. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const s = text.replace(/^﻿/, "");
  const all: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      all.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    all.push(row);
  }
  const nonEmpty = all.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = nonEmpty.length ? nonEmpty[0]!.map((h) => h.trim()) : [];
  return { headers, rows: nonEmpty.slice(1) };
}

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Map each template column key → its index in the uploaded header row. */
export function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headers.map(normHeader);
  for (const col of CSV_COLUMNS) {
    const candidates = [normHeader(col.label), normHeader(col.key)];
    const idx = normalized.findIndex((h) => candidates.includes(h));
    if (idx >= 0) map[col.key] = idx;
  }
  return map;
}

export function recordFromRow(row: string[], map: Record<string, number>): CsvRecord {
  const rec: CsvRecord = {};
  for (const col of CSV_COLUMNS) {
    const idx = map[col.key];
    rec[col.key] = idx != null ? (row[idx] ?? "").trim() : "";
  }
  return rec;
}

/** Structural validation independent of the database (org existence is checked later). */
export function validateRecordStructure(rec: CsvRecord): string[] {
  const errors: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!rec[key]?.trim()) {
      const col = CSV_COLUMNS.find((c) => c.key === key)!;
      errors.push(`${col.label} is required`);
    }
  }
  if (rec.currency && !/^(cad|usd)$/i.test(rec.currency.trim())) {
    errors.push(`Currency must be CAD or USD (got "${rec.currency}")`);
  }
  for (const k of ["freight_charge", "pkg_qty", "weight", "value_of_goods"]) {
    const v = rec[k]?.replace(/[$,]/g, "").trim();
    if (v && Number.isNaN(Number(v))) {
      const col = CSV_COLUMNS.find((c) => c.key === k)!;
      errors.push(`${col.label} must be a number (got "${rec[k]}")`);
    }
  }
  return errors;
}

export interface CsvRowResult {
  rowNumber: number; // 1-based data row (header is row 0)
  record: CsvRecord;
  errors: string[];
}

export interface OrderGroup {
  key: string; // customer_order_no
  rows: CsvRowResult[];
}

/** Group validated rows into orders by Customer Order #, preserving file order. */
export function groupByOrder(rows: CsvRowResult[]): OrderGroup[] {
  const groups: OrderGroup[] = [];
  const byKey = new Map<string, OrderGroup>();
  for (const r of rows) {
    const key = r.record.customer_order_no?.trim() || `__row_${r.rowNumber}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}
