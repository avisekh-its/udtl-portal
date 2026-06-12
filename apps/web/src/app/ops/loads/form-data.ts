import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { STAFF_ROLES } from "@/lib/auth";

/** Options for the load form: active customers + assignable account managers. */
export async function loadFormOptions() {
  const supabase = await createServerClient();
  const [{ data: orgs }, { data: ams }] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("active", true).order("name"),
    supabase.from("users").select("id, name, email, role").in("role", STAFF_ROLES).order("email"),
  ]);
  return {
    orgs: orgs ?? [],
    accountManagers: (ams ?? []).map((u) => ({ id: u.id, label: u.name || u.email })),
  };
}
