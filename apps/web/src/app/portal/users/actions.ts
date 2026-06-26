"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";

export interface AccessResult {
  ok?: boolean;
  error?: string;
}

type Admin = ReturnType<typeof createServiceClient>;
type Guard =
  | { error: string }
  | {
      actorId: string;
      orgId: string | null;
      admin: Admin;
      target: { id: string; role: string; organization_id: string | null; restricted: boolean };
    };

/**
 * A Customer Admin (capability `assign_orders_to_users`) may only manage a
 * customer user in their OWN organization, and never themselves. Reads/writes
 * use the service-role client (load_assigned_users has no customer write
 * policy); the org check below is the real gate.
 */
async function guard(targetUserId: string): Promise<Guard> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Not signed in." };
  if (!can(actor.role, "assign_orders_to_users")) {
    return { error: "You don't have permission to manage order access." };
  }
  if (actor.id === targetUserId) return { error: "You can't change your own access." };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("users")
    .select("id, role, organization_id, restricted")
    .eq("id", targetUserId)
    .single();
  if (!target) return { error: "User not found." };
  if (target.organization_id !== actor.organizationId) {
    return { error: "That user isn't in your company." };
  }
  return { actorId: actor.id, orgId: actor.organizationId, admin, target };
}

/** Confirm a load belongs to the same org before granting/revoking access. */
async function loadInOrg(admin: Admin, loadId: number, orgId: string | null): Promise<boolean> {
  const { data } = await admin
    .from("loads")
    .select("id, organization_id")
    .eq("id", loadId)
    .single();
  return !!data && data.organization_id === orgId;
}

/** Toggle a user's global "restricted" flag (sees only assigned orders). */
export async function setUserRestrictedAction(
  userId: string,
  restricted: boolean,
): Promise<AccessResult> {
  const g = await guard(userId);
  if ("error" in g) return { error: g.error };
  if (g.target.role !== "customer_user") {
    return { error: "Only Customer Users can be restricted. Customer Admins always see all orders." };
  }

  const { error } = await g.admin
    .from("users")
    .update({ restricted, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: g.actorId,
    action: restricted ? "user.access_restricted" : "user.access_unrestricted",
    entityType: "user",
    entityId: userId,
    after: { restricted },
    ip: await getRequestIp(),
  });

  revalidatePath(`/portal/users/${userId}`);
  revalidatePath("/portal/users");
  return { ok: true };
}

/** Grant a restricted user access to a specific order. */
export async function assignOrderAction(userId: string, loadId: number): Promise<AccessResult> {
  const g = await guard(userId);
  if ("error" in g) return { error: g.error };
  if (!(await loadInOrg(g.admin, loadId, g.orgId))) {
    return { error: "That order isn't in your company." };
  }

  // Check-then-insert (no unique constraint to rely on for upsert).
  const { data: existing } = await g.admin
    .from("load_assigned_users")
    .select("load_id")
    .eq("load_id", loadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) {
    const { error } = await g.admin
      .from("load_assigned_users")
      .insert({ load_id: loadId, user_id: userId });
    if (error) return { error: error.message };
    await writeAudit({
      actorUserId: g.actorId,
      action: "load.access_granted",
      entityType: "load",
      entityId: String(loadId),
      after: { userId },
      ip: await getRequestIp(),
    });
  }

  revalidatePath(`/portal/users/${userId}`);
  return { ok: true };
}

/** Revoke a restricted user's access to a specific order. */
export async function unassignOrderAction(userId: string, loadId: number): Promise<AccessResult> {
  const g = await guard(userId);
  if ("error" in g) return { error: g.error };

  const { error } = await g.admin
    .from("load_assigned_users")
    .delete()
    .eq("load_id", loadId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: g.actorId,
    action: "load.access_revoked",
    entityType: "load",
    entityId: String(loadId),
    after: { userId },
    ip: await getRequestIp(),
  });

  revalidatePath(`/portal/users/${userId}`);
  return { ok: true };
}
