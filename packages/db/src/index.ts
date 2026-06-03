/**
 * @udtl/db — shared DB client + schema exports for the monorepo.
 * Used by both apps/web (Next.js) and apps/worker (Node polling worker).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";

let _client: postgres.Sql | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Lazy-initialised Drizzle client.
 * - In serverless (Vercel) we want to reuse the connection across warm starts.
 * - In the worker we initialise once and keep it open for the process lifetime.
 */
export function getDb(connectionString?: string) {
  if (_db) return _db;
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  _client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Supabase pgBouncer transaction mode requires this
  });
  _db = drizzle(_client, { schema });
  return _db;
}

export type DB = ReturnType<typeof getDb>;
