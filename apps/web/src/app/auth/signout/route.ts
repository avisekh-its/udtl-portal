import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { LAST_ACTIVITY_COOKIE } from "@/lib/session";

/** Sign the user out and send them back to the login page. */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Clear the idle-activity cookie so the next login starts a clean clock.
  response.cookies.set(LAST_ACTIVITY_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
