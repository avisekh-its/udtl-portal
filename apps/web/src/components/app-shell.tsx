import { isStaff, can, type CurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  AppShellClient,
  type NavItem,
  type ShellUser,
  type ShellNotification,
} from "@/components/app-shell-client";

const ROLE_LABELS: Record<CurrentUser["role"], string> = {
  udtl_admin: "UDTL Admin",
  udtl_staff: "UDTL Staff",
  udtl_account_manager: "Account Manager",
  customer_admin: "Customer Admin",
  customer_user: "Customer User",
};

/** Role-aware navigation for the sidebar. */
function navFor(user: CurrentUser): NavItem[] {
  if (isStaff(user.role)) {
    const nav: NavItem[] = [{ label: "Dashboard", href: "/ops", icon: "dashboard", exact: true }];
    if (can(user.role, "create_edit_loads")) {
      nav.push({ label: "Loads", href: "/ops/loads", icon: "truck" });
    }
    if (can(user.role, "view_all_loads")) {
      nav.push({ label: "Live map", href: "/ops/map", icon: "map" });
    }
    if (can(user.role, "assign_tracking_device")) {
      nav.push({ label: "Devices", href: "/ops/devices", icon: "device" });
    }
    if (can(user.role, "manage_customer_orgs")) {
      nav.push({ label: "Customers", href: "/ops/customers", icon: "customers" });
    }
    if (can(user.role, "view_reports")) {
      nav.push({ label: "Reports", href: "/ops/reports", icon: "chart" });
    }
    if (user.role === "udtl_admin" || user.role === "udtl_staff") {
      nav.push({ label: "Users", href: "/ops/users", icon: "users" });
    }
    if (can(user.role, "view_audit_log")) {
      nav.push({ label: "Audit log", href: "/ops/audit", icon: "audit" });
    }
    if (can(user.role, "manage_system_settings")) {
      nav.push({ label: "Settings", href: "/ops/settings", icon: "settings" });
    }
    return nav;
  }
  const nav: NavItem[] = [
    { label: "Dashboard", href: "/portal", icon: "dashboard", exact: true },
    { label: "Orders", href: "/portal/orders", icon: "truck" },
    { label: "History", href: "/portal/history", icon: "history" },
  ];
  if (user.role === "customer_admin") {
    nav.push({ label: "Team", href: "/portal/users", icon: "users" });
  }
  return nav;
}

/**
 * Enterprise app shell: fixed left sidebar nav + slim top header.
 * Wraps every authenticated page (ops + portal).
 */
export async function AppShell({
  user,
  area,
  children,
}: {
  user: CurrentUser;
  area: string;
  children: React.ReactNode;
}) {
  const shellUser: ShellUser = {
    name: user.name || user.email,
    email: user.email,
    roleLabel: ROLE_LABELS[user.role],
    initials: (user.name || user.email).slice(0, 1).toUpperCase(),
  };

  // The viewer's in-app notifications (RLS scopes to their own rows).
  const supabase = await createServerClient();
  const { data: rows } = await supabase
    .from("notification_log")
    .select("id, subject, body, created_at, read_at")
    .eq("user_id", user.id)
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(15);
  const notifications: ShellNotification[] = (rows ?? []).map((n) => ({
    id: n.id as number,
    title: (n.subject as string) || "Update",
    body: (n.body as string) || "",
    at: n.created_at as string,
    unread: !n.read_at,
  }));
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <AppShellClient
      user={shellUser}
      area={area}
      nav={navFor(user)}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </AppShellClient>
  );
}
