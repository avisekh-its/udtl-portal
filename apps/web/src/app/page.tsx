import { redirect } from "next/navigation";
import { getCurrentUser, dashboardPathForRole } from "@/lib/auth";

/**
 * Entry point. Middleware guarantees a signed-in user reaches here; we send
 * them to the dashboard for their role (staff -> /ops, customers -> /portal).
 */
export default async function Home() {
  const user = await getCurrentUser();
  // A session with no usable profile (e.g. a half-provisioned invite) must NOT
  // bounce back here — the `error` param exempts it from the middleware's
  // signed-in → home redirect, breaking what would otherwise be a redirect loop.
  if (!user) redirect("/login?error=session");
  redirect(dashboardPathForRole(user.role));
}
