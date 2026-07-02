import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createServiceClient } from "@/lib/supabase/server";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/loads";
import { formatDelay, isOnTime, stopDeadline, type RawStop } from "@/lib/reports/on-time";
import type { ReportResult } from "@/lib/reports/types";

const M = 48;
const W = 612;
const H = 792;
const ORANGE = rgb(0.91, 0.36, 0.11);
const SLATE = rgb(0.2, 0.23, 0.27);
const MUTED = rgb(0.5, 0.55, 0.6);
const BORDER = rgb(0.85, 0.87, 0.9);

const dtFmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const fmtDt = (iso: string | null) => (iso ? dtFmt.format(new Date(iso)) : "—");
const money = (cents: number | null, cur: string) => (cents == null ? "—" : `$${(cents / 100).toFixed(2)} ${cur}`);

// The StandardFonts (Helvetica) can only encode WinAnsi/CP1252. A single stray
// glyph — an arrow, an emoji, a CJK character from a pasted address — makes
// drawText throw and 500s the whole export. Sanitize every string we draw:
// keep ASCII + Latin-1 + the CP1252 punctuation extras, transliterate the few
// symbols we intentionally emit, and drop anything else to a "?".
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const TRANSLIT: Record<string, string> = { "→": "->", "←": "<-", "↑": "^", "↓": "v", "★": "*", "✓": "Y" };
function winAnsi(s: string): string {
  if (!s) return s;
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRAS.has(cp)) out += ch;
    else out += TRANSLIT[ch] ?? "?";
  }
  return out;
}

/** Minimal top-down writer over a pdf-lib document with auto page breaks. */
function writer(doc: PDFDocument, reg: PDFFont, bold: PDFFont) {
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const need = (h: number) => {
    if (y - h < M) newPage();
  };
  const fit = (s: string, max: number, size: number, font: PDFFont) => {
    let t = s ?? "";
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1);
    return t === s ? s : t.replace(/.$/, "…");
  };
  const text = (s: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = opts.size ?? 10;
    need(size + 5);
    page.drawText(winAnsi(s), { x: opts.x ?? M, y: y - size, size, font: opts.bold ? bold : reg, color: opts.color ?? SLATE });
    y -= size + 5;
  };
  /** Draw one row of cells at the current y without advancing extra. */
  const cells = (
    items: { text: string; x: number; w: number; bold?: boolean; color?: ReturnType<typeof rgb> }[],
    size = 9,
  ) => {
    need(size + 6);
    for (const c of items) {
      page.drawText(fit(winAnsi(c.text), c.w, size, c.bold ? bold : reg), {
        x: c.x,
        y: y - size,
        size,
        font: c.bold ? bold : reg,
        color: c.color ?? SLATE,
      });
    }
    y -= size + 6;
  };
  const rule = () => {
    need(10);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: BORDER });
    y -= 10;
  };
  const gap = (h = 8) => {
    y -= h;
  };
  return { text, cells, rule, gap, getPage: () => page };
}

