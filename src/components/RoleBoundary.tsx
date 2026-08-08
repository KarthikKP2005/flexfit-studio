"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

export function RoleBoundary({
  allowedRoles,
  children,
}: {
  allowedRoles: ("admin" | "trainer" | "member")[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login");
      } else if (!allowedRoles.includes(user.role)) {
        // Redirect unauthorized users to their default dashboard
        if (user.role === "admin") router.push("/admin");
        else if (user.role === "trainer") router.push("/trainer/schedule");
        else router.push("/dashboard");
      }
    }
  }, [user, isLoading, allowedRoles, router]);

  if (isLoading || !user || !allowedRoles.includes(user.role)) {
    return <div className="p-8 text-center text-sm muted">Loading...</div>;
  }

  return <>{children}</>;
}
