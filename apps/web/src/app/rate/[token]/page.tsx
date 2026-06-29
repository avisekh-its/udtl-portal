import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { StarRating } from "@/components/star-rating";
import { resolveRatingToken } from "@/lib/ratings/service";
import { RateForm } from "../rate-form";

export const dynamic = "force-dynamic"; // public, token-resolved — never cache

const MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: { title: "Rating link not found", body: "We couldn't find that rating link. Please check the link from your email." },
  expired: { title: "This rating link has expired", body: "Thanks for your interest — this link is no longer valid." },
  revoked: { title: "This rating link is no longer active", body: "This link has been turned off by United Dhillon Trucking Lines." },
};

export default async function RatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRatingToken(decodeURIComponent(token));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>

        {!resolved.ok ? (
          <Card>
            <h1 className="text-lg font-semibold text-slate-900">{MESSAGES[resolved.reason]!.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{MESSAGES[resolved.reason]!.body}</p>
          </Card>
        ) : resolved.alreadySubmitted ? (
          <Card>
            <h1 className="text-lg font-semibold text-slate-900">Thank you!</h1>
            <p className="mt-2 text-sm text-slate-600">You&apos;ve already rated shipment {resolved.ref}.</p>
            {resolved.score && (
              <div className="mt-4 flex items-center gap-2">
                <StarRating value={resolved.score} size={20} />
                <span className="text-sm font-semibold text-slate-700">{resolved.score}/5</span>
              </div>
            )}
            {resolved.review && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">“{resolved.review}”</p>}
          </Card>
        ) : (
          <Card>
            <h1 className="text-lg font-semibold text-slate-900">How did we do?</h1>
            <p className="mt-1 text-sm text-slate-600">
              Rate your United Dhillon Trucking Lines shipment <span className="font-medium">{resolved.ref}</span>.
            </p>
            <RateForm token={decodeURIComponent(token)} />
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/track" className="hover:underline">Track a shipment</Link> · United Dhillon Trucking Lines
        </p>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm">{children}</div>;
}
