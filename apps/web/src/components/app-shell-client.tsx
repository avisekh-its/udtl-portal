"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ICONS, type IconName } from "@/components/icons";
import { IconBell, IconSearch, IconMenu, IconSignOut, IconPanelLeft } from "@/components/icons";
import { BrandMark } from "@/components/brand-mark";
import { markNotificationsReadAction } from "@/app/notifications/actions";

/** Compact relative time, e.g. "5m", "3h", "2d". */
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Treat as active only on exact match (dashboards). */
  exact?: boolean;
}

export interface ShellUser {
  name: string;
  email: string;
  roleLabel: string;
  /** Customer company name (null for UDTL staff). */
  orgName?: string | null;
  initials: string;
}

export interface ShellNotification {
  id: number;
  title: string;
  body: string;
  at: string;
  unread: boolean;
}

const SUPPORT_HREF = "mailto:support@itsinc.ca?subject=UDTL%20Portal%20support";

export function AppShellClient({
  user,
  area,
  nav,
  children,
  notifications,
  unreadCount,
}: {
  user: ShellUser;
  area: string;
  nav: NavItem[];
  children: React.ReactNode;
  notifications: ShellNotification[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore + persist the desktop rail preference.
  useEffect(() => {
    if (localStorage.getItem("udtl_sidebar_collapsed") === "1") setCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("udtl_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Close drawers on navigation.
  useEffect(() => {
    setMobileOpen(false);
    setNotifsOpen(false);
  }, [pathname]);

  // Once the user opens the bell, clear the unread badge (server marks read).
  const [seen, setSeen] = useState(false);
  const badge = seen ? 0 : unreadCount;
  function openNotifs() {
    const next = !notifsOpen;
    setNotifsOpen(next);
    if (next && unreadCount > 0 && !seen) {
      setSeen(true);
      void markNotificationsReadAction();
    }
  }

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  const tooltip =
    "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-md bg-[var(--color-ink)] px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:translate-x-0 group-hover:opacity-100";

  /** `rail` = collapsed icon-only mode (desktop). The mobile drawer always renders full. */
  const renderSidebar = (rail: boolean) => (
    <div className="flex h-full flex-col bg-[#0a0e1a]">
      {/* Brand */}
      <div className={`flex h-14 items-center border-b border-white/10 ${rail ? "justify-center px-0" : "gap-2.5 px-5"}`}>
        <BrandMark />
        {!rail && <span className="text-[10px] uppercase tracking-[0.16em] text-white/70">{area}</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center rounded-lg text-sm transition ${
                rail ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
              } ${
                active
                  ? "bg-[var(--color-secondary)]/15 font-medium text-[var(--color-secondary)]"
                  : "text-white/85 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--color-secondary)]" aria-hidden />
              )}
              <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[var(--color-secondary)]" : "text-white/70 group-hover:text-white"}`} />
              {!rail && <span className="truncate">{item.label}</span>}
              {rail && <span className={tooltip}>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User block (bottom) */}
      <div className="border-t border-white/10 p-3">
        {rail ? (
          <div className="flex flex-col items-center gap-2">
            <span className="group relative grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {user.initials}
              <span className={tooltip}>{user.name}{user.orgName ? ` · ${user.orgName}` : ""}</span>
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="group relative grid h-9 w-9 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Sign out"
              >
                <IconSignOut className="h-[18px] w-[18px]" />
                <span className={tooltip}>Sign out</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-white/10">
              {user.initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-white">{user.name}</div>
              {user.orgName && (
                <div className="truncate text-xs font-medium text-[var(--color-secondary)]">{user.orgName}</div>
              )}
              <div className="truncate text-[10px] uppercase tracking-wide text-white/65">{user.roleLabel}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Sign out"
                title="Sign out"
              >
                <IconSignOut className="h-[18px] w-[18px]" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Fixed sidebar (desktop / tablet) — animates between full + rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-300 ease-in-out md:block ${
          collapsed ? "w-[76px]" : "w-60"
        }`}
      >
        {renderSidebar(collapsed)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60">{renderSidebar(false)}</aside>
        </div>
      )}

      <div className={`flex min-h-screen flex-col transition-[padding] duration-300 ease-in-out ${collapsed ? "md:pl-[76px]" : "md:pl-60"}`}>
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-white/90 px-4 backdrop-blur sm:px-6">
          {/* Desktop rail toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconPanelLeft />
          </button>
          {/* Mobile drawer toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
          >
            <IconMenu />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder={area === "Portal" ? "Search your orders…" : "Search loads, customers…"}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-white"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={openNotifs}
                className="relative grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                aria-label="Notifications"
                aria-expanded={notifsOpen}
              >
                <IconBell className={`h-[18px] w-[18px] ${badge > 0 ? "bell-ring text-slate-700" : ""}`} />
                {badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-secondary)] opacity-40" />
                    <span className="badge-pop relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-secondary)] px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  </span>
                )}
              </button>

              {notifsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotifsOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[#f7f8fa] px-4 py-3">
                      <span className="text-sm font-semibold text-slate-800">Notifications</span>
                      {badge > 0 && (
                        <span className="inline-flex items-center rounded-full bg-[var(--color-secondary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-secondary)]">
                          {badge} new
                        </span>
                      )}
                    </div>
                    <div className="max-h-[20rem] divide-y divide-[var(--color-border)] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-10 text-center text-sm text-slate-400">No notifications yet.</p>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`flex gap-3 px-4 py-3 transition hover:bg-slate-50 ${n.unread ? "bg-[var(--color-secondary)]/[0.03]" : ""}`}
                          >
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{ background: n.unread ? "var(--color-secondary)" : "#cbd5e1" }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm font-medium text-slate-800">{n.title}</span>
                                <span className="shrink-0 text-[11px] text-slate-400">{ago(n.at)}</span>
                              </div>
                              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{n.body}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotifsOpen(false)}
                      className="block w-full border-t border-[var(--color-border)] px-4 py-2.5 text-center text-xs font-medium text-[var(--color-secondary)] transition hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Support */}
            <a
              href={SUPPORT_HREF}
              className="hidden items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:inline-flex"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
              </svg>
              Support
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>

        {/* Footer */}
        <footer className="border-t border-[var(--color-border)] px-4 py-4 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>© 2026 United Dhillon Trucking Lines · Operated by ITS Inc.</span>
            <div className="flex gap-5">
              <Link href="#" className="transition hover:text-slate-600">Privacy</Link>
              <Link href="#" className="transition hover:text-slate-600">Terms</Link>
              <Link href="#" className="transition hover:text-slate-600">Security</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
