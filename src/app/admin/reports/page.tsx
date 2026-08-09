"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatMoney, formatDate } from "@/lib/format";

/**
 * Revenue and membership-expiry reports, plus a manual trigger for the
 * membership_expiring notification job (NOTIF-004).
 *
 * Behavior note: "Total Revenue" and the by-month/by-method breakdowns
 * only ever reflect `payments` rows — corporate credit pool top-ups
 * never appear here (see ADMIN-002 in known-issues.md), so this
 * understates real money movement for gyms using corporate accounts.
 */
export default function AdminReportsPage() {
  const utils = trpc.useUtils();
  const { data: revenueByMonth, isLoading: monthLoading } =
    trpc.admin.revenueByMonth.useQuery();
  const { data: revenueByMethod, isLoading: methodLoading } =
    trpc.admin.revenueByMethod.useQuery();
  const { data: expiringMembers, isLoading: expiringLoading } =
    trpc.admin.expiringMemberships.useQuery();
  const { data: refundData, isLoading: refundLoading } =
    trpc.admin.refundCount.useQuery();

  // NOTIF-004: manual trigger for the same job the standalone daily
  // cron process runs (see server/cron.ts) — sends a
  // membership_expiring notification to everyone currently in
  // `expiringMembers` below, without needing `pnpm cron` running.
  const [notifySent, setNotifySent] = useState<number | null>(null);
  const runExpiryCheck = trpc.admin.runMembershipExpiryCheck.useMutation({
    onSuccess: async (result) => {
      setNotifySent(result.notified);
      await utils.admin.expiringMemberships.invalidate();
    },
  });

  const isLoading = monthLoading || methodLoading || expiringLoading || refundLoading;

  if (isLoading) return <p className="muted">Loading reports...</p>;

  const totalRevenue = (revenueByMonth || []).reduce(
    (sum, row) => sum + row.totalCents,
    0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="muted mt-1 text-sm">Payment analytics and member insights</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="panel p-4">
          <div className="muted text-xs uppercase tracking-wide">Total Revenue</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(totalRevenue)}</div>
        </div>

        <div className="panel p-4">
          <div className="muted text-xs uppercase tracking-wide">Refunds Issued</div>
          <div className="mt-1 text-xl font-semibold">{refundData?.count ?? 0}</div>
        </div>

        <div className="panel p-4">
          <div className="muted text-xs uppercase tracking-wide">Payment Methods</div>
          <div className="mt-1 text-xl font-semibold">{revenueByMethod?.length ?? 0}</div>
        </div>

        <div className="panel p-4">
          <div className="muted text-xs uppercase tracking-wide">Expiring Soon</div>
          <div className="mt-1 text-xl font-semibold">{expiringMembers?.length ?? 0}</div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Revenue by Month</h2>
        {revenueByMonth && revenueByMonth.length > 0 ? (
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {revenueByMonth.map((row) => (
              <div key={row.month} className="flex items-center justify-between p-3 text-sm">
                <span className="muted">{row.month}</span>
                <span className="font-medium">{formatMoney(row.totalCents)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No revenue data available.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Revenue by Payment Method</h2>
        {revenueByMethod && revenueByMethod.length > 0 ? (
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {revenueByMethod.map((row) => (
              <div key={row.method} className="flex items-center justify-between p-3 text-sm">
                <div className="flex-1">
                  <div className="capitalize">{row.method}</div>
                  <div className="muted text-xs">{row.count} transactions</div>
                </div>
                <span className="font-medium">{formatMoney(row.totalCents)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No payment method data available.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Memberships Expiring in 14 Days</h2>
          <button
            className="btn text-sm"
            disabled={runExpiryCheck.isPending || !expiringMembers?.length}
            onClick={() => {
              setNotifySent(null);
              runExpiryCheck.mutate();
            }}
          >
            {runExpiryCheck.isPending ? "Sending..." : "Send expiry reminders now"}
          </button>
        </div>

        {notifySent !== null && (
          <p className="panel p-3 text-sm" style={{ color: "#4ade80" }}>
            Sent {notifySent} reminder{notifySent === 1 ? "" : "s"}.
          </p>
        )}

        {expiringMembers && expiringMembers.length > 0 ? (
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {expiringMembers.map((member) => (
              <div key={member.memberId} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{member.memberName}</div>
                    <div className="muted text-xs">{member.memberEmail}</div>
                  </div>
                  <div className="text-right">
                    <div className="muted text-xs">{member.planName}</div>
                    <div className="text-xs">{formatDate(member.expiresAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No memberships expiring in the next 14 days.</p>
        )}
      </section>
    </div>
  );
}
