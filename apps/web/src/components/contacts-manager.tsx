"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addContactAction, removeContactAction } from "@/app/ops/customers/actions";

export interface ContactRow {
  id: number;
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
}

const CONTACT_TYPES = ["billing", "dispatch", "operations", "other"];
const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 disabled:opacity-60";

export function ContactsManager({ orgId, contacts }: { orgId: string; contacts: ContactRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await addContactAction(orgId, formData);
      if (result.error) setError(result.error);
      else {
        form.reset();
        router.refresh();
      }
    });
  }

  function onRemove(contactId: number) {
    startTransition(async () => {
      const result = await removeContactAction(orgId, contactId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      {contacts.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{c.type}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(c.id)}
                      disabled={pending}
                      className="text-xs font-medium text-[var(--color-error)] hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={onAdd} className="card grid gap-3 p-4 sm:grid-cols-5">
        <select name="type" defaultValue="billing" disabled={pending} className={inputCls}>
          {CONTACT_TYPES.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </select>
        <input name="name" required placeholder="Name" disabled={pending} className={inputCls} />
        <input name="email" type="email" placeholder="Email" disabled={pending} className={inputCls} />
        <input name="phone" type="tel" placeholder="Phone" disabled={pending} className={inputCls} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add contact"}
        </button>
      </form>
    </div>
  );
}
