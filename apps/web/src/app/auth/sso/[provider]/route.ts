import { NextResponse } from "next/server";
import type { Provider } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Starts an SSO sign-in (FR-AUTH-003). New flow (Meeting 4): available to ANY
 * user — the email is validated against an existing, active DB user in
 * /auth/callback, so no Google/Microsoft workspace restriction is needed.
 * Mixed mode: password login still works for everyone.
 *
 * Route: /auth/sso/google  → Supabase "google"
 *        /auth/sso/microsoft → Supabase "azure" (Microsoft 365 / Entra ID)
 *
 * Requires the provider to be configured in the Supabase dashboard
 * (Authentication → Providers) with the client ID/secret + redirect URL
 * <APP_URL>/auth/callback. Dev uses the company's existing Load Assist Google
 * Workspace credentials.
 */
const PROVIDER_MAP: Record<string, Provider> = {
  google: "google",
  microsoft: "azure",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const mapped = PROVIDER_MAP[provider];
  if (!mapped) {
    return NextResponse.redirect(new URL("/login?error=sso_provider", request.url));
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const supabase = await createServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: mapped,
    options: {
      redirectTo: `${origin}/auth/callback?next=/&sso=1`,
      // Microsoft/Entra needs explicit scopes to return email + profile.
      scopes: mapped === "azure" ? "email openid profile" : undefined,
    },
  });

  if (error || !data?.url) {
    const u = new URL("/login?error=sso", request.url);
    if (error?.message) u.searchParams.set("detail", error.message.slice(0, 200));
    return NextResponse.redirect(u);
  }
  return NextResponse.redirect(data.url);
}
