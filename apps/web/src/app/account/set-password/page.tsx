import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";
import { BrandMark } from "@/components/brand-mark";

/**
 * Set/choose a password. Reached after clicking a reset or invite email link
 * (which established a session via /auth/callback). If there's no session, the
 * link was invalid or expired — send them to request a new one.
 *
 * Credit form (Option B): if this invite required the credit form, we show the
 * PDF to download + a note that the account activates once UDTL receives it.
 * The app never collects the form's contents.
 */
export default async function SetPasswordPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link_expired");

  const { data: profile } = await supabase
    .from("users")
    .select("credit_form_required, credit_form_received")
    .eq("id", user.id)
    .single();

  const awaitingCredit = !!profile?.credit_form_required && !profile?.credit_form_received;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <BrandMark />
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-900">
            Choose a password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Set a password for <span className="font-medium text-slate-700">{user.email}</span>.
          </p>
        </div>

        {awaitingCredit && (
          <div className="mb-6 rounded-lg border border-[var(--color-secondary)]/30 bg-[var(--color-secondary)]/5 p-4 text-sm">
            <p className="font-medium text-slate-800">Credit application required</p>
            <p className="mt-1 text-slate-600">
              Please download UDTL&apos;s credit application, complete it, and return it to UDTL.
              Your account is activated once our team confirms it&apos;s received.
            </p>
            <a
              href="/credit-application.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-secondary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-secondary-700)]"
            >
              Download credit application (PDF)
            </a>
          </div>
        )}

        <SetPasswordForm />
      </div>
    </main>
  );
}
