/**
 * Flow 1 (Epic 6): single-order extraction from a UDTL order-sheet PDF.
 * Tuned to UDTL's fixed layout (the two shared samples) — NOT a generic PDF parser.
 * Produces a LoadInput to pre-fill the review screen; organizationId is left blank
 * for the user to confirm (we suggest a match from the Bill-To name).
 *
 * The extracted text is in reading order (verified with unpdf), so we anchor on the
 * sheet's section labels: "Sr. Charges Amount" → "Shipper/Consignee … Phone" blocks
 * → "Bill To Order # :" header.
 */
import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import type { LoadInput, StopInput, StopType, CommodityInput, ChargeInput } from "@/lib/loads";
import { parseAddress, parseSheetDate, cleanNumber } from "./parse-helpers";

export interface ParsedOrder {
  load: LoadInput;
  /** Bill-To company name from the sheet, used to suggest the customer org. */
  billToName: string;
  warnings: string[];
}

const COMMODITY_HEADER = "Commodity PKG Weight LxBxH Equipment Rate Method Reefer ValueOfGoods";
const SHIPPER_ANCHOR = "Shipper Location Date Contact Person Phone";
const CONSIGNEE_ANCHOR = "Consignee Location Date Contact Person Phone";

export async function parseOrderPdf(buffer: Uint8Array): Promise<ParsedOrder> {
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return parseOrderText(text);
}

