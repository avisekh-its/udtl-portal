import { redirect } from "next/navigation";
import { getCurrentUser, dashboardPathForRole } from "@/lib/auth";

/**
 * Entry point. Middleware guarantees a signed-in user reaches here; we send
 * them to the dashboard for their role (staff -> /ops, customers -> /portal).
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(dashboardPathForRole(user.role));
}
