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
  const logoClass = `font-semibold tracking-tight ${
    isHome ? (scrolled ? "text-black" : "text-white") : ""
  }`;
  const linkClass = isHome
    ? `text-sm transition-colors ${
        scrolled ? "text-neutral-600 hover:text-black" : "text-white/80 hover:text-white"
      }`
    : "text-sm muted hover:text-white";

  return (
    <header className={headerClass} style={headerStyle}>
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
        <Link href="/" className={logoClass}>
          FlexFit<span style={{ color: "var(--accent)" }}>.</span>
        </Link>

        {/*
          WHY IT'S IMPLEMENTED: NavBar Cleanup.
          Trainers/admins shouldn't see member-specific links.
        */}
        {user?.role === "member" && (
          <>
            <Link href="/dashboard" className={linkClass}>
              My bookings
            </Link>
            <Link href="/waitlist" className={linkClass}>
              Waitlist
            </Link>
          </>
        )}

        {user?.role === "trainer" && (
          <Link href="/trainer/schedule" className={linkClass}>
            My schedule
          </Link>
        )}

        {user?.role === "admin" && (
          <>
            <Link href="/admin" className={linkClass}>
              Admin
            </Link>
            <Link href="/admin/attendance" className={linkClass}>
              Attendance
            </Link>
          </>
        )}

        {(user?.role === "admin" || user?.role === "trainer") && (
          <Link href="/kiosk" className={linkClass}>
            Kiosk
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3">
          {user && (
            <Link href="/notifications" className="relative">
              <span className="text-sm">🔔</span>
              {unreadCount && unreadCount > 0 && (
                <span
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <>
              <Link href="/profile" className={linkClass}>
                {user.name}
              </Link>
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
