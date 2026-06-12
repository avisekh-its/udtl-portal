import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Verifies email links that carry a `token_hash` + `type` (Supabase's
 * recommended SSR pattern for recovery / invite / signup confirmations).
 * This is what our SendGrid email templates point at:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/account/set-password
 * On success it establishes a session and forwards to `next`.
 *
 * (PKCE `?code=` links are handled by /auth/callback instead.)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/";

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=link", request.url));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=link_expired", request.url));
  }

  const safeNext = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, request.url));
}