async function fonts(doc: PDFDocument) {
  return { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

/** Performance report → PDF bytes. */
export async function buildReportPdf(result: ReportResult, customerName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { reg, bold } = await fonts(doc);
  const w = writer(doc, reg, bold);
  const k = result.kpis;
  const f = result.filters;
  const pct = (v: number | null) => (v == null ? "n/a" : `${v}%`);

  w.text("United Dhillon Trucking Lines", { size: 11, bold: true, color: ORANGE });
  w.text("Performance Report", { size: 18, bold: true });
  w.gap(2);
  w.text(`Customer: ${customerName}    Range: ${f.from} to ${f.to}`, { size: 10, color: MUTED });
  w.text(`Status: ${f.status}    Stop type: ${f.stopType}    Generated: ${fmtDt(result.generatedAt)} UTC`, { size: 9, color: MUTED });
  w.gap(6);
  w.rule();

  w.text("Key metrics", { size: 12, bold: true });
  w.gap(2);
  const kpiRows: [string, string][] = [
    ["On-time delivery", pct(k.onTimeDeliveryPct)],
    ["On-time pickup", pct(k.onTimePickupPct)],
    ["On-time overall", pct(k.onTimeOverallPct)],
    ["Loads in range", String(k.totalLoads)],
    ["Measured stops", String(k.measuredStops)],
    ["Late loads", String(k.lateLoads)],
    ["Avg delay (late loads)", formatDelay(k.avgDelayLateLoadsMin)],
  ];
  for (const [label, val] of kpiRows) {
    w.cells([
      { text: label, x: M, w: 200 },
      { text: val, x: M + 220, w: 160, bold: true },
    ], 10);
  }
  w.gap(6);

  if (result.statusVolume.length) {
    w.text("Volume by status", { size: 12, bold: true });
    w.gap(2);
    for (const v of result.statusVolume) {
      w.cells([
        { text: v.label, x: M, w: 200 },
        { text: String(v.count), x: M + 220, w: 80, bold: true },
      ], 10);
    }
    w.gap(6);
  }

  w.rule();
  w.text(`Late stop exceptions (${result.exceptions.length})`, { size: 12, bold: true });
  w.gap(2);
  const cols = { load: M, cust: M + 80, stop: M + 200, plan: M + 285, act: M + 390, delay: M + 490 };
  w.cells(
    [
      { text: "Load", x: cols.load, w: 76, bold: true, color: MUTED },
      { text: "Customer", x: cols.cust, w: 116, bold: true, color: MUTED },
      { text: "Stop", x: cols.stop, w: 80, bold: true, color: MUTED },
      { text: "Planned", x: cols.plan, w: 100, bold: true, color: MUTED },
      { text: "Actual", x: cols.act, w: 96, bold: true, color: MUTED },
      { text: "Delay", x: cols.delay, w: 56, bold: true, color: MUTED },
    ],
    9,
  );
  if (result.exceptions.length === 0) {
    w.text("No late stops in this period.", { size: 10, color: MUTED });
  }
  for (const e of result.exceptions) {
    w.cells(
      [
        { text: e.ref, x: cols.load, w: 76 },
        { text: e.customer, x: cols.cust, w: 116 },
        { text: `${e.stopKind} #${e.stopSeq}`, x: cols.stop, w: 80 },
        { text: fmtDt(e.plannedAt), x: cols.plan, w: 100 },
        { text: fmtDt(e.actualAt), x: cols.act, w: 96 },
        { text: formatDelay(e.delayMin), x: cols.delay, w: 56, color: ORANGE },
      ],
      9,
    );
  }

  return doc.save();
}

interface OrderRow {
  id: number;
  load_reference: string;
  order_number: string | null;
  status: string;
  order_date: string | null;
  pickup_date: string | null;
  per_load_cost_cents: number | null;
  per_load_cost_currency: string | null;
  organization: { name: string } | { name: string }[] | null;
  stops:
    | {
        sequence: number;
        type: string;
        name: string | null;
        city: string | null;
        region: string | null;
        planned_from_at: string | null;
        planned_to_at: string | null;
        actual_at: string | null;
      }[]
    | null;
  charges: { description: string; amount_cents: number }[] | null;
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Per-order summary → PDF bytes. Staff-only document (full internal detail). Null if the load is gone. */
export async function buildOrderSummaryPdf(loadId: number): Promise<Uint8Array | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("loads")
    .select(
      "id, load_reference, order_number, status, order_date, pickup_date, per_load_cost_cents, per_load_cost_currency, organization:organization_id ( name ), stops ( sequence, type, name, city, region, planned_from_at, planned_to_at, actual_at ), charges:load_charges ( description, amount_cents )",
    )
    .eq("id", loadId)
    .maybeSingle();
  if (!data) return null;
  const load = data as unknown as OrderRow;
  const cur = load.per_load_cost_currency || "CAD";
  const stops = [...(load.stops ?? [])].sort((a, b) => a.sequence - b.sequence);

  const doc = await PDFDocument.create();
  const { reg, bold } = await fonts(doc);
  const w = writer(doc, reg, bold);

  w.text("United Dhillon Trucking Lines", { size: 11, bold: true, color: ORANGE });
  w.text(`Order summary — ${load.order_number || load.load_reference}`, { size: 16, bold: true });
  w.gap(2);
  w.text(`Customer: ${one(load.organization)?.name ?? "—"}`, { size: 10, color: MUTED });
  w.text(
    `Status: ${LOAD_STATUS_LABELS[load.status as LoadStatus] ?? load.status}    Order date: ${fmtDt(load.order_date)}    Pickup: ${fmtDt(load.pickup_date)}`,
    { size: 9, color: MUTED },
  );
  w.gap(6);
  w.rule();

  w.text("Stops", { size: 12, bold: true });
  w.gap(2);
  const cols = { loc: M, type: M + 220, plan: M + 300, act: M + 405, ot: M + 500 };
  w.cells(
    [
      { text: "Location", x: cols.loc, w: 210, bold: true, color: MUTED },
      { text: "Type", x: cols.type, w: 74, bold: true, color: MUTED },
      { text: "Planned", x: cols.plan, w: 100, bold: true, color: MUTED },
      { text: "Actual", x: cols.act, w: 92, bold: true, color: MUTED },
      { text: "On-time", x: cols.ot, w: 56, bold: true, color: MUTED },
    ],
    9,
  );
  for (const s of stops) {
    const raw: RawStop = { type: s.type, sequence: s.sequence, planned_from_at: s.planned_from_at, planned_to_at: s.planned_to_at, actual_at: s.actual_at };
    const loc = [s.city, s.region].filter(Boolean).join(", ") || s.name || "—";
    const ot = !s.actual_at ? "—" : isOnTime(raw) ? "Yes" : "Late";
    w.cells(
      [
        { text: loc, x: cols.loc, w: 210 },
        { text: `${s.type} #${s.sequence}`, x: cols.type, w: 74 },
        { text: fmtDt(stopDeadline(raw)), x: cols.plan, w: 100 },
        { text: fmtDt(s.actual_at), x: cols.act, w: 92 },
        { text: ot, x: cols.ot, w: 56, color: ot === "Late" ? ORANGE : SLATE },
      ],
      9,
    );
  }
  w.gap(6);
  w.rule();

  if (load.charges?.length) {
    w.text("Charges", { size: 12, bold: true });
    w.gap(2);
    let total = 0;
    for (const c of load.charges) {
      total += c.amount_cents;
      w.cells([
        { text: c.description, x: M, w: 300 },
        { text: money(c.amount_cents, cur), x: M + 360, w: 120, bold: false },
      ], 10);
    }
    w.cells([
      { text: "Total", x: M, w: 300, bold: true },
      { text: money(total, cur), x: M + 360, w: 120, bold: true },
    ], 10);
  }

  return doc.save();
}
