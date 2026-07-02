"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { StatusChip, type StatusMap } from "@/components/status-chip";
import { IconSearch, IconKebab, IconDownload, IconPlus } from "@/components/icons";

export type Row = Record<string, unknown>;

export interface Column {
  key: string;
  header: string;
  /** Cell rendering style. Default "text". */
  type?: "text" | "mono" | "muted" | "status" | "link" | "primary";
  /** Pin this column to the left (use on the identifying column). */
  sticky?: boolean;
  align?: "left" | "right";
  /** For type "link": URL template with {key} placeholders, e.g. "/ops/customers/{id}". */
  linkTo?: string;
  /** For type "status": maps the cell value to a chip. */
  statusMap?: StatusMap;
  /** Secondary line shown under the cell (reads row[subKey]). */
  subKey?: string;
}

export interface RowAction {
  key: string;
  label: string;
  danger?: boolean;
  /** Navigation action: URL template with {key} placeholders. */
  linkTo?: string;
  /** Only show this action when row[key] === equals. */
  showWhen?: { key: string; equals: unknown };
  /** Ask before running (for consequential actions like deactivate).
   *  `message` supports {key} placeholders filled from the row. */
  confirm?: { title: string; message: string; confirmLabel?: string };
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface DataTableProps {
  title: string;
  columns: Column[];
  rows: Row[];
  idKey?: string;
  searchKeys?: string[];
  filters?: FilterDef[];
  exportFilename?: string;
  emptyMessage?: string;
  /** Primary action button in the header (e.g. "New customer"). */
  headerAction?: { label: string; href: string };
  rowActions?: RowAction[];
  /** Server action invoked for non-navigation row actions. */
  onRowAction?: (actionKey: string, rowId: string) => Promise<{ error?: string } | void>;
  /** Don't render the kebab for this row id (e.g. the current user). */
  hideActionsForRowId?: string;
  /** Rows per page (default 25). */
  initialPageSize?: number;
}

const PAGE_SIZES = [10, 25, 50, 100];
const ALL_ROWS = 100000; // "All" sentinel — one page big enough to hold any table

/** Page numbers with ellipses around the current page, e.g. [1,"…",4,5,6,"…",20]. */
function pageList(current: number, total: number): (number | "…")[] {
  const pages = new Set<number>([1, total]);
  for (let p = current - 1; p <= current + 1; p++) if (p >= 1 && p <= total) pages.add(p);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of [...pages].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function PageBtn({
  children,
  onClick,
  disabled,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`min-w-[28px] rounded-md px-2 py-1 text-xs font-medium tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-[var(--color-secondary)] text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function applyTemplate(tpl: string, row: Row): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(row[k] ?? ""));
}

function cellText(row: Row, key: string): string {
  const v = row[key];
  return v === null || v === undefined || v === "" ? "" : String(v);
}

export function DataTable({
  title,
  columns,
  rows,
  idKey = "id",
  searchKeys = [],
  filters = [],
  exportFilename,
  emptyMessage = "Nothing to show.",
  headerAction,
  rowActions = [],
  onRowAction,
  hideActionsForRowId,
  initialPageSize = 25,
}: DataTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ action: RowAction; rowId: string; row: Row } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && searchKeys.length) {
        const hit = searchKeys.some((k) => cellText(row, k).toLowerCase().includes(q));
        if (!hit) return false;
      }
      for (const f of filters) {
        const val = filterValues[f.key];
        if (val && String(row[f.key] ?? "") !== val) return false;
      }
      return true;
    });
  }, [rows, query, filterValues, searchKeys, filters]);

  const hasActions = rowActions.length > 0;

  // Pagination over the filtered set. Reset to page 1 when the result set changes.
  useEffect(() => {
    setPage(1);
  }, [query, filterValues, pageSize]);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  function exportCsv() {
    const head = columns.map((c) => c.header);
    const lines = [head, ...filtered.map((row) => columns.map((c) => cellText(row, c.key)))];
    const csv = lines
      .map((cols) => cols.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function runAction(actionKey: string, rowId: string) {
    setOpenMenu(null);
    setActionError(null);
    if (!onRowAction) return;
    startTransition(async () => {
      const res = await onRowAction(actionKey, rowId);
      if (res && "error" in res && res.error) setActionError(res.error);
      else router.refresh();
    });
  }

  const inputCls =
    "rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/15";

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
            {filtered.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {searchKeys.length > 0 && (
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className={`${inputCls} pl-8`}
              />
            </div>
          )}
          {filters.map((f) => (
            <select
              key={f.key}
              value={filterValues[f.key] ?? ""}
              onChange={(e) => setFilterValues((s) => ({ ...s, [f.key]: e.target.value }))}
              className={inputCls}
            >
              <option value="">{f.label}: All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {exportFilename && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <IconDownload className="h-4 w-4" /> Export
            </button>
          )}
          {headerAction && (
            <Link
              href={headerAction.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-secondary)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)]"
            >
              <IconPlus className="h-4 w-4" /> {headerAction.label}
            </Link>
          )}
        </div>
      </div>

      {actionError && (
        <div className="border-b border-[var(--color-error)]/20 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
          {actionError}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[#f7f8fa] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`whitespace-nowrap px-4 py-3 ${c.align === "right" ? "text-right" : ""} ${
                    c.sticky ? "sticky left-0 z-10 bg-[#f7f8fa]" : ""
                  }`}
                >
                  {c.header}
                </th>
              ))}
              {hasActions && <th className="px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  className="px-4 py-14 text-center"
                >
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <IconSearch className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm text-slate-400">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const rowId = String(row[idKey] ?? i);
                const zebra = "bg-white";
                const visibleActions = rowActions.filter(
                  (a) => !a.showWhen || row[a.showWhen.key] === a.showWhen.equals,
                );
                const showKebab =
                  hasActions && visibleActions.length > 0 && rowId !== hideActionsForRowId;
                return (
                  <tr
                    key={rowId}
                    className={`${zebra} border-b border-slate-100 transition last:border-0 hover:bg-[#fff5ef]`}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap px-4 py-3.5 align-middle ${c.align === "right" ? "text-right" : ""} ${
                          c.sticky ? "sticky left-0 z-[1] bg-inherit" : ""
                        }`}
                      >
                        <Cell column={c} row={row} />
                      </td>
                    ))}
                    {hasActions && (
                      <td className="relative px-3 py-2 text-right">
                        {showKebab && (
                          <>
                            <button
                              type="button"
                              onClick={() => setOpenMenu(openMenu === rowId ? null : rowId)}
                              disabled={pending}
                              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                              aria-label="Row actions"
                            >
                              <IconKebab className="h-4 w-4" />
                            </button>
                            {openMenu === rowId && (
                              <div
                                ref={menuRef}
                                className="absolute right-3 top-10 z-20 w-44 overflow-hidden rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg"
                              >
                                {visibleActions.map((a) =>
                                  a.linkTo ? (
                                    <Link
                                      key={a.key}
                                      href={applyTemplate(a.linkTo, row)}
                                      className="block px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                      onClick={() => setOpenMenu(null)}
                                    >
                                      {a.label}
                                    </Link>
                                  ) : (
                                    <button
                                      key={a.key}
                                      type="button"
                                      onClick={() => {
                                        if (a.confirm) {
                                          setOpenMenu(null);
                                          setConfirming({ action: a, rowId, row });
                                        } else {
                                          runAction(a.key, rowId);
                                        }
                                      }}
                                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                                        a.danger ? "text-[var(--color-error)]" : "text-slate-700"
                                      }`}
                                    >
                                      {a.label}
                                    </button>
                                  ),
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span className="tabular-nums">
              Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}
              {total !== rows.length ? ` (filtered from ${rows.length})` : ""}
            </span>
            <label className="flex items-center gap-1.5">
              Rows:
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[11px] text-slate-600 outline-none"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={ALL_ROWS}>All</option>
              </select>
            </label>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <PageBtn label="First page" onClick={() => setPage(1)} disabled={currentPage === 1}>
                «
              </PageBtn>
              <PageBtn label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                ‹
              </PageBtn>
              {pageList(currentPage, totalPages).map((p, idx) =>
                p === "…" ? (
                  <span key={`e${idx}`} className="px-1 text-slate-300">
                    …
                  </span>
                ) : (
                  <PageBtn key={p} active={p === currentPage} onClick={() => setPage(p)}>
                    {p}
                  </PageBtn>
                ),
              )}
              <PageBtn label="Next page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                ›
              </PageBtn>
              <PageBtn label="Last page" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}>
                »
              </PageBtn>
            </div>
          )}
        </div>
      )}

      {/* Confirm dialog for consequential row actions (e.g. deactivate) */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {confirming.action.confirm!.title}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {applyTemplate(confirming.action.confirm!.message, confirming.row)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={pending}
                className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  runAction(confirming.action.key, confirming.rowId);
                  setConfirming(null);
                }}
                disabled={pending}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
                  confirming.action.danger
                    ? "bg-[var(--color-error)] hover:bg-[#b93a3a]"
                    : "bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-700)]"
                }`}
              >
                {confirming.action.confirm!.confirmLabel ?? confirming.action.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ column, row }: { column: Column; row: Row }) {
  const text = cellText(row, column.key);
  const sub = column.subKey ? cellText(row, column.subKey) : "";

  if (column.type === "status") {
    const map = column.statusMap?.[text];
    return map ? <StatusChip label={map.label} tone={map.tone} /> : <span className="text-slate-400">—</span>;
  }
  if (column.type === "link" && column.linkTo) {
    return (
      <Link
        href={applyTemplate(column.linkTo, row)}
        className="font-medium text-[var(--color-secondary)] hover:underline"
      >
        {text || "—"}
      </Link>
    );
  }

  const cls =
    column.type === "mono"
      ? "font-mono text-[13px] text-slate-700"
      : column.type === "muted"
        ? "text-slate-500"
        : column.type === "primary"
          ? "font-medium text-slate-800"
          : "text-slate-700";

  return (
    <div>
      <div className={cls}>{text || <span className="text-slate-400">—</span>}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
