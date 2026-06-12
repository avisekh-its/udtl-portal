import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-bold text-white">
              U
            </span>
            <span className="text-lg font-semibold tracking-tight text-[var(--color-primary)]">
              UDTL Portal
            </span>
          </div>
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-900">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        </div>

        <ForgotForm />

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-[var(--color-secondary)] hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
