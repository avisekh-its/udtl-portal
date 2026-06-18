"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  can,
  STAFF_ROLES,
  CUSTOMER_ROLES,
  type UserRole,
} from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";

export interface InviteResult {
  ok?: boolean;
  error?: string;
}

const ALL_ROLES: UserRole[] = [...STAFF_ROLES, ...CUSTOMER_ROLES];

/**
 * Invite a user by email with a role + (for customer roles) an organization.
 * RBAC:
 *   - udtl_admin     → may invite ANY role.
 *   - udtl_staff     → may invite CUSTOMER roles only (any org).
 *   - customer_admin → may invite CUSTOMER roles, in their OWN org only.
 * Sends a Supabase invite email; the invitee sets a password via /auth/callback
 * → /account/set-password. If a credit form is required (Option B), the account
 * stays inactive until staff mark it received; otherwise it activates on password set.
 */
export async function inviteUserAction(formData: FormData): Promise<InviteResult> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Not signed in." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as UserRole;
  const restricted = formData.get("restricted") === "on";
  const creditFormRequested = formData.get("creditForm") === "on";
  let organizationId: string | null = String(formData.get("organizationId") ?? "").trim() || null;

  if (!email) return { error: "Email is required." };
  if (!ALL_ROLES.includes(role)) return { error: "Pick a valid role." };

  const isCustomerRole = CUSTOMER_ROLES.includes(role);

  // --- RBAC gate, derived from the FRD §4 matrix (lib/permissions) ---
  // Inviting a UDTL staff role requires `manage_udtl_users` (Admin only).
  // Inviting a customer user requires either `manage_customer_orgs` (Admin/Staff,
  // part of onboarding per FR-OPS-002) or `manage_own_company_users`
  // (Customer Admin, scoped to their own org).
  if (isCustomerRole) {
    const canOnboardAnyOrg = can(actor.role, "manage_customer_orgs");
    const canManageOwnOrg = can(actor.role, "manage_own_company_users");
    if (!canOnboardAnyOrg && !canManageOwnOrg) {
      return { error: "You don't have permission to invite users." };
    }
    if (!canOnboardAnyOrg && canManageOwnOrg) {
      organizationId = actor.organizationId; // customer admin → force own org
    }
  } else {
    if (!can(actor.role, "manage_udtl_users")) {
      return { error: "Only a UDTL Admin can invite staff users." };
    }
  }

  // Customer roles must belong to an org; UDTL roles must not.
  if (isCustomerRole && !organizationId) return { error: "Select an organization for this customer user." };
  if (!isCustomerRole) organizationId = null;

  // Credit-form gate is a UDTL-onboarding control: only honoured when an
  // org-manager (Admin/Staff) invites a CUSTOMER user.
  const creditFormRequired =
    creditFormRequested && isCustomerRole && can(actor.role, "manage_customer_orgs");

  const admin = createServiceClient();

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/account/set-password`,
  });
  if (error || !data?.user) {
    return { error: error?.message ?? "Could not send the invite." };
  }

  // Create the profile row (inactive until they choose a password).
  const { error: insertErr } = await admin.from("users").insert({
    id: data.user.id,
    email,
    role,
    organization_id: organizationId,
    restricted: isCustomerRole ? restricted : false,
    active: false,
    credit_form_required: creditFormRequired,
  });
  if (insertErr) {
    // Roll back the auth user so the invite can be retried cleanly.
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: `Could not create the user profile: ${insertErr.message}` };
  }

  await writeAudit({
    actorUserId: actor.id,
    action: "user.invited",
    entityType: "user",
    entityId: data.user.id,
    after: {
      email,
      role,
      organizationId,
      restricted: isCustomerRole ? restricted : false,
      creditFormRequired,
    },
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/users");
  revalidatePath("/portal/users");
  return { ok: true };
}

/** Orgs available for the invite form's org picker (staff view). */
export async function listOrganizations() {
  const supabase = await createServerClient();
  const { data } = await supabase.from("organizations").select("id, name").order("name");
  return data ?? [];
}

export interface UserActionResult {
  ok?: boolean;
  error?: string;
}

/**
 * Activate / deactivate a user (FR-OPS-001, FR-PORTAL-007).
 * RBAC:
 *   - Toggling a UDTL staff account requires `manage_udtl_users` (Admin only).
 *   - Toggling a customer account requires `manage_customer_orgs` (Admin/Staff,
 *     any org) OR `manage_own_company_users` (Customer Admin, own org only).
 * You can never deactivate yourself.
 */
export async function setUserActiveAction(
  userId: string,
  active: boolean,
): Promise<UserActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Not signed in." };
  if (actor.id === userId) return { error: "You can't change your own account status." };

  const admin = createServiceClient();
  const { data: target, error: readErr } = await admin
    .from("users")
    .select("id, role, organization_id, active")
    .eq("id", userId)
    .single();
  if (readErr || !target) return { error: "User not found." };

  const targetIsCustomer = CUSTOMER_ROLES.includes(target.role as UserRole);

  let allowed = false;
  if (targetIsCustomer) {
    if (can(actor.role, "manage_customer_orgs")) {
      allowed = true;
    } else if (
      can(actor.role, "manage_own_company_users") &&
      target.organization_id === actor.organizationId
    ) {
      allowed = true;
    }
  } else {
    // Target is a UDTL staff account → admin only.
    allowed = can(actor.role, "manage_udtl_users");
  }
  if (!allowed) return { error: "You don't have permission to change this user." };

  const { error } = await admin
    .from("users")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: active ? "user.reactivated" : "user.deactivated",
    entityType: "user",
    entityId: userId,
    before: { active: target.active },
    after: { active },
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/users");
  revalidatePath("/portal/users");
  return { ok: true };
}

/**
 * Mark a user's credit form as received (Option B). Staff confirm UDTL got the
 * signed PDF out-of-band; this activates the account. Requires
 * `manage_customer_orgs` (Admin/Staff). No form contents are stored — only the
 * flag + who/when.
 */
export async function markCreditReceivedAction(userId: string): Promise<UserActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Not signed in." };
  if (!can(actor.role, "manage_customer_orgs")) {
    return { error: "You don't have permission to do this." };
  }

  const admin = createServiceClient();
  const { data: target, error: readErr } = await admin
    .from("users")
    .select("id, credit_form_required, credit_form_received")
    .eq("id", userId)
    .single();
  if (readErr || !target) return { error: "User not found." };
  if (!target.credit_form_required) return { error: "This user doesn't require a credit form." };
  if (target.credit_form_received) return { ok: true };

  const { error } = await admin
    .from("users")
    .update({
      credit_form_received: true,
      credit_form_received_at: new Date().toISOString(),
      credit_form_received_by: actor.id,
      active: true, // activation gate cleared
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: "user.credit_form_received",
    entityType: "user",
    entityId: userId,
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/users");
  revalidatePath("/portal/users");
  return { ok: true };
}

/** DataTable row-action adapter: maps kebab action keys to user actions. */
export async function userRowAction(
  actionKey: string,
  rowId: string,
): Promise<{ error?: string }> {
  if (actionKey === "deactivate") return setUserActiveAction(rowId, false);
  if (actionKey === "reactivate") return setUserActiveAction(rowId, true);
  if (actionKey === "mark_credit_received") return markCreditReceivedAction(rowId);
  return { error: "Unknown action." };
}