/** Pure text→order parse (exported so it can be unit-tested without a PDF). */
export function parseOrderText(raw: string): ParsedOrder {
  const warnings: string[] = [];
  const t = raw.replace(/\s+/g, " ").trim();

  // ---- Order header (from the "Bill To" box) ----
  const orderNumber = t.match(/Order # : (\S+)/)?.[1] ?? "";
  const orderDate = parseSheetDate(t.match(/Order Date : ([\d/]+\s+[\d:]+\s*[AP]M)/i)?.[1]);
  const pickupDate = parseSheetDate(t.match(/Pickup Date : ([\d/]+\s+[\d:]+\s*[AP]M)/i)?.[1]);
  const customerReference = t.match(/Cust\.? Order : (\S+)/)?.[1] ?? "";
  const amt = t.match(/Amount \((CAD|USD)\) : ([\d.]+)/i);
  const currency = (amt?.[1] ?? "CAD").toUpperCase();
  const amount = amt?.[2] ?? "";

  // Bill-To company name: text after "Amount (CUR) : <n>" up to its street number.
  const billBlock = t.match(/Amount \((?:CAD|USD)\) : [\d.]+\s+(.*?)\s+Terms:/i)?.[1] ?? "";
  const billToName = billBlock.split(/\s+\d/)[0]!.trim();

  // ---- Charges ("Sr. Charges Amount … Total <n>") ----
  const charges: ChargeInput[] = [];
  const chargeBlock = t.match(/Sr\. Charges Amount (.*?) Total ([\d.]+)/)?.[1] ?? "";
  const chargeRe = /(\d+)\s+(.+?)\s+(\d+\.\d{2})(?=\s+\d+\s+\S|\s*$)/g;
  let cm: RegExpExecArray | null;
  while ((cm = chargeRe.exec(chargeBlock)) !== null) {
    charges.push({ description: cm[2]!.trim(), amount: cm[3]! });
  }
  if (charges.length === 0 && amount) charges.push({ description: "Freight Charge", amount });
  if (charges.length === 0) charges.push({ description: "Freight Charge", amount: "" });

  // ---- Stops (shipper + consignees), between the first Shipper anchor and "Bill To") ----
  const stops: StopInput[] = [];
  const stopRegion = t.match(new RegExp(`${esc(SHIPPER_ANCHOR)} (.*?) Bill To Order #`))?.[1] ?? "";
  if (!stopRegion) {
    warnings.push("Couldn't locate the shipper/consignee section — please fill the stops in manually.");
  } else {
    const blocks = stopRegion.split(new RegExp(`\\s*${esc(CONSIGNEE_ANCHOR)}\\s*`));
    blocks.forEach((block, i) => {
      const stop = parseStopBlock(block, i === 0 ? "pickup" : "delivery");
      if (stop) stops.push(stop);
    });
  }
  if (!stops.some((s) => s.type === "pickup")) warnings.push("No shipper (pickup) stop was detected.");
  if (!stops.some((s) => s.type === "delivery")) warnings.push("No consignee (delivery) stop was detected.");

  const load: LoadInput = {
    organizationId: "",
    orderNumber,
    orderDate,
    pickupDate,
    customerReference,
    accountManagerId: "",
    currency: currency === "USD" ? "USD" : "CAD",
    specialInstructions: "",
    charges,
    stops: stops.length ? stops : [emptyStop("pickup"), emptyStop("delivery")],
  };

  return { load, billToName, warnings };
}

function parseStopBlock(block: string, type: StopType): StopInput | null {
  const b = block.trim();
  if (!b) return null;

  // Split location info from the commodity table.
  const [locPart, commPart = ""] = b.split(COMMODITY_HEADER);

  // Notes
  let beforeNotes = locPart!;
  let notes = "";
  const nIdx = locPart!.search(/Notes:/);
  if (nIdx >= 0) {
    beforeNotes = locPart!.slice(0, nIdx);
    notes = locPart!.slice(nIdx + "Notes:".length).trim();
  }

  // Date ("MM/DD/YYYY hh:mm AM/PM"); everything before it is name + address.
  let dateStr = "";
  let nameAddr = beforeNotes.trim();
  const dm = beforeNotes.match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M)/i);
  if (dm) {
    dateStr = dm[1]!;
    nameAddr = beforeNotes.slice(0, dm.index).trim();
  }

  // Name vs address: address is the trailing "<#street>, <city>, <REGION>, <postal>, <country>".
  let name = nameAddr;
  let addrRaw = "";
  // Address start: a street number at a token boundary (not preceded by "#" or a
  // digit, so store numbers like "#395" stay with the name and we don't start
  // mid-number), running to "<city>, <REGION>, <postal>, <country>".
  const am = nameAddr.match(
    /^(.*?)((?<![#\d])\d[^,)]*,\s*[^,]+,\s*[A-Za-z]{2},\s*[A-Za-z0-9 ]+,\s*(?:Canada|United States|USA|US|CA))\s*$/i,
  );
  if (am) {
    name = am[1]!.trim();
    addrRaw = am[2]!.trim();
  }
  const addr = parseAddress(addrRaw);

  return {
    type,
    name,
    addressLine1: addr.addressLine1,
    addressLine2: "",
    city: addr.city,
    region: addr.region,
    postalCode: addr.postalCode,
    country: addr.country || "CA",
    plannedFromAt: parseSheetDate(dateStr),
    plannedToAt: "",
    actualAt: "",
    contactPerson: "",
    phone: "",
    notes,
    commodities: parseCommodities(commPart),
  };
}

/** Fully-populated commodity so the result can seed the controlled review form. */
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

/** Best-effort commodity rows. Each row ends with the 4-dp ValueOfGoods (e.g. "0.0000"). */
function parseCommodities(part: string): CommodityInput[] {
  const p = part.trim();
  const out: CommodityInput[] = [];
  if (p) {
    const rowRe = /(.+?\d\.\d{4})(?=\s|$)/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(p)) !== null) {
      const c = parseCommodityRow(m[1]!.trim());
      if (c) out.push(c);
    }
  }
  return out.length ? out : [emptyCommodity()];
}

function parseCommodityRow(row: string): CommodityInput | null {
  if (!row) return null;
  const name = row.match(/^(.*?)\s+\d/)?.[1]?.trim() ?? row.trim();
  const pkgQty = cleanNumber(row.match(/(\d+\.\d{2})\s+Pieces/i)?.[1]);
  const pkgUnit = /Pieces/i.test(row) ? "Pieces" : "Pieces";
  const weight = cleanNumber(row.match(/(\d+\.\d{3})\s+Pounds/i)?.[1]);
  const weightUnit = /Pounds/i.test(row) ? "Pounds" : "Pounds";
  // Equipment sits between the LxBxH ("…0") and the rate method ("Flat").
  const equipment = (row.match(/0\s+([A-Za-z][A-Za-z,/ ]*?)\s+Flat\b/)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const valueOfGoods = cleanNumber(row.match(/(\d+\.\d{4})\s*$/)?.[1]);
  return {
    commodity: name,
    pkgQty,
    pkgUnit,
    weight,
    weightUnit,
    lengthIn: "",
    breadthIn: "",
    heightIn: "",
    equipment,
    rateMethod: /\bFlat\b/.test(row) ? "Flat" : "",
    reefer: false,
    valueOfGoods,
  };
}

function emptyStop(type: StopType): StopInput {
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

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
