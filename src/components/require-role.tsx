"use client";

import { trpc } from "@/lib/trpc";

type Role = "member" | "trainer" | "admin";

/**
 * Client-side presentational gate for role-restricted pages (admin,
 * trainer, kiosk). Not responsible for actual security — every tRPC
 * procedure these pages call is already protected server-side via
 * `adminProcedure`/`staffProcedure` (see `src/server/trpc.ts`), which
 * remains the real authorization boundary and is unchanged by this
 * component. This only controls what an unauthorized visitor sees
 * client-side while that server-side rejection would occur, so a denied
 * visitor never sees the page's real content or triggers its data
 * queries in the meantime (see AUTH-004 in known-issues.md).
 */
export function RequireRole({
  role,
  children,
}: {
  role: Role | Role[];
  children: React.ReactNode;
}) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const allowedRoles = Array.isArray(role) ? role : [role];

  // Wait for auth.me to actually settle before judging anything — a
  // premature check (branching while `user` is still `undefined` on
  // first paint) is what caused legitimate staff to see a false
  // "Access denied" flash before this fix (AUTH-004).
  if (isLoading) return <p className="muted">Loading...</p>;

  if (!user) {
    return <p className="muted">Please sign in to view this page.</p>;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <p className="muted">
        Access denied. This page is restricted to{" "}
        {allowedRoles.join(" or ")} accounts.
      </p>
    );
  }

  return <>{children}</>;
}
