"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signInAction } from "./actions";
import { IconMail, IconLock, IconEye, IconEyeOff } from "@/components/icons";

// Inlined at build time (NEXT_PUBLIC_*). Enables the live Google/Microsoft
// buttons; otherwise they render as disabled "soon" placeholders.
const ssoEnabled = process.env.NEXT_PUBLIC_SSO_ENABLED === "true";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await signInAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--color-border)] py-3 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 disabled:opacity-60";
  const iconCls =
    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400";

  return (
    <div className="space-y-5">
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
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <div className="relative">
            <IconMail className={iconCls} />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              disabled={pending}
              className={inputCls}
              placeholder="you@company.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[var(--color-secondary)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <IconLock className={iconCls} />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={pending}
              className={`${inputCls} pr-10`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-600"
            >
              {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[var(--color-secondary)] px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        OR
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      {/* SSO — UDTL staff only (mixed mode; password login still works). */}
      <div className="space-y-2">
        {ssoEnabled ? (
          <>
            <SsoButton provider="Google" href="/auth/sso/google" />
            <SsoButton provider="Microsoft" href="/auth/sso/microsoft" />
            <p className="text-center text-[11px] text-slate-400">
              Use the same email as your account
            </p>
          </>
        ) : (
          <>
            <SsoButton provider="Google" />
            <SsoButton provider="Microsoft" />
            <p className="text-center text-[11px] text-slate-400">
              Single sign-on with Google or Microsoft — coming soon
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * When `href` is provided the button navigates to the SSO start route;
 * otherwise it renders disabled ("soon") for environments where SSO providers
 * aren't configured yet.
 */
function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "Google") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
      </svg>
    );
  }
  // Microsoft
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function SsoButton({ provider, href }: { provider: string; href?: string }) {
  const base =
    "relative flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-3 text-sm font-medium";

  if (href) {
    return (
      <a href={href} className={`${base} text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow`}>
        <ProviderIcon provider={provider} />
        Continue with {provider}
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled
      title="Single sign-on is coming soon"
      className={`${base} cursor-not-allowed text-slate-500`}
    >
      <span className="opacity-40">
        <ProviderIcon provider={provider} />
      </span>
      Continue with {provider}
      <span className="absolute right-3 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        soon
      </span>
    </button>
  );
}
