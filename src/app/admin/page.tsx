"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { formatMoney, formatDateTime } from "@/lib/format";

/**
 * Admin dashboard: headline stats, class utilisation, recent payments,
 * and links to Companies/Reports/Announcements — the only place those
 * three pages are reachable from, since NavBar doesn't link them.
 *
 * Behavior note: unlike attendance/trainer-schedule/kiosk, this page has
 * no client-side role check of its own — a non-admin just sees
 * `admin.stats`'s FORBIDDEN error message raw, not a friendly
 * "Access denied." The server-side rejection is still the real security
 * boundary either way.
 */
export default function AdminPage() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading, error } = trpc.admin.stats.useQuery(undefined, {
    retry: false,
  });
  const { data: utilisation } = trpc.admin.classUtilisation.useQuery({ limit: 8 });
  const { data: payments } = trpc.payments.all.useQuery({ limit: 10 });
  const { data: payroll } = trpc.admin.trainerPayroll.useQuery();
  
  const { data: settings } = trpc.admin.settings.useQuery();
  const updateSettings = trpc.admin.updateSettings.useMutation({
    onSuccess: () => utils.admin.settings.invalidate(),
  });
  
  const [windowMinutes, setWindowMinutes] = useState(30);
  useEffect(() => {
    if (settings) setWindowMinutes(settings.checkinWindowMinutes);
  }, [settings]);

  if (isLoading) return <p className="muted">Loading...</p>;
  if (error) return <p className="muted">{error.message}</p>;

  const tiles: [string, string][] = [
    ["Members", String(stats!.totalMembers)],
    ["Active memberships", String(stats!.activeMemberships)],
    ["Upcoming classes", String(stats!.upcomingClasses)],
    ["MRR", formatMoney(stats!.revenueCents)],
    ["Check-ins", String(stats!.totalCheckins)],
    ["Pending payments", String(stats!.pendingPayments)],
  ];

  return (
    <div className="space-y-10 py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="muted mt-1 text-sm">Studio performance and management</p>
        </div>
      </div>

      {/* Quick Action Management Bar */}
      <section className="panel p-3 overflow-x-auto border-t-2 border-t-blue-500/50">
        <div className="flex items-center gap-2 whitespace-nowrap min-w-max">
          <Link href="/admin/classes" className="btn text-xs bg-[#12141a] hover:bg-[#1a1e28] px-4 py-2 border-transparent">Schedule</Link>
          <Link href="/admin/members" className="btn text-xs bg-[#12141a] hover:bg-[#1a1e28] px-4 py-2 border-transparent">CRM</Link>
          <Link href="/admin/plans" className="btn text-xs bg-[#12141a] hover:bg-[#1a1e28] px-4 py-2 border-transparent">Plans</Link>
          <Link href="/admin/staff" className="btn text-xs bg-[#12141a] hover:bg-[#1a1e28] px-4 py-2 border-transparent">Staff</Link>
          <Link href="/admin/companies" className="btn text-xs bg-[#12141a] hover:bg-[#1a1e28] px-4 py-2 border-transparent">Corporate</Link>
          <Link href="/admin/reports" className="btn text-xs bg-[#12141a] hover:bg-[#1a1e28] px-4 py-2 border-transparent">Reports</Link>
          <Link href="/admin/announcements" className="btn text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 px-4 py-2 ml-auto">Send Announcement</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {tiles.map(([label, value], i) => (
          <div key={label} className={`panel p-6 flex flex-col justify-center ${i === 3 ? "bg-gradient-to-br from-[#171a21] to-[#12141a] border-t-2 border-t-green-500/50" : ""}`}>
            <div className="muted text-xs font-semibold uppercase tracking-wider mb-2">{label}</div>
            <div className={`text-3xl font-bold ${i === 3 ? "text-green-400" : ""}`}>{value}</div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Class utilisation</h2>
        <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
          {utilisation?.map((c) => (
            <div key={c.id} className="flex items-center gap-4 p-3 text-sm">
              <span className="flex-1">{c.name}</span>
              <span className="muted">{formatDateTime(c.startsAt)}</span>
              <span className="muted">
                {c.booked}/{c.capacity}
              </span>
              <span style={{ color: c.utilisation > 0.8 ? "var(--accent)" : undefined }}>
                {Math.round(c.utilisation * 100)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Recent payments</h2>
        <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
          {payments?.map((p) => (
            <div key={p.id} className="flex items-center gap-4 p-3 text-sm">
              <span className="flex-1">{p.memberName}</span>
              <span className="muted">{p.method}</span>
              <span className="muted">{p.status}</span>
              <span>{formatMoney(p.amountCents)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Trainer Payroll (This Month)</h2>
        <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
          {payroll?.length === 0 && (
            <div className="p-3 text-sm muted">No check-ins recorded this month.</div>
          )}
          {payroll?.map((p) => (
            <div key={p.trainerName} className="flex items-center gap-4 p-3 text-sm">
              <span className="flex-1 font-medium">{p.trainerName}</span>
              <span className="muted">{p.totalHeads} check-ins</span>
              <span style={{ color: "var(--accent)" }}>
                {formatMoney(p.totalHeads * 2000)} {/* Example rate: $20 per head */}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Studio Settings</h2>
        <form 
          className="panel p-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateSettings.mutate({ checkinWindowMinutes: windowMinutes });
          }}
        >
          <div className="space-y-1.5 max-w-sm">
            <label className="text-sm muted">Check-in Window (Minutes before class)</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                type="number"
                min="5"
                max="1440"
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(parseInt(e.target.value) || 30)}
                required
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={updateSettings.isPending || windowMinutes === settings?.checkinWindowMinutes}
              >
                {updateSettings.isPending ? "Saving..." : "Save"}
              </button>
            </div>
            <p className="text-xs muted">
              Prevents members and trainers from checking in too early or late.
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
