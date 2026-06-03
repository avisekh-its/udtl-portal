import type { Config } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  // Soft fail for tooling that loads this without env (e.g. lint).
  // drizzle-kit commands will fail at runtime if the env isn't set, which is the right behaviour.
  console.warn("[drizzle.config] DATABASE_URL not set. Migrations will fail until it is.");
}

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgres://placeholder",
  },
  strict: true,
  verbose: true,
} satisfies Config;
