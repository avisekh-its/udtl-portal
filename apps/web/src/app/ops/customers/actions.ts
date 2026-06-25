"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getRequestIp, writeAudit } from "@/lib/audit";
import { inviteUserAction } from "@/app/ops/users/actions";

export interface OrgActionResult {
  ok?: boolean;
  id?: string;
  error?: string;
}

/** Pull the org fields from a FormData payload (shared by create + update). */
function readOrgFields(formData: FormData) {
  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };
  return {
    name: String(formData.get("name") ?? "").trim(),
    primary_contact_name: get("primaryContactName"),
    primary_contact_email: get("primaryContactEmail"),
    primary_contact_phone: get("primaryContactPhone"),
    address_line_1: get("addressLine1"),
    address_line_2: get("addressLine2"),
    city: get("city"),
    region: get("region"),
    postal_code: get("postalCode"),
    country: get("country") ?? "CA",
  };
}

/** Guard: only roles holding `manage_customer_orgs` (Admin/Staff) may write orgs. */
async function requireOrgManager() {
  const actor = await getCurrentUser();
  if (!actor || !can(actor.role, "manage_customer_orgs")) return null;
  return actor;
}

export async function createOrgAction(formData: FormData): Promise<OrgActionResult> {
  const actor = await requireOrgManager();
  if (!actor) return { error: "You don't have permission to manage customers." };

  const fields = readOrgFields(formData);
  if (!fields.name) return { error: "Company name is required." };
  // Email is required so we can invite the primary contact (Customer Admin)
  // as part of onboarding.
  if (!fields.primary_contact_email) {
    return { error: "A primary contact email is required." };
  }

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organizations")
    .insert(fields)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the customer." };

  await writeAudit({
    actorUserId: actor.id,
    action: "org.created",
    entityType: "organization",
    entityId: data.id,
    after: fields,
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/customers");
  return { ok: true, id: data.id };
}

export async function updateOrgAction(orgId: string, formData: FormData): Promise<OrgActionResult> {
  const actor = await requireOrgManager();
  if (!actor) return { error: "You don't have permission to manage customers." };

  const fields = readOrgFields(formData);
  if (!fields.name) return { error: "Company name is required." };

  const admin = createServiceClient();
  const { error } = await admin
    .from("organizations")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: "org.updated",
    entityType: "organization",
    entityId: orgId,
    after: fields,
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/customers");
  revalidatePath(`/ops/customers/${orgId}`);
  return { ok: true, id: orgId };
}

export async function setOrgActiveAction(orgId: string, active: boolean): Promise<OrgActionResult> {
  const actor = await requireOrgManager();
  if (!actor) return { error: "You don't have permission to manage customers." };

  const admin = createServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("organizations")
    .update({ active, updated_at: nowIso })
    .eq("id", orgId);
  if (error) return { error: error.message };

  // Cascade to every user in the org: deactivating a customer must lock out all
  // its users (no unauthorized access); reactivating brings them back together.
  const { error: cascadeErr } = await admin
    .from("users")
    .update({ active, updated_at: nowIso })
    .eq("organization_id", orgId);
  if (cascadeErr) return { error: cascadeErr.message };

  await writeAudit({
    actorUserId: actor.id,
    action: active ? "org.reactivated" : "org.deactivated",
    entityType: "organization",
    entityId: orgId,
    after: { active, cascadedToUsers: true },
    ip: await getRequestIp(),
  });

  revalidatePath("/ops/customers");
  revalidatePath(`/ops/customers/${orgId}`);
  revalidatePath("/ops/users");
  return { ok: true, id: orgId };
}

/**
 * Invite the primary contact as this org's Customer Admin. Part of the
 * streamlined onboarding (create customer → invite). No credit-application gate
 * here — the invited admin activates as soon as they set their password.
 */
export async function inviteOrgAdminAction(
  orgId: string,
  email: string,
  requireCredit = false,
): Promise<OrgActionResult> {
  const actor = await requireOrgManager();
  if (!actor) return { error: "You don't have permission to manage customers." };

  const clean = email.trim().toLowerCase();
  if (!clean) return { error: "An email is required to send the invite." };

  // Reuse the canonical invite path (permission checks, Supabase invite, profile
  // row, audit). With `creditForm` the account stays "Awaiting Credit" until
  // staff confirm receipt; without it, the admin activates on password set.
  const fd = new FormData();
  fd.set("email", clean);
  fd.set("role", "customer_admin");
  fd.set("organizationId", orgId);
  if (requireCredit) fd.set("creditForm", "on");
  const res = await inviteUserAction(fd);
  if (res.error) return { error: res.error };

  revalidatePath(`/ops/customers/${orgId}`);
  return { ok: true, id: orgId };
}

/** DataTable row-action adapter for the customers list (activate/deactivate). */
export async function orgRowAction(
  actionKey: string,
  rowId: string,
): Promise<{ error?: string }> {
  if (actionKey === "deactivate") return setOrgActiveAction(rowId, false);
  if (actionKey === "reactivate") return setOrgActiveAction(rowId, true);
  return { error: "Unknown action." };
}

export async function addContactAction(orgId: string, formData: FormData): Promise<OrgActionResult> {
  const actor = await requireOrgManager();
  if (!actor) return { error: "You don't have permission to manage customers." };

  const type = String(formData.get("type") ?? "").trim() || "other";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Contact name is required." };

  const admin = createServiceClient();
  const { error } = await admin
    .from("organization_contacts")
    .insert({ organization_id: orgId, type, name, email, phone });
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: "org.contact_added",
    entityType: "organization",
    entityId: orgId,
    after: { type, name, email, phone },
    ip: await getRequestIp(),
  });

  revalidatePath(`/ops/customers/${orgId}`);
  return { ok: true };
}

export async function removeContactAction(orgId: string, contactId: number): Promise<OrgActionResult> {
  const actor = await requireOrgManager();
  if (!actor) return { error: "You don't have permission to manage customers." };

  const admin = createServiceClient();
  const { error } = await admin.from("organization_contacts").delete().eq("id", contactId);
  if (error) return { error: error.message };

  await writeAudit({
    actorUserId: actor.id,
    action: "org.contact_removed",
    entityType: "organization",
    entityId: orgId,
    before: { contactId },
    ip: await getRequestIp(),
  });

  revalidatePath(`/ops/customers/${orgId}`);
  return { ok: true };
}
