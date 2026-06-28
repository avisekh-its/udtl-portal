import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PublicTrackingView } from "@/components/public/tracking-view";
import { resolveTrackingToken, getPublicTracking } from "@/lib/tracking/public";

export const dynamic = "force-dynamic"; // public, token-resolved — never cache

const MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "Tracking number not found",
    body: "We couldn't find a shipment for that tracking number. Double-check it and try again.",
  },
  expired: {
    title: "This tracking link has expired",
    body: "The link you used is no longer valid. Ask United Dhillon Trucking Lines for an updated link.",
  },
  revoked: {
    title: "This tracking link is no longer active",
    body: "This link has been turned off. Ask United Dhillon Trucking Lines for a new one.",
  },
};

export default async function PublicTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveTrackingToken(decodeURIComponent(token));

  if (!resolved.ok) return <TrackingError reason={resolved.reason} />;

  const data = await getPublicTracking(resolved.loadId);
  if (!data) return <TrackingError reason="not_found" />;

  return <PublicTrackingView data={data} />;
}

function TrackingError({ reason }: { reason: "not_found" | "expired" | "revoked" }) {
  const m = MESSAGES[reason]!;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{m.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{m.body}</p>
        <Link
          href="/track"
          className="mt-6 inline-flex rounded-lg bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-700)]"
        >
          Track a shipment
        </Link>
      </div>
    </main>
  );
}
