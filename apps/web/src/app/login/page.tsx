import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand-mark";

const ERROR_MESSAGES: Record<string, string> = {
  inactive: "Your account is disabled. Please contact your administrator.",
  timeout: "You were signed out after a period of inactivity. Please sign in again.",
  link: "That link is invalid. Please request a new one.",
  link_expired: "That link has expired. Please request a new one.",
  sso: "Single sign-on failed. Please try again or use your password.",
  sso_provider: "That sign-in provider isn't available.",
  sso_no_account:
    "No account exists for that email yet. Sign in with your email and password first — single sign-on works once your account is set up.",
  credit_pending:
    "Your password is set. Your account will be activated once UDTL receives your completed credit application.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      {/* Left — sign-in */}
      <div className="flex items-center justify-center bg-[var(--color-bg)] px-6 py-12">
        <div className="w-full max-w-md">
          <div className="card p-8 shadow-[0_12px_40px_-16px_rgba(16,24,40,0.22)] sm:p-10">
            <div className="mb-8">
              {/* Brand only on small screens — the dark panel carries it on desktop. */}
              <div className="mb-6 md:hidden">
                <BrandMark />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Sign in to your account
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Welcome back. Please enter your details.
              </p>
            </div>

            <LoginForm initialError={initialError} />
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Protected access for UDTL customers and staff
          </p>
        </div>
      </div>

      {/* Right — premium brand panel (hidden on small screens) */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white md:flex"
        style={{ background: "linear-gradient(155deg, #23262d 0%, #15161a 55%, #0d0e10 100%)" }}
      >
        {/* soft orange brand glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(232,93,28,0.30), transparent 70%)" }}
        />
        {/* faint dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative z-10">
          <BrandMark size="lg" />
        </div>

        <div className="relative z-10 max-w-md">
          <div className="mb-5 h-1 w-12 rounded-full bg-[var(--color-secondary)]" />
          <h2 className="text-[1.7rem] font-semibold leading-tight">
            Every shipment, tracked in real time.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            Live GPS positions, accurate ETAs, and on-time performance — one
            secure portal for United Dhillon Trucking Lines and its customers.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              ["Live GPS tracking", "Every active load, moving in real time"],
              ["Accurate ETAs", "Distance-to-go and arrival estimates"],
              ["On-time performance", "Pickup & delivery KPIs at a glance"],
            ].map(([title, desc]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12 5 5L20 6" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-medium text-white/90">{title}</div>
                  <div className="text-xs text-white/45">{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-white/45">
            {["Encrypted in transit & at rest", "Role-based access", "Audit-logged"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[var(--color-secondary)]" />
                {t}
              </span>
            ))}
          </div>
          <div className="text-xs text-white/35">
            © United Dhillon Trucking Lines · Operated by ITS Inc.
          </div>
        </div>
      </div>
    </main>
  );
}
