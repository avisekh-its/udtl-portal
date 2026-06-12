/**
 * Generic status chip. Pure/presentational — safe in server or client.
 * Use a tone that matches semantics; pair with the DataTable `status` column.
 */
export type Tone = "neutral" | "success" | "warning" | "error" | "info" | "accent";

const TONES: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  success: { chip: "bg-[#2e9e5b]/12 text-[#247d49]", dot: "bg-[#2e9e5b]" },
  warning: { chip: "bg-[#e08a1e]/14 text-[#9a6800]", dot: "bg-[#e08a1e]" },
  error: { chip: "bg-[#d64545]/10 text-[#c23b3b]", dot: "bg-[#d64545]" },
  info: { chip: "bg-[#2f6b9a]/10 text-[#2f6b9a]", dot: "bg-[#2f6b9a]" },
  accent: { chip: "bg-[#e85d1c]/12 text-[#b8480f]", dot: "bg-[#e85d1c]" },
};

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const s = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/** Map used by DataTable status columns: value -> chip. */
export type StatusMap = Record<string, { label: string; tone: Tone }>;
