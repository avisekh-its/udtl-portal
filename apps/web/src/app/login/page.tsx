import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand-mark";

type MessageTone = "error" | "success" | "info";

const MESSAGES: Record<string, { text: string; tone: MessageTone }> = {
  inactive: {
    text: "Your account is disabled. Please contact your administrator.",
    tone: "error",
  },
  timeout: {
    text: "You were signed out after a period of inactivity. Please sign in again.",
    tone: "info",
  },
  link: { text: "That link is invalid. Please request a new one.", tone: "error" },
  link_expired: { text: "That link has expired. Please request a new one.", tone: "error" },
  sso: { text: "Single sign-on failed. Please try again or use your password.", tone: "error" },
  session: { text: "Your session couldn't be loaded. Please sign in again.", tone: "info" },
  sso_provider: { text: "That sign-in provider isn't available.", tone: "error" },
  sso_no_account: {
    text: "No account exists for that email yet. Sign in with your email and password first — single sign-on works once your account is set up.",
    tone: "error",
  },
  credit_pending: {
    text: "Your password is set. Your account will be activated once UDTL receives your completed credit application.",
    tone: "success",
  },
};

const FEATURES: { title: string; desc: string; tint: string; icon: React.ReactNode }[] = [
  {
    title: "Live GPS tracking",
    desc: "Every active load, moving in real time",
    tint: "#e85d1c",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
    ),
  },
  {
    title: "Accurate ETAs",
    desc: "Distance-to-go and arrival estimates",
    tint: "#3b82f6",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    ),
  },
  {
    title: "On-time performance",
    desc: "Pickup & delivery KPIs at a glance",
    tint: "#2e9e5b",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 7-7" /><path d="M17 8h4v4" /></svg>
    ),
  },
  {
    title: "Secure Access",
    desc: "Encrypted role-based data portals",
    tint: "#94a3b8",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /></svg>
    ),
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { error, detail } = await searchParams;
  const notice = error ? MESSAGES[error] : undefined;

  return (
    <main className="auth-dark grid min-h-screen bg-[#0a0e1a] text-white md:grid-cols-2">
      {/* Left — sign-in */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-9">
            <BrandMark size="lg" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to your account</h1>
          <p className="mt-2 text-sm text-white/50">Welcome back. Please enter your details.</p>

          <div className="mt-8">
            <LoginForm initialMessage={notice?.text} initialTone={notice?.tone} />
          </div>

          {detail && (
            <p className="mt-3 break-words rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[11px] text-white/50">
              Diagnostic: {detail}
            </p>
          )}

          <p className="mt-8 text-center text-xs text-white/35">
            Protected access for UDTL customers and staff
          </p>
          <div className="mt-9 flex items-center justify-center gap-6 text-xs text-white/40">
            <Link href="#" className="transition hover:text-white/70">Privacy Policy</Link>
            <Link href="#" className="transition hover:text-white/70">Terms of Service</Link>
            <Link href="#" className="transition hover:text-white/70">Security</Link>
          </div>
        </div>
      </div>

      {/* Right — premium brand panel (hidden on small screens) */}
      <div className="relative hidden overflow-hidden bg-[#1a1b1e] md:block">
        <Image
          src="/brand/login-truck.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
          style={{ objectPosition: "70% 50%" }}
        />
        {/* charcoal gradient for legibility */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, rgba(10,14,26,0.78) 0%, rgba(10,14,26,0.70) 40%, rgba(8,10,16,0.94) 100%)",
          }}
        />
        {/* soft orange glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(232,93,28,0.28), transparent 70%)" }}
        />

        {/* Hero content, vertically centered */}
        <div className="relative z-10 flex h-full flex-col justify-center px-12 lg:px-16">
          <div className="max-w-xl">
            <div className="mb-6 h-1 w-12 rounded-full bg-[var(--color-secondary)]" />
            <h2 className="text-[2.6rem] font-bold leading-[1.08]">
              Every shipment,
              <br />
              <span className="text-[var(--color-secondary)]">tracked in real time.</span>
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
              Live GPS positions, accurate ETAs, and on-time performance — one secure portal for
              United Dhillon Trucking Lines and its customers. Experience the next generation of
              logistics management.
            </p>

            <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${f.tint}26`, color: f.tint }}
                    >
                      {f.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{f.title}</div>
                      <div className="mt-0.5 text-xs leading-snug text-white/50">{f.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status footer */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-1 px-12 pb-8 font-mono text-[11px] uppercase tracking-wider text-white/40 lg:px-16">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
            Systems nominal
          </span>
          <span>© 2026 United Dhillon Trucking Lines · Operated by ITS Inc.</span>
        </div>
      </div>
    </main>
  );
}
