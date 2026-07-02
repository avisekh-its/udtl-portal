"use client";

import Script from "next/script";
import { useActionState } from "react";
import { lookupTrackingAction, type LookupState } from "./actions";

const initial: LookupState = {};

export function TrackLookupForm() {
  const [state, formAction, pending] = useActionState(lookupTrackingAction, initial);
  const challenge = state.challenge;

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <input
        name="trackingNumber"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="e.g. trk_3f9a…"
        className="block w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 font-mono text-sm text-slate-800 outline-none focus:border-[var(--color-secondary)]"
      />

      {/* CAPTCHA — only appears after repeated failed attempts */}
      {state.requireCaptcha && challenge?.kind === "code" && (
        <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-3">
          <input type="hidden" name="captchaSig" value={challenge.sig} />
          <label className="block text-sm font-medium text-slate-700">Security check</label>
          <p className="mt-0.5 text-xs text-slate-500">Type the characters shown in the image.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={challenge.imageUri}
              alt="Verification code"
              width={200}
              height={64}
              className="rounded-lg border border-[var(--color-border)] bg-white"
            />
            <input
              name="captchaAnswer"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={5}
              placeholder="ABC12"
              className="w-32 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 font-mono text-sm uppercase tracking-widest outline-none focus:border-[var(--color-secondary)]"
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Hard to read? Submit anyway — you&apos;ll get a fresh image.</p>
        </div>
      )}
      {state.requireCaptcha && challenge?.kind === "hcaptcha" && (
        <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-3">
          <Script src="https://js.hcaptcha.com/1/api.js" async defer />
          <div className="h-captcha" data-sitekey={challenge.siteKey} />
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Searching…" : "Track"}
      </button>
    </form>
  );
}
