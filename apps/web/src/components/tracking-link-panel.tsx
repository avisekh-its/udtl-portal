"use client";

import { useState, useTransition } from "react";
import { generateTrackingLinkAction, revokeTrackingLinkAction } from "@/app/ops/loads/tracking-link-actions";

export interface TrackingLinkRow {
  id: number;
  token: string;
  recipientEmail: string | null;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

const origin = () => (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL) || "";
const fmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Winnipeg" });
const when = (iso: string) => fmt.format(new Date(iso));
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now();

export function TrackingLinkPanel({
  loadId,
  publicToken,
  links,
}: {
  loadId: number;
  publicToken: string;
  links: TrackingLinkRow[];
}) {
  const base = origin();
  const publicUrl = base ? `${base}/track/${publicToken}` : `/track/${publicToken}`;

  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<{ url?: string; emailed?: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  }

  function generate() {
    setResult(null);
    startTransition(async () => {
      const r = await generateTrackingLinkAction(loadId, email, days);
      setResult(r);
      if (r.ok) setEmail("");
    });
  }

  function revoke(id: number) {
    startTransition(async () => {
      await revokeTrackingLinkAction(id);
    });
  }

  const active = links.filter((l) => !l.revokedAt && !isExpired(l.expiresAt));

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Public tracking</h2>
      <p className="mt-1 text-xs text-slate-500">
        Share a no-login tracking page. The standing tracking number always works; one-time links expire and can be revoked.
      </p>

      {/* Permanent tracking number */}
      <div className="mt-4 space-y-2">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Tracking number</label>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700">{publicToken}</code>
          <button type="button" onClick={() => copy(publicToken, "num")} className="text-xs font-medium text-[var(--color-secondary)] hover:underline">
            {copied === "num" ? "Copied" : "Copy number"}
          </button>
          <button type="button" onClick={() => copy(publicUrl, "url")} className="text-xs font-medium text-[var(--color-secondary)] hover:underline">
            {copied === "url" ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      {/* One-time link */}
      <div className="mt-5 border-t border-[var(--color-border)] pt-4">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Email a one-time link</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com (optional)"
            className="min-w-[220px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-secondary)]"
          />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-[var(--color-secondary)]"
          >
            <option value={1}>Expires in 1 day</option>
            <option value={7}>Expires in 7 days</option>
            <option value={30}>Expires in 30 days</option>
          </select>
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Working…" : "Generate link"}
          </button>
        </div>

        {result?.error && <p className="mt-2 text-sm text-[var(--color-error)]">{result.error}</p>}
        {result?.url && (
          <div className="mt-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-3 py-2 text-sm text-slate-700">
            {result.emailed ? "Link emailed. " : ""}
            <span className="break-all font-mono text-xs">{result.url}</span>{" "}
            <button type="button" onClick={() => copy(result.url!, "gen")} className="font-medium text-[var(--color-secondary)] hover:underline">
              {copied === "gen" ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>

      {/* Active links */}
      {active.length > 0 && (
        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Active links ({active.length})</label>
          <ul className="mt-2 space-y-2">
            {active.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="text-slate-700">{l.recipientEmail || "Link"}</span>
                  <span className="text-slate-400"> · expires {when(l.expiresAt)}</span>
                  {l.lastUsedAt && <span className="text-slate-400"> · opened {when(l.lastUsedAt)}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => revoke(l.id)}
                  disabled={pending}
                  className="text-xs font-medium text-[var(--color-error)] hover:underline disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
