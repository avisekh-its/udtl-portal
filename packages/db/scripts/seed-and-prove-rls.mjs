/**
 * Seed two tenants + PROVE RLS isolation.
 *
 * Setup (service_role, bypasses RLS):
 *   - 2 orgs: Acme Logistics (A), Globex Freight (B)
 *   - 4 auth users + matching public.users rows:
 *       staff@udtl.test          udtl_staff      (no org)        -> sees ALL
 *       admin-a@acme.test        customer_admin  org A           -> sees A only
 *       user-b@globex.test       customer_user   org B           -> sees B only
 *       restricted-a@acme.test   customer_user   org A, restricted -> sees only assigned load
 *   - 3 loads: A1, A2 (org A), B1 (org B); restricted-a assigned to A1 only
 *
 * Proof (each user signs in with the ANON key -> gets a real JWT -> queries loads):
 *   expected visible load counts: staff=3, admin-a=2, user-b=1, restricted-a=1, anon=0
 *
 * Idempotent: deletes the test users/orgs by well-known emails/names first.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const PASSWORD = "TestPass123!";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const USERS = [
  { key: "admin",      email: "admin@udtl.test",       role: "udtl_admin",     org: null, restricted: false },
  { key: "staff",      email: "staff@udtl.test",       role: "udtl_staff",     org: null, restricted: false },
  { key: "adminA",     email: "admin-a@acme.test",     role: "customer_admin", org: "A",  restricted: false },
  { key: "userB",      email: "user-b@globex.test",    role: "customer_user",  org: "B",  restricted: false },
  { key: "restrictedA",email: "restricted-a@acme.test",role: "customer_user",  org: "A",  restricted: true  },
];

function fail(msg) { console.error("\n❌ " + msg); process.exitCode = 1; }

async function clean() {
  const emails = USERS.map((t) => t.email);
  // delete test auth users by email
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (emails.includes(u.email)) await admin.auth.admin.deleteUser(u.id);
  }
  // public.users has no FK to auth.users, so the profile rows don't cascade —
  // delete them explicitly (cascades to load_assigned_users) to stay idempotent.
  await admin.from("users").delete().in("email", emails);
  // delete ALL loads on the test orgs (incl. any created via the UI), then the
  // orgs — loads FK-reference orgs, so loads must go first to stay idempotent.
  const { data: testOrgs } = await admin
    .from("organizations")
    .select("id")
    .in("name", ["Acme Logistics", "Globex Freight"]);
  const orgIds = (testOrgs ?? []).map((o) => o.id);
  if (orgIds.length) await admin.from("loads").delete().in("organization_id", orgIds);
  await admin.from("loads").delete().in("load_reference", ["UDTL-A1", "UDTL-A2", "UDTL-B1"]);
  await admin.from("organizations").delete().in("name", ["Acme Logistics", "Globex Freight"]);
}

async function makeUser(t, orgId) {
  const { data, error } = await admin.auth.admin.createUser({
    email: t.email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`createUser ${t.email}: ${error.message}`);
  const id = data.user.id;
  const { error: e2 } = await admin.from("users").insert({
    id, email: t.email, role: t.role, organization_id: orgId, restricted: t.restricted, name: t.key,
  });
  if (e2) throw new Error(`insert public.users ${t.email}: ${e2.message}`);
  return id;
}

async function visibleLoadRefs(jwtClient) {
  const { data, error } = await jwtClient.from("loads").select("load_reference").order("load_reference");
  if (error) throw new Error("select loads: " + error.message);
  return data.map((r) => r.load_reference);
}

async function signInClient(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

(async () => {
  console.log("→ cleaning prior test data…");
  await clean();

  console.log("→ creating orgs…");
  const { data: orgA, error: ea } = await admin.from("organizations").insert({ name: "Acme Logistics", country: "CA" }).select("id").single();
  const { data: orgB, error: eb } = await admin.from("organizations").insert({ name: "Globex Freight", country: "CA" }).select("id").single();
  if (ea || eb) throw new Error("org insert: " + (ea?.message || eb?.message));
  const orgIds = { A: orgA.id, B: orgB.id };

  console.log("→ creating users…");
  const ids = {};
  for (const t of USERS) ids[t.key] = await makeUser(t, t.org ? orgIds[t.org] : null);

  console.log("→ creating loads…");
  const tok = (s) => `tok_${s}_${ids.staff.slice(0, 8)}`;
  const { data: loadsIns, error: el } = await admin.from("loads").insert([
    { load_reference: "UDTL-A1", public_tracking_token: tok("a1"), organization_id: orgIds.A },
    { load_reference: "UDTL-A2", public_tracking_token: tok("a2"), organization_id: orgIds.A },
    { load_reference: "UDTL-B1", public_tracking_token: tok("b1"), organization_id: orgIds.B },
  ]).select("id,load_reference");
  if (el) throw new Error("loads insert: " + el.message);
  const a1 = loadsIns.find((l) => l.load_reference === "UDTL-A1").id;

  console.log("→ assigning restricted user to UDTL-A1 only…");
  const { error: ela } = await admin.from("load_assigned_users").insert({ load_id: a1, user_id: ids.restrictedA });
  if (ela) throw new Error("assign: " + ela.message);

  // ---------------- PROOF ----------------
  console.log("\n=== RLS isolation proof (querying loads as each principal) ===");
  const expected = {
    admin:       ["UDTL-A1", "UDTL-A2", "UDTL-B1"],
    staff:       ["UDTL-A1", "UDTL-A2", "UDTL-B1"],
    adminA:      ["UDTL-A1", "UDTL-A2"],
    userB:       ["UDTL-B1"],
    restrictedA: ["UDTL-A1"],
  };

  for (const t of USERS) {
    const c = await signInClient(t.email);
    const got = await visibleLoadRefs(c);
    const exp = expected[t.key];
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    console.log(`  ${ok ? "✅" : "❌"} ${t.key.padEnd(12)} (${t.role}) sees [${got.join(", ")}]  expected [${exp.join(", ")}]`);
    if (!ok) fail(`${t.key} RLS mismatch`);
  }

  // anon (no auth) must see nothing
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const anonGot = await visibleLoadRefs(anonClient);
  const anonOk = anonGot.length === 0;
  console.log(`  ${anonOk ? "✅" : "❌"} ${"anon".padEnd(12)} (no JWT)        sees [${anonGot.join(", ")}]  expected []`);
  if (!anonOk) fail("anon should see no loads");

  // cross-tenant write attempt: userB tries to read org A's org row -> should be empty
  const cB = await signInClient("user-b@globex.test");
  const { data: orgPeek } = await cB.from("organizations").select("name");
  const orgPeekOk = orgPeek.length === 1 && orgPeek[0].name === "Globex Freight";
  console.log(`  ${orgPeekOk ? "✅" : "❌"} ${"userB".padEnd(12)} org visibility sees [${orgPeek.map((o) => o.name).join(", ")}]  expected [Globex Freight]`);
  if (!orgPeekOk) fail("userB should only see its own org");

  if (process.exitCode) console.log("\n❌ RLS PROOF FAILED — see mismatches above.");
  else console.log("\n✅ RLS PROOF PASSED — tenant isolation, staff override, restricted-user scoping, and anon lockout all verified.");
})().catch((e) => { console.error("\n💥 " + e.message); process.exit(1); });
