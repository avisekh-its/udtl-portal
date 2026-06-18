"use client";

import { useEffect, useRef, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

    const supabase = createSupabaseBrowserClient();

    (async () => {
      try {
        if (hashError) throw new Error(hashError);

        // Establish the session from whichever form the email link delivered:
        //   1. detectSessionInUrl may already have consumed the hash.
        //   2. #access_token/#refresh_token — implicit flow (default Supabase
        //      template, {{ .ConfirmationURL }} → verify → hash redirect).
        //   3. ?token_hash&type — PKCE/OTP flow (custom template, {{ .TokenHash }}).
        //   4. ?code — PKCE exchange.
        let session = (await supabase.auth.getSession()).data.session;
        if (!session && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          session = (await supabase.auth.getSession()).data.session;
        } else if (!session && tokenHash && otpType) {
          const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
          if (error) throw error;
          session = (await supabase.auth.getSession()).data.session;
        } else if (!session && code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = (await supabase.auth.getSession()).data.session;
        }
        if (!session) throw new Error("no session");

        // The @supabase/ssr browser client flushes the auth cookie
        // asynchronously. Wait until it's actually written so the server-side
        // navigation target can read the session (otherwise middleware bounces
        // us back to /login). Then hard-navigate so the server picks it up.
        for (let i = 0; i < 30 && !document.cookie.includes("-auth-token"); i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
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
