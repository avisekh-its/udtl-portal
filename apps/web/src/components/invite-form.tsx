"use client";

import { useState, useTransition } from "react";
import { inviteUserAction } from "@/app/ops/users/actions";

export interface RoleOption {
  value: string;
  label: string;
  isCustomer: boolean;
}

export function InviteForm({
  roleOptions,
  orgs,
  lockedOrgId,
  allowCreditForm = false,
}: {
  roleOptions: RoleOption[];
  orgs: { id: string; name: string }[];
  lockedOrgId?: string | null;
  /** Show the "require credit form" option (UDTL staff onboarding only). */
  allowCreditForm?: boolean;
}) {
  const [role, setRole] = useState(roleOptions[0]?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = roleOptions.find((r) => r.value === role);
  const isCustomer = selected?.isCustomer ?? false;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setOk(null);
    startTransition(async () => {
      const result = await inviteUserAction(formData);
      if (result.error) setError(result.error);
      else {
        setOk(`Invite sent to ${formData.get("email")}.`);
        form.reset();
        setRole(roleOptions[0]?.value ?? "");
      }
    });
  }

  const fieldCls =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 disabled:opacity-60";

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <h3 className="text-sm font-semibold text-slate-800">Invite a user</h3>

      {error && (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-3 py-2 text-sm text-[var(--color-success)]">
          {ok}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-slate-600">
            Email
          </label>
          <input id="email" name="email" type="email" required disabled={pending} placeholder="person@company.com" className={fieldCls} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="role" className="block text-xs font-medium text-slate-600">
            Role
          </label>
          <select
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={pending}
            className={fieldCls}
          >
            {roleOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {isCustomer && !lockedOrgId && (
          <div className="space-y-1.5">
            <label htmlFor="organizationId" className="block text-xs font-medium text-slate-600">
              Organization
            </label>
            <select id="organizationId" name="organizationId" required disabled={pending} className={fieldCls} defaultValue="">
              <option value="" disabled>
                Select organization…
              </option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {isCustomer && lockedOrgId && <input type="hidden" name="organizationId" value={lockedOrgId} />}

        {isCustomer && (
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
            <input type="checkbox" name="restricted" className="h-4 w-4 rounded border-slate-300 accent-[var(--color-secondary)]" />
            Restricted (only assigned loads)
          </label>
        )}

        {isCustomer && allowCreditForm && (
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
            <input type="checkbox" name="creditForm" className="h-4 w-4 rounded border-slate-300 accent-[var(--color-secondary)]" />
            Require credit application (PDF) — activates once staff confirm it&apos;s received
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending invite…" : "Send invite"}
      </button>
    </form>
  );
}
