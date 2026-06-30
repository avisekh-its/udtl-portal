"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signInAction } from "./actions";
import { IconMail, IconLock, IconEye, IconEyeOff } from "@/components/icons";

// Inlined at build time (NEXT_PUBLIC_*). Enables the live Google/Microsoft
// buttons; otherwise they render as disabled "soon" placeholders.
const ssoEnabled = process.env.NEXT_PUBLIC_SSO_ENABLED === "true";

type MessageTone = "error" | "success" | "info";

// Dark-panel tones (the sign-in panel is now dark).
const TONE_STYLES: Record<MessageTone, string> = {
  error: "border-red-500/40 bg-red-500/10 text-red-300",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  info: "border-[var(--color-secondary)]/40 bg-[var(--color-secondary)]/10 text-orange-300",
};

export function LoginForm({
  initialMessage,
  initialTone = "error",
}: {
  initialMessage?: string;
  initialTone?: MessageTone;
}) {
  const [message, setMessage] = useState<{ text: string; tone: MessageTone } | null>(
    initialMessage ? { text: initialMessage, tone: initialTone } : null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await signInAction(formData);
      // A failed sign-in is always an error.
      if (result?.error) setMessage({ text: result.error, tone: "error" });
    });
  }

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-10 pr-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/25 disabled:opacity-60";
  const iconCls =
    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-white/50";

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        {message && (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            className={`rounded-lg border px-3 py-2 text-sm ${TONE_STYLES[message.tone]}`}
          >
            {message.text}
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="email" className={labelCls}>
            Email address
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
            <label htmlFor="password" className={labelCls}>
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-white/40 transition hover:text-white/80"
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
      <div className="flex items-center gap-3 text-xs text-white/40">
        <span className="h-px flex-1 bg-white/10" />
        OR
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {/* SSO — UDTL staff only (mixed mode; password login still works). */}
      <div className="space-y-2">
        {ssoEnabled ? (
          <>
            <SsoButton provider="Google" href="/auth/sso/google" />
            <SsoButton provider="Microsoft" href="/auth/sso/microsoft" />
            <p className="text-center text-[11px] text-white/40">
              Use the same email as your account
            </p>
          </>
        ) : (
          <>
            <SsoButton provider="Google" />
            <SsoButton provider="Microsoft" />
            <p className="text-center text-[11px] text-white/40">
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
    "relative flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm font-medium";

  if (href) {
    return (
      <a href={href} className={`${base} text-white transition hover:bg-white/10 hover:border-white/20`}>
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
      className={`${base} cursor-not-allowed text-white/50`}
    >
      <span className="opacity-40">
        <ProviderIcon provider={provider} />
      </span>
      Continue with {provider}
      <span className="absolute right-3 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
        soon
      </span>
    </button>
  );
}
