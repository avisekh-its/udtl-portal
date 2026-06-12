/**
 * Idle-session config shared by the middleware (which enforces the timeout) and
 * the auth entry points (login / SSO / signout, which reset the clock).
 *
 * The activity cookie MUST be (re)started at each fresh authentication —
 * otherwise a stale cookie from a previous session can immediately trip the
 * idle timeout on the next login.
 */
export const LAST_ACTIVITY_COOKIE = "udtl_la";
export const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES ?? 60);

export function activityCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
