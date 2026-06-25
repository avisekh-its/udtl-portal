"use client";

import { useState, useTransition } from "react";
import { setPasswordAction, finishCreditOnboardingAction } from "./actions";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES, validatePassword } from "@/lib/password";

export function SetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  // Mandatory credit-application download gate (shown after password set when
  // the account is Awaiting Credit).
  const [awaitingCredit, setAwaitingCredit] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [finishing, startFinishing] = useTransition();

  const check = validatePassword(password);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Client-side guard; the server re-validates as the real gate.
    if (!check.ok) {
      setError(check.errors[0] ?? "Password does not meet the requirements.");
      return;
    }
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await setPasswordAction(formData);
      if (result?.error) setError(result.error);
      else if (result?.awaitingCredit) setAwaitingCredit(true);
    });
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 disabled:opacity-60";

  // Mandatory-download gate: the user must download the credit application
  // before they can continue.
  if (awaitingCredit) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-3 py-2.5 text-sm text-[var(--color-success)]">
          Your password is set.
        </div>
        <div className="rounded-lg border border-[var(--color-secondary)]/30 bg-[var(--color-secondary)]/5 p-4 text-sm">
          <p className="font-medium text-slate-800">One more step — download the credit application</p>
          <p className="mt-1 text-slate-600">
            Your account is <strong>Awaiting Credit</strong>. Download UDTL&apos;s credit application,
            complete it, and return it to UDTL. Your account activates once our team confirms it&apos;s
            received. We&apos;ve also emailed you a copy.
          </p>
          <a
            href="/credit-application.pdf"
            download
            onClick={() => setDownloaded(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-secondary)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-secondary-700)]"
          >
            Download credit application (PDF)
          </a>
        </div>
        <button
          type="button"
          disabled={!downloaded || finishing}
          onClick={() => startFinishing(() => finishCreditOnboardingAction())}
          className="w-full rounded-lg bg-[var(--color-secondary)] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {finishing ? "Continuing…" : downloaded ? "Continue" : "Download the application to continue"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]"
        >
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          disabled={pending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          className={inputCls}
        />
        <ul className="mt-2 space-y-1">
          {PASSWORD_RULES.map((rule, i) => {
            // Map each rule to its corresponding validator outcome by index of
            // the failing messages; simplest: re-check per rule below.
            const met = isRuleMet(i, password);
            return (
              <li
                key={rule}
                className={`flex items-center gap-1.5 text-xs ${
                  met ? "text-[var(--color-success)]" : "text-slate-400"
                }`}
              >
                <span aria-hidden>{met ? "✓" : "○"}</span>
                {rule}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-700">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
          placeholder="Re-enter your password"
          className={inputCls}
        />
      </div>
      <button
        type="submit"
        disabled={pending || !check.ok}
        className="w-full rounded-lg bg-[var(--color-secondary)] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

/** Per-rule status for the live checklist (indices match PASSWORD_RULES). */
function isRuleMet(index: number, pw: string): boolean {
  switch (index) {
    case 0:
      return pw.length >= PASSWORD_MIN_LENGTH;
    case 1:
      return /[a-z]/.test(pw) && /[A-Z]/.test(pw);
    case 2:
      return /[0-9]/.test(pw);
    case 3:
      return /[^A-Za-z0-9]/.test(pw);
    default:
      return false;
  }
}
