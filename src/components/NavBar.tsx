"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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

  const navLinkClass = (path: string) => {
    const isActive = pathname === path || (path !== "/" && pathname.startsWith(path + "/"));
    return `text-sm ${isActive ? "text-white font-medium" : "muted hover:text-white"}`;
  };

  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      router.push("/login");
    },
  });

  return (
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
        {/* Home link visible for everyone except admin */}
        {user?.role !== "admin" && (
          <Link href="/" className="font-semibold tracking-tight">
            FlexFit<span style={{ color: "var(--accent)" }}>.</span>
          </Link>
        )}

        {/* Schedule link only visible for members and trainers */}
        {(user?.role === "member" || user?.role === "trainer") && (
          <Link href="/schedule" className={navLinkClass("/schedule")}>
            Schedule
          </Link>
        )}

        {/* 
          WHY IT'S IMPLEMENTED: NavBar Cleanup.
          Trainers/admins shouldn't see member-specific links.
        */}
        {user?.role === "member" && (
          <>
            <Link href="/dashboard" className={navLinkClass("/dashboard")}>
              My bookings
            </Link>
            <Link href="/waitlist" className={navLinkClass("/waitlist")}>
              Waitlist
            </Link>
          </>
        )}

        {user?.role === "trainer" && (
          <Link href="/trainer/schedule" className={navLinkClass("/trainer/schedule")}>
            My schedule
          </Link>
        )}

        {user?.role === "admin" && (
          <>
            <Link href="/admin" className={navLinkClass("/admin")}>
              Admin
            </Link>
            <Link href="/admin/attendance" className={navLinkClass("/admin/attendance")}>
              Attendance
            </Link>
          </>
        )}

        {(user?.role === "admin" || user?.role === "trainer") && (
          <Link href="/kiosk" className={navLinkClass("/kiosk")}>
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
              <Link href="/profile" className="text-sm muted hover:text-white">
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
            <>
              <Link href="/signup" className="btn">
                Sign up
              </Link>
              <Link href="/login" className="btn btn-primary">
                Sign in
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
