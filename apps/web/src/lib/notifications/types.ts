// Client-safe notification types + constants (no "server-only" — imported by
// both the subscription UI and the server dispatcher).

export type NotifyChannel = "email" | "sms" | "in_app";
export type NotifyEvent = "assigned" | "in_transit" | "delivered" | "cancelled" | "delayed";

/** Customer-selectable events (subscription UI). "new" is internal — not offered. */
export const NOTIFY_EVENTS: { value: NotifyEvent; label: string }[] = [
  { value: "assigned", label: "Assigned / scheduled" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "delayed", label: "Delayed alert" },
];

export const NOTIFY_CHANNELS: { value: NotifyChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "in_app", label: "In-app" },
];

/** Maps a load status to its notifiable event (null = not customer-notifiable). */
export function eventForStatus(status: string): NotifyEvent | null {
  const notifiable: NotifyEvent[] = ["assigned", "in_transit", "delivered", "cancelled"];
  return notifiable.includes(status as NotifyEvent) ? (status as NotifyEvent) : null;
}
