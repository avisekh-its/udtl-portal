/** Lightweight health check used by Vercel + monitoring. Extended in Epic 4. */

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    env: process.env.APP_ENV ?? "development",
    at: new Date().toISOString(),
  });
}
