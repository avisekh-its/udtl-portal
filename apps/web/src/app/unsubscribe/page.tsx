import { BrandMark } from "@/components/brand-mark";
import { UnsubscribeForm } from "./unsubscribe-form";

/** Public CASL unsubscribe page (reached from the email footer link). */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <BrandMark />
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-900">
            Email preferences
          </h1>
        </div>
        <UnsubscribeForm token={t ?? ""} />
      </div>
    </main>
  );
}
