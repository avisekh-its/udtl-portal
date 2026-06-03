/**
 * Server-side Supabase client for Next.js App Router.
 * Uses @supabase/ssr to read auth from cookies in Server Components, Route Handlers, and Server Actions.
 *
 * Three flavours:
 *   - createServerClient(): in Server Components / Server Actions (uses cookies())
 *   - createServiceClient(): admin-only, bypasses RLS — use sparingly
 */

import { cookies } from "next/headers";
import {
  createServerClient as ssrCreateClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. See .env.example.`);
  return v;
}

export async function createServerClient() {
  const cookieStore = await cookies();
  return ssrCreateClient(
    envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
    envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component context — cookies are read-only here.
            // Auth middleware handles refresh in middleware.ts (Epic 2).
          }
        },
      },
    },
  );
}

/** Service-role client — bypasses RLS. Server-only. Never expose to browser. */
export function createServiceClient() {
  return createClient(envOrThrow("SUPABASE_URL"), envOrThrow("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
