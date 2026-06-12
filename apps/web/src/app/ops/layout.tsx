import { requireStaff } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

/**
 * Operations console. STAFF ONLY — requireStaff() redirects customers to their
 * own portal, so this area is invisible to them.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <AppShell user={user} area="Operations">
      {children}
    </AppShell>
  );
}
