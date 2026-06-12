/**
 * Load domain logic shared by the form (client) and actions (server).
 * Mapped to UDTL's order sheet: 1 shipper (pickup) + 1+ consignees (delivery),
 * each stop carrying a commodity block; order-level charges → total.
 * Status lifecycle per FRD §6. Pure module — no server-only imports.
 */
export const LOAD_STATUSES = ["new", "assigned", "in_transit", "delivered", "cancelled"] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const ORDER: Record<LoadStatus, number> = {
  new: 0,
  assigned: 1,
  in_transit: 2,
  delivered: 3,
  cancelled: 99,
};

export function isBackwardTransition(from: LoadStatus, to: LoadStatus): boolean {
  if (from === to) return false;
  if (to === "cancelled") return false;
  if (from === "cancelled") return true;
  return ORDER[to] < ORDER[from];
}

export type StopType = "pickup" | "delivery";

/** One commodity row in a stop's commodity block (order sheet). */
export interface CommodityInput {
  commodity?: string;
  pkgQty?: string;
  pkgUnit?: string;
  weight?: string;
  weightUnit?: string;
  lengthIn?: string;
  breadthIn?: string;
  heightIn?: string;
  equipment?: string;
  rateMethod?: string;
  reefer?: boolean;
  valueOfGoods?: string;
}

export interface StopInput {
  /** pickup = shipper, delivery = consignee. */
  type: StopType;
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  country?: string;
  /** Order-sheet "Date" (planned). plannedToAt optional for a window. */
  plannedFromAt?: string;
  plannedToAt?: string;
  actualAt?: string;
  contactPerson?: string;
  phone?: string;
  notes?: string;
  commodities: CommodityInput[];
}

/** Order-level charge line (e.g. Freight Charge). */
export interface ChargeInput {
  description: string;
  amount?: string;
}

export interface LoadInput {
  organizationId: string;
  orderNumber?: string;
  orderDate?: string;
  pickupDate?: string;
  customerReference?: string;
  accountManagerId?: string;
  currency?: string;
  specialInstructions?: string;
  charges: ChargeInput[];
  stops: StopInput[];
}

/** Validate a load input. Returns an error string, or null if valid.
 *  NOTE: missing stop contact/phone is NOT an error — it's a confirm prompt
 *  handled in the UI (see stopsMissingContact). */
export function validateLoadInput(input: LoadInput): string | null {
  if (!input.organizationId) return "Choose a customer for this load.";
  if (!input.stops || input.stops.length === 0) return "Add at least one stop.";
  const hasShipper = input.stops.some((s) => s.type === "pickup");
  const hasConsignee = input.stops.some((s) => s.type === "delivery");
  if (!hasShipper) return "Add a shipper (pickup) stop.";
  if (!hasConsignee) return "Add at least one consignee (delivery) stop.";
  for (let i = 0; i < input.stops.length; i++) {
    const s = input.stops[i]!;
    if (!s.city || !s.city.trim()) {
      return `${s.type === "pickup" ? "Shipper" : "Consignee"}: city is required.`;
    }
    if (s.plannedFromAt && s.plannedToAt && s.plannedToAt < s.plannedFromAt) {
      return "A stop's planned window end is before its start.";
    }
  }
  return null;
}

/** Labels of stops whose Contact Person OR Phone is blank (for the confirm rule). */
export function stopsMissingContact(input: LoadInput): string[] {
  const labels: string[] = [];
  let shipper = 0;
  let consignee = 0;
  for (const s of input.stops) {
    const label = s.type === "pickup" ? `Shipper${++shipper > 1 ? ` ${shipper}` : ""}` : `Consignee ${++consignee}`;
    if (!s.contactPerson?.trim() || !s.phone?.trim()) labels.push(label);
  }
  return labels;
}
