import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Lightweight session probe. Returns 200 only when the server can read a valid
 * session from the request cookies. /auth/confirm polls this after establishing
 * a session client-side so it can wait out the (async, often chunked) auth-
 * cookie write before navigating to a protected route — otherwise middleware
 * would bounce the user to /login before the cookie is readable server-side.
 */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ ok: !!user }, { status: user ? 200 : 401 });
}
