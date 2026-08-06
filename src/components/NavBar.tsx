/**
 * components/NavBar.tsx — Main navigation header.
 *
 * Responsible for: rendering the top navigation bar, checking the current
 * user's session and unread notifications, and logging out.
 *
 * NOT responsible for: page-level route protection (handled by layout.tsx
 * or tRPC procedures).
 *
 * Fix: TRAINER-NAV (System Problem #68)
 * By using conditional rendering (`user?.role === ...`), we ensure trainers
 * and admins no longer see irrelevant member links like "My bookings", and
 * are instead routed to their respective dashboards.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

export function NavBar() {
  const router = useRouter();
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

  return (
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          FlexFit<span style={{ color: "var(--accent)" }}>.</span>
        </Link>

        <Link href="/schedule" className="text-sm muted hover:text-white">
          Schedule
        </Link>

        {/* TRAINER-NAV: Hide member-only links from trainers and admins */}
        {user?.role === "member" && (
          <>
            <Link href="/dashboard" className="text-sm muted hover:text-white">
              My bookings
            </Link>
            <Link href="/waitlist" className="text-sm muted hover:text-white">
              Waitlist
            </Link>
          </>
        )}

        {/* TRAINER-NAV: Show trainer-specific links */}
        {user?.role === "trainer" && (
          <Link href="/trainer/schedule" className="text-sm muted hover:text-white">
            My schedule
          </Link>
        )}

        {user?.role === "admin" && (
          <>
            <Link href="/admin" className="text-sm muted hover:text-white">
              Admin
            </Link>
            <Link href="/admin/attendance" className="text-sm muted hover:text-white">
              Attendance
            </Link>
          </>
        )}

        {(user?.role === "admin" || user?.role === "trainer") && (
          <Link href="/kiosk" className="text-sm muted hover:text-white">
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
              <span className="text-sm muted">{user.name}</span>
              <button
                className="btn"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
