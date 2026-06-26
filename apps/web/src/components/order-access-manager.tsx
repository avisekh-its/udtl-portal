"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  setUserRestrictedAction,
  assignOrderAction,
  unassignOrderAction,
} from "@/app/portal/users/actions";

export interface AccessOrder {
  id: number;
  ref: string;
  route: string;
  status: string;
}

export function OrderAccessManager({
  userId,
  restricted: initialRestricted,
  orders,
  assignedIds,
}: {
  userId: string;
  restricted: boolean;
  orders: AccessOrder[];
  assignedIds: number[];
}) {
  const [restricted, setRestricted] = useState(initialRestricted);
  const [assigned, setAssigned] = useState<Set<number>>(new Set(assignedIds));
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) => o.ref.toLowerCase().includes(q) || o.route.toLowerCase().includes(q),
    );
  }, [orders, query]);

  function toggleRestricted() {
    const next = !restricted;
    setRestricted(next); // optimistic
    startTransition(async () => {
      const res = await setUserRestrictedAction(userId, next);
      if (res.error) {
        setRestricted(!next);
        toast.error(res.error);
      } else {
        toast.success(
          next
            ? "Restricted — this user now sees only the orders you assign."
            : "Full access — this user now sees all of your company's orders.",
        );
      }
    });
  }

  function toggleOrder(id: number) {
    const was = assigned.has(id);
    setAssigned((prev) => {
      const n = new Set(prev);
      if (was) n.delete(id);
      else n.add(id);
      return n;
    });
    startTransition(async () => {
      const res = was
        ? await unassignOrderAction(userId, id)
        : await assignOrderAction(userId, id);
      if (res.error) {
        setAssigned((prev) => {
          const n = new Set(prev);
          if (was) n.add(id);
          else n.delete(id);
          return n;
        });
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Access mode */}
      <div className="card flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-sm font-medium text-slate-800">Order access</div>
          <p className="mt-0.5 text-xs text-slate-500">
            {restricted
              ? "Restricted — sees only the orders assigned below."
              : "Full access — sees all of your company's orders."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleRestricted}
          role="switch"
          aria-checked={restricted}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${restricted ? "bg-[var(--color-secondary)]" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${restricted ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </div>

      {/* Order assignment list — only when restricted */}
      {restricted && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Assigned orders{" "}
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {assigned.size}
              </span>
            </h3>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search orders…"
              className="w-56 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No orders match.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-[var(--color-border)] overflow-y-auto">
              {filtered.map((o) => {
                const on = assigned.has(o.id);
                return (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2.5 transition hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleOrder(o.id)}
                        className="h-4 w-4 rounded border-slate-300 accent-[var(--color-secondary)]"
                      />
                      <span className="font-mono text-sm text-slate-800">{o.ref}</span>
                      <span className="truncate text-sm text-slate-500">{o.route || "—"}</span>
                      <span className="ml-auto text-xs capitalize text-slate-400">
                        {o.status.replace(/_/g, " ")}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
