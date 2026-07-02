"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSubscriptionsAction, type SubSelection } from "@/app/portal/orders/actions";
import {
  NOTIFY_EVENTS,
  NOTIFY_CHANNELS,
  type NotifyChannel,
  type NotifyEvent,
} from "@/lib/notifications/types";

const key = (e: NotifyEvent, c: NotifyChannel) => `${e}:${c}`;

export function NotifySubscriptions({
  loadId,
  initial,
  hasPhone = true,
}: {
  loadId: number;
  /** Existing subscriptions as "event:channel" keys. */
  initial: string[];
  /** Whether the viewer's profile already has a phone number (for SMS). */
  hasPhone?: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [consent, setConsent] = useState(initial.length > 0); // already subscribed ⇒ consent given
  const [phone, setPhone] = useState("");
  const [phoneSaved, setPhoneSaved] = useState(hasPhone);
  const [pending, startTransition] = useTransition();

  const needsConsent = [...picked].some((k) => !k.endsWith(":in_app"));
  const smsPicked = [...picked].some((k) => k.endsWith(":sms"));
  const needsPhone = smsPicked && !phoneSaved;

  function toggle(e: NotifyEvent, c: NotifyChannel) {
    setPicked((prev) => {
      const n = new Set(prev);
      const k = key(e, c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  function save() {
    const selected: SubSelection[] = [...picked].map((k) => {
      const [event, channel] = k.split(":");
      return { event: event as NotifyEvent, channel: channel as NotifyChannel };
    });
    startTransition(async () => {
      const res = await saveSubscriptionsAction(loadId, selected, consent, needsPhone ? phone : undefined);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (needsPhone && phone.trim()) setPhoneSaved(true);
      toast.success(selected.length ? "Notification preferences saved." : "Notifications turned off for this order.");
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Notify me about this order</h2>
      <p className="mt-1 text-xs text-slate-500">Choose which updates you want and how to receive them.</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="py-2 text-left font-medium">Event</th>
              {NOTIFY_CHANNELS.map((c) => (
                <th key={c.value} className="px-3 py-2 text-center font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFY_EVENTS.map((e) => (
              <tr key={e.value} className="border-t border-[var(--color-border)]">
                <td className="py-2.5 text-slate-700">{e.label}</td>
                {NOTIFY_CHANNELS.map((c) => (
                  <td key={c.value} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={picked.has(key(e.value, c.value))}
                      onChange={() => toggle(e.value, c.value)}
                      disabled={pending}
                      className="h-4 w-4 rounded border-slate-300 accent-[var(--color-secondary)]"
                      aria-label={`${e.label} via ${c.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {needsPhone && (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-slate-50 p-3">
          <label htmlFor="sms-phone" className="block text-xs font-medium text-slate-600">
            Mobile number for SMS updates
          </label>
          <input
            id="sms-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={pending}
            placeholder="204-555-0142"
            className="mt-1.5 w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--color-secondary)] disabled:opacity-60"
          />
          <p className="mt-1 text-[11px] text-slate-400">Saved to your profile — we&apos;ll text this number.</p>
        </div>
      )}

      {needsConsent && (
        <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[var(--color-secondary)]"
          />
          <span>
            I consent to receive email/SMS updates about this order from United Dhillon Trucking
            Lines. You can unsubscribe anytime (or reply STOP to SMS). (CASL)
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-4 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save preferences"}
      </button>
    </div>
  );
}
