"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

        {user && (
          <>
            <Link href="/dashboard" className="text-sm muted hover:text-white">
              My bookings
            </Link>
            <Link href="/waitlist" className="text-sm muted hover:text-white">
              Waitlist
            </Link>
          </>
        )}

        {user?.role === "trainer" && (
          <>
            {/* FIX(trainer): Added Availability link for trainers to manage their hours */}
            <Link href="/trainer/schedule" className="text-sm muted hover:text-white">
              My schedule
            </Link>
            <Link href="/trainer/availability" className="text-sm muted hover:text-white">
              Availability
            </Link>
          </>
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
