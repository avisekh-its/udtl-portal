import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { LAST_ACTIVITY_COOKIE, activityCookieOptions } from "@/lib/session";

/**
 * Handles links from Supabase auth emails (password recovery + invitations)
 * AND the OAuth/SSO redirect. Supabase redirects here with a one-time `code`;
 * we exchange it for a session (sets the auth cookie), then send the user to
 * `next`. Falls back to /login on any error.
 *
 * SSO flow (Meeting 4, June 10) — decoupled from any Google/Microsoft workspace:
 * a user is created with email+password first; "Login with Google/Microsoft" is
 * just a convenience that VALIDATES THE SSO EMAIL AGAINST AN EXISTING, ACTIVE DB
 * USER. Available to everyone (staff + customers), any role. If no account exists
 * for that email (or it's inactive), the SSO sign-in is refused.
 *
 * Relies on Supabase identity-linking by email (default when emails are
 * confirmed — invited users are email_confirm=true), so OAuth links to the
 * SAME auth user and the profile lookup by id resolves the email-matched account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const isSso = url.searchParams.get("sso") === "1";

  // The provider/Supabase can redirect back with an error instead of a code
  // (e.g. "Unable to exchange external code" = OAuth client secret mismatch).
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) {
    console.error("[auth/callback] provider error:", providerError);
    const u = new URL(`/login?error=${isSso ? "sso" : "link"}`, request.url);
    u.searchParams.set("detail", String(providerError).slice(0, 200));
    return NextResponse.redirect(u);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link", request.url));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=link_expired", request.url));
  }

  if (isSso) {
    const rejected = await enforceSsoUser(supabase, request);
    if (rejected) return rejected;
  }

  // `next` is an internal path only — ignore absolute URLs to avoid open redirects.
  const safeNext = next.startsWith("/") ? next : "/";
  const response = NextResponse.redirect(new URL(safeNext, request.url));
  // Start a fresh idle clock on any successful auth-link / SSO sign-in.
  response.cookies.set(LAST_ACTIVITY_COOKIE, String(Date.now()), activityCookieOptions());
  return response;
}

/**
 * Allow SSO only for an existing, ACTIVE user (any role). Returns a redirect
 * (and signs the session out) if not allowed; null if the sign-in is allowed.
 */
async function enforceSsoUser(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  request: Request,
): Promise<NextResponse | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }

  const { data: profile } = await supabase
    .from("users")
    .select("active, email")
    .eq("id", user.id)
    .single();

  // No UDTL account for this email → must register with email+password first.
  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=sso_no_account", request.url));
  }
  // Account exists but isn't active yet (e.g. awaiting credit) or is disabled.
  if (!profile.active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=inactive", request.url));
  }

  // Stamp the provider + last login, and audit (service client so the
  // sso_provider write isn't blocked by the user's own RLS).
  const admin = createServiceClient();
  const providerName = (user.app_metadata?.provider as string | undefined) ?? null;
  await admin
    .from("users")
    .update({ sso_provider: providerName, last_login_at: new Date().toISOString() })
    .eq("id", user.id);
  await writeAudit({
    actorUserId: user.id,
    action: "auth.sso_login",
    entityType: "user",
    entityId: user.id,
    ip: await getRequestIp(),
  });

  return null;
}
