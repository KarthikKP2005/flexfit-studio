"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

/**
 * Persistent top navigation, rendered on every page via layout.tsx.
 * Determines what to show from `trpc.auth.me` client-side. Not
 * responsible for: actually restricting access to the pages it links to
 * — that's enforced server-side by each tRPC procedure's role check.
 *
 * Behavior note: "My bookings" and "Waitlist" are shown to *any*
 * signed-in user (`{user && (...)}`, not role-gated), so trainers and
 * admins see these member-specific links too, alongside their own
 * role-specific ones. See plan.md item #40.
 *
 * Visual note: on `/` only, the bar renders fixed and transparent over
 * the hero image, then flips to a solid white bar once the page scrolls
 * past the hero (see `isHome`/`scrolled` below). Every other route keeps
 * the original static, in-flow bar untouched.
 */
export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });

  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      router.push("/login");
    },
  });

  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const headerClass = isHome
    ? `fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-white shadow-sm" : "bg-transparent"
      }`
    : "border-b";
  const headerStyle = isHome ? undefined : { borderColor: "var(--border)" };
  const logoClass = `text-lg font-semibold tracking-tight ${
    isHome ? (scrolled ? "text-black" : "text-white") : ""
  }`;
  const linkClass = (path: string) => {
    const isActive = pathname === path || (path !== "/" && pathname.startsWith(path + "/"));
    if (isActive) return "text-sm font-medium text-green-400";
    return isHome
      ? `text-sm transition-colors ${
          scrolled ? "text-neutral-600 hover:text-black" : "text-white/80 hover:text-white"
        }`
      : "text-sm muted hover:text-green-400";
  };

  return (
    <header className={headerClass} style={headerStyle}>
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
        <Link href="/" className={logoClass}>
          FlexFit<span style={{ color: "var(--accent)" }}>.</span>
        </Link>

        {/*
          WHY IT'S IMPLEMENTED: NavBar Cleanup.
          Trainers/admins shouldn't see member-specific links.

          Home-page note: all role-based links, the notification bell,
          and the profile-name link are hidden on `/` (isHome) — the
          landing page shows only the logo and Sign in/Sign out, per
          direct request. Every other route is unaffected.
        */}
        {!isHome && user?.role === "member" && (
          <>
            <Link href="/dashboard" className={linkClass("/dashboard")}>
              My bookings
            </Link>
            <Link href="/schedule" className={linkClass("/schedule")}>
              Schedule
            </Link>
            <Link href="/waitlist" className={linkClass("/waitlist")}>
              Waitlist
            </Link>
          </>
        )}

        {!isHome && user?.role === "trainer" && (
          <Link href="/trainer/schedule" className={linkClass("/trainer/schedule")}>
            My schedule
          </Link>
        )}

        {!isHome && user?.role === "admin" && (
          <>
            <Link href="/admin" className={linkClass("/admin")}>
              Admin
            </Link>
            <Link href="/admin/attendance" className={linkClass("/admin/attendance")}>
              Attendance
            </Link>
          </>
        )}

        {!isHome && (user?.role === "admin" || user?.role === "trainer") && (
          <Link href="/kiosk" className={linkClass("/kiosk")}>
            Kiosk
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3">
          {!isHome && user && (
            <Link href="/notifications" className="inline-flex items-center gap-1.5">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unreadCount && unreadCount > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <>
              {!isHome && (
                <Link href="/profile" className={linkClass("/profile")}>
                  {user.name}
                </Link>
              )}
              <button
                className="btn"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
