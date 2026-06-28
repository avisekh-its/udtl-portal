import { BrandMark } from "@/components/brand-mark";
import { TrackLookupForm } from "./track-lookup-form";

export const metadata = { title: "Track a shipment · UDTL" };

/** Public, no-login tracking-number lookup (Epic 11). */
export default function TrackLookupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <BrandMark />
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-900">Track your shipment</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the tracking number from your United Dhillon Trucking Lines confirmation.
          </p>
        </div>
        <TrackLookupForm />
      </div>
    </main>
  );
}
