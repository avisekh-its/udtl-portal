/**
 * Permission matrix — the single source of truth for "who can do what".
 *
 * This encodes the FRD §4 RBAC grid as data. Every screen and server action
 * gates on `can()` / `requireCapability()` (the latter in auth.ts) instead of
 * re-deriving role logic inline, so the matrix lives in exactly ONE place and
 * every later epic inherits it.
 *
 * Reconciling §4 with the operations console (FR-OPS-002): the §4 row
 * "Manage UDTL users & roles" is Admin-only, and "Create & manage own company's
 * users" is Customer-Admin-only. Staff onboarding of *customer* users is part of
 * customer-org management (`manage_customer_orgs`); the invite action composes
 * these capabilities rather than adding a separate matrix row.
 *
 * Pure module (no "server-only") so client components can use it for UI gating
 * — hiding a nav link is convenience; the real enforcement is server-side
 * (requireCapability) + RLS at the database.
 */
import type { UserRole } from "./auth";

export type Capability =
  | "manage_system_settings"
  | "manage_udtl_users"
  | "manage_customer_orgs"
  | "manage_own_company_users"
  | "assign_orders_to_users"
  | "create_edit_loads"
  | "update_status_dates_cost"
  | "assign_tracking_device"
  | "assign_account_manager"
  | "trigger_delayed_or_rating"
  | "view_all_loads"
  | "view_own_loads"
  | "add_comments"
  | "generate_tracking_links"
  | "manage_own_subscriptions"
  | "view_reports"
  | "export_reports"
  | "view_audit_log";

const ADMIN: UserRole = "udtl_admin";
const STAFF: UserRole = "udtl_staff";
const ACCT: UserRole = "udtl_account_manager";
const CUST_ADMIN: UserRole = "customer_admin";
const CUST_USER: UserRole = "customer_user";

/**
 * FRD §4, verbatim. Each capability lists the roles that hold it ("Yes" in the
 * grid). Anything not listed is denied.
 */
export const PERMISSION_MATRIX: Record<Capability, readonly UserRole[]> = {
  manage_system_settings:    [ADMIN],
  manage_udtl_users:         [ADMIN],
  manage_customer_orgs:      [ADMIN, STAFF],
  manage_own_company_users:  [CUST_ADMIN],
  assign_orders_to_users:    [CUST_ADMIN],
  create_edit_loads:         [ADMIN, STAFF],
  update_status_dates_cost:  [ADMIN, STAFF],
  assign_tracking_device:    [ADMIN, STAFF],
  assign_account_manager:    [ADMIN, STAFF],
  trigger_delayed_or_rating: [ADMIN, STAFF],
  view_all_loads:            [ADMIN, STAFF, ACCT],
  view_own_loads:            [CUST_ADMIN, CUST_USER],
  add_comments:              [ADMIN, STAFF, ACCT, CUST_ADMIN, CUST_USER],
  generate_tracking_links:   [ADMIN, STAFF, ACCT],
  manage_own_subscriptions:  [CUST_ADMIN, CUST_USER],
  view_reports:              [ADMIN, STAFF, ACCT],
  export_reports:            [ADMIN, STAFF, ACCT],
  view_audit_log:            [ADMIN],
} as const;

/** Does this role hold this capability? Pure, synchronous, safe on the client. */
export function can(role: UserRole, capability: Capability): boolean {
  return PERMISSION_MATRIX[capability].includes(role);
}

/** All capabilities a role holds — handy for debugging and tests. */
export function capabilitiesFor(role: UserRole): Capability[] {
  return (Object.keys(PERMISSION_MATRIX) as Capability[]).filter((c) => can(role, c));
}
