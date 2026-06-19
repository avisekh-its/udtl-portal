"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { BrandMark } from "@/components/brand-mark";

/**
 * Client handler for Supabase email-link sign-ins (invite + password recovery).
 * Those links use the implicit flow: tokens arrive in the URL **hash**
 * (#access_token…&type=invite), which the server never sees. We read the hash
 * client-side, establish the session, then hard-navigate to `next` (set-password)
 * so the server picks up the fresh session cookie.
 *
 * SSO/OAuth keeps using /auth/callback (server route, ?code / PKCE).
 */
export default function AuthConfirmPage() {
  const ran = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Capture the URL params BEFORE constructing the client: creating the
    // browser client triggers detectSessionInUrl, which immediately strips the
    // hash AND query (replaceState) — so reading `?next=` afterwards loses it.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const nextRaw = query.get("next") || "/";
    const next = nextRaw.startsWith("/") ? nextRaw : "/";

    const hashError = hash.get("error_description");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const code = query.get("code");
    const tokenHash = query.get("token_hash");
    const otpType = query.get("type") as EmailOtpType | null;

    // Dedicated client with detectSessionInUrl DISABLED. The default browser
    // client auto-processes the hash on construction, which raced with our
    // explicit exchange below and sometimes spent the one-time token first
    // (→ "link expired"). Here we are the single source of truth.
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { detectSessionInUrl: false } },
    );

    (async () => {
      try {
        if (hashError) throw new Error(hashError);

        // Establish the session from whichever form the email link delivered:
        //   - #access_token/#refresh_token — implicit flow (default Supabase
        //     template, {{ .ConfirmationURL }} → verify → hash redirect).
        //   - ?token_hash&type — PKCE/OTP flow (custom template, {{ .TokenHash }}).
        //   - ?code — PKCE exchange.
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash && otpType) {
          const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error("no credentials in link");
        }

        // The auth cookie is written async and (for large sessions) chunked.
        // Before navigating to a protected route, confirm the SERVER actually
        // sees the session — otherwise middleware bounces us to /login before
        // the cookie is readable. Poll a lightweight server probe.
        let serverReady = false;
        for (let i = 0; i < 50; i++) {
          try {
            if ((await fetch("/api/auth/check", { cache: "no-store" })).ok) {
              serverReady = true;
              break;
            }
          } catch {
            /* keep polling */
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!serverReady) throw new Error("session not established server-side");

        window.location.replace(next);
      } catch {
        setFailed(true);
        setTimeout(() => window.location.replace("/login?error=link_expired"), 1500);
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        {failed ? (
          <p className="text-sm text-[var(--color-error)]">
            That link is invalid or has expired. Redirecting…
          </p>
        ) : (
          <>
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-secondary)]" />
            <p className="text-sm text-slate-500">Verifying your link…</p>
          </>
        )}
      </div>
    </main>
  );
}
