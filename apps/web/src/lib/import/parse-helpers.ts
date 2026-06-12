/**
 * Pure parsing helpers shared by the PDF and CSV importers (Epic 6).
 * No server-only / DOM deps so they run on both client and server and are unit-testable.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * UDTL order-sheet / CSV date → datetime-local ("YYYY-MM-DDTHH:mm").
 * Accepts "MM/DD/YYYY hh:mm AM/PM", "MM/DD/YYYY", or an already-ISO-ish value.
 * Returns "" when it can't parse (the review screen lets the user fill it).
 */
export function parseSheetDate(raw?: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s) return "";
  // Already datetime-local / ISO?
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}`;
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}T00:00`;

  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm]))?/);
  if (!m) return "";
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  let H = m[4] ? Number(m[4]) : 0;
  const min = m[5] ? Number(m[5]) : 0;
  if (m[6]) {
    const pm = /p/i.test(m[6]);
    if (pm && H < 12) H += 12;
    if (!pm && H === 12) H = 0;
  }
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  return `${yyyy}-${pad(mm)}-${pad(dd)}T${pad(H)}:${pad(min)}`;
}

export interface ParsedAddress {
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

const CA_POSTAL = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
const US_ZIP = /^\d{5}(-\d{4})?$/;

function normCountry(raw: string): string {
  const c = raw.trim().toLowerCase();
  if (c === "united states" || c === "usa" || c === "us" || c === "u.s.a." || c === "u.s.") return "US";
  if (c === "canada" || c === "ca" || c === "can") return "CA";
  return raw.trim();
}

/**
 * Parse a flattened address ("250 rue Rocheleau, Drummondville, QC, J2C 6Z7, Canada")
 * into structured parts by peeling tokens from the end (country, postal, region, city).
 * Anything left over is the street line.
 */
export function parseAddress(raw?: string): ParsedAddress {
  const empty: ParsedAddress = { addressLine1: "", city: "", region: "", postalCode: "", country: "" };
  if (!raw) return empty;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return empty;

  let idx = parts.length - 1;
  let country = "";
  let postalCode = "";
  let region = "";
  let city = "";

  if (idx >= 0 && /^[A-Za-z][A-Za-z. ]+$/.test(parts[idx]!)) {
    // Last token is a country word ("Canada", "United States", "US", …).
    country = normCountry(parts[idx]!);
    idx--;
  }
  if (idx >= 0 && (CA_POSTAL.test(parts[idx]!) || US_ZIP.test(parts[idx]!))) {
    postalCode = parts[idx]!;
    idx--;
  }
  if (idx >= 0 && /^[A-Za-z]{2}$/.test(parts[idx]!)) {
    region = parts[idx]!.toUpperCase();
    idx--;
  }
  if (idx >= 0) {
    city = parts[idx]!;
    idx--;
  }
  const addressLine1 = parts.slice(0, idx + 1).join(", ");
  return { addressLine1, city, region, postalCode, country };
}

/** Coerce a free-typed yes/no/true/1 into a boolean. */
export function parseBool(raw?: string): boolean {
  if (!raw) return false;
  return /^(y|yes|true|1|t)$/i.test(raw.trim());
}

/** Keep only a clean numeric string (or "") for the form's string-typed numeric fields. */
export function cleanNumber(raw?: string): string {
  if (raw == null) return "";
  const s = String(raw).replace(/[^0-9.\-]/g, "").trim();
  if (!s || s === "-" || s === "." || Number.isNaN(Number(s))) return "";
  return s;
}
