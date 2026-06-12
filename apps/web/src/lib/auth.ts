/**
 * Server-side auth + RBAC helpers.
 *
 * Identity comes from Supabase Auth (auth.getUser validates the JWT against
 * Supabase). The ROLE comes from our own `public.users` table — Supabase knows
 * *who* you are; we decide *what you can do*. RLS (already deployed) enforces
 * data isolation at the DB; these helpers enforce page/route access in the app.
 */
import "server-only";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { can, type Capability } from "@/lib/permissions";

export type UserRole =
  | "udtl_admin"
  | "udtl_staff"
  | "udtl_account_manager"
  | "customer_admin"
  | "customer_user";

/** Internal UDTL roles — full cross-tenant access. */
export const STAFF_ROLES: UserRole[] = ["udtl_admin", "udtl_staff", "udtl_account_manager"];
/** Customer-side roles — scoped to their own organization. */
export const CUSTOMER_ROLES: UserRole[] = ["customer_admin", "customer_user"];

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  organizationId: string | null;
  restricted: boolean;
  active: boolean;
}

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}
export function isCustomer(role: UserRole): boolean {
  return CUSTOMER_ROLES.includes(role);
}

/** Where a given role should land after login. */
export function dashboardPathForRole(role: UserRole): string {
  return isStaff(role) ? "/ops" : "/portal";
}

/**
 * Returns the logged-in user + their profile/role, or null if not signed in
 * (or signed in to Supabase but with no provisioned profile row yet).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS allows a user to read their own row (users_select: id = auth.uid()).
  const { data: profile } = await supabase
    .from("users")
    .select("id, email, name, role, organization_id, restricted, active")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role as UserRole,
    organizationId: profile.organization_id,
    restricted: profile.restricted,
    active: profile.active,
  };
}

/** Require any active, signed-in user. Redirects to /login otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.active) redirect("/login?error=inactive");
  return user;
}

/**
 * Require one of `allowed` roles. If signed in but not allowed, send the user
 * to their own dashboard (don't leak the existence of the area with a 403).
 */
export async function requireRole(allowed: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    redirect(dashboardPathForRole(user.role));
  }
  return user;
}

/** Require an internal UDTL staff role. */
export async function requireStaff(): Promise<CurrentUser> {
  return requireRole(STAFF_ROLES);
}

/**
 * Require a specific capability from the FRD §4 matrix. This is the preferred
 * gate for pages/actions tied to a permission rather than a coarse role bucket
 * (e.g. the audit viewer needs `view_audit_log`, which is Admin-only). If the
 * user lacks it, they're sent to their own dashboard rather than shown a 403.
 */
export async function requireCapability(capability: Capability): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, capability)) {
    redirect(dashboardPathForRole(user.role));
  }
  return user;
}

// Re-export so callers can `import { can } from "@/lib/auth"` alongside guards.
export { can, type Capability } from "@/lib/permissions";
