/**
 * Epic 0 scaffold landing. Real home / login / dashboard arrive in:
 *   - Epic 2 (Auth) → login page, redirect logic
 *   - Epic 3 (Customer portal) → dashboard, order list, detail view
 *   - Epic 4 (Tracking) → live map
 */

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-6 text-center">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Epic 0 scaffold · deploy probe
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          UDTL Customer Portal
        </h1>
        <p className="text-slate-600 text-sm leading-relaxed">
          Stack: Next.js 15 · Supabase · Drizzle · Mapbox · Vercel + Railway.
          Real features land in Epic 2 onward.
        </p>
        <div className="text-[11px] text-slate-400 font-mono">
          {process.env.APP_ENV ?? "development"}
        </div>
      </div>
    </main>
  );
}
