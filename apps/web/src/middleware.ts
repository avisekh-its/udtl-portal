/**
 * Session middleware.
 *
 * Runs on every request to:
 *   (a) refresh the Supabase auth session cookie,
 *   (b) gate access: unauthenticated users are bounced to /login; already
 *       signed-in users hitting /login are sent home (routed by role),
 *   (c) enforce a configurable idle timeout (FR-AUTH-005) via a sliding
 *       last-activity cookie.
 *
 * Role-specific gating (e.g. only staff in /ops) is done in the route layouts,
 * not here — middleware only knows "logged in or not", which keeps it fast.
 *
 * API routes do their OWN auth (the FleetHunt cron uses a bearer secret; health
 * is public), so we never redirect /api/* to the HTML login page — that would
 * break server-to-server calls. They still get session refresh.
 *
 * MFA-ready: when STAFF_MFA_REQUIRED is turned on later, this is where a staff
 * session's assurance level (Supabase AAL2) would be checked and a step-up
 * redirect issued. The user model and Supabase factors already support it; it's
 * intentionally a no-op until UDTL enables staff MFA.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  LAST_ACTIVITY_COOKIE,
  SESSION_IDLE_MINUTES as IDLE_MINUTES,
  activityCookieOptions,
} from "@/lib/session";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const PUBLIC_PATHS = ["/login", "/auth", "/forgot-password", "/unsubscribe", "/track"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession) so the token is validated server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api");

  // --- Idle timeout (authenticated, non-API requests only) ---
  if (user && !isApi) {
    const now = Date.now();
    const last = Number(request.cookies.get(LAST_ACTIVITY_COOKIE)?.value ?? 0);
    if (last && now - last > IDLE_MINUTES * 60_000) {
      await supabase.auth.signOut(); // clears auth cookies onto `response`
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "timeout");
      return withCookies(NextResponse.redirect(url), response, /* clearActivity */ true);
    }
    // Slide the window forward.
    response.cookies.set(LAST_ACTIVITY_COOKIE, String(now), activityCookieOptions());
  }

  // --- Access gating (skip API: those routes return their own 401/handle auth) ---
  if (!user && !isApi && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Send an already-signed-in user away from /login to their dashboard — UNLESS
  // we deliberately routed them here with an error (e.g. an inactive/credit-
  // pending user whose session still exists). Bouncing those back into the app
  // would loop them: /login -> / -> /portal -> requireUser -> /login -> …
  if (user && pathname === "/login" && !request.nextUrl.searchParams.has("error")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * Carry the auth-cookie mutations from `source` (e.g. the sign-out response)
 * onto a redirect response, optionally expiring the activity cookie.
 */
function withCookies(
  redirectResponse: NextResponse,
  source: NextResponse,
  clearActivity: boolean,
): NextResponse {
  source.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  if (clearActivity) {
    redirectResponse.cookies.set(LAST_ACTIVITY_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return redirectResponse;
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
