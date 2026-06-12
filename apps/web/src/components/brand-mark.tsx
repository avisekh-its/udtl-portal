/**
 * UDTL brand mark — mirrors the logo (black bold italic "UDTL" on an orange
 * field with a black border). Pure/presentational. `size` scales it for
 * sidebars/headers vs. hero use.
 */
export function BrandMark({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  const dims =
    size === "lg"
      ? "border-[3px] px-3 py-1 text-2xl"
      : "border-2 px-2 py-0.5 text-sm";
  return (
    <span
      className={`inline-flex items-center rounded-lg border-[var(--color-ink)] bg-[var(--color-secondary)] font-extrabold italic tracking-tight text-[var(--color-ink)] ${dims} ${className}`}
    >
      UDTL
    </span>
  );
}
