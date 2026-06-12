import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

/** Customer-facing portal. Any signed-in, active user may enter. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} area="Portal">
      {children}
    </AppShell>
  );
}
