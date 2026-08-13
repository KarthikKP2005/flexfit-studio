"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/format";
import { RescheduleModal } from "@/components/reschedule-modal";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Member-facing home: membership summary, upcoming personal and
 * corporate bookings with cancel/reschedule actions, and reschedule
 * history. Not responsible for: reschedule of corporate bookings —
 * `reschedules.ts` only ever operates on the personal `bookings` table,
 * so corporate rows only get a Cancel action (see CORP-005) — or
 * role-aware content — this is the page every role lands on after login
 * regardless of their actual role (see login/page.tsx's redirect note).
 */
export default function DashboardPage() {
  const [rescheduleModal, setRescheduleModal] = useState<{
    isOpen: boolean;
    bookingId: number;
    classId: number;
    className: string;
    classTime: string;
  }>({
    isOpen: false,
    bookingId: 0,
    classId: 0,
    className: "",
    classTime: "",
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.members.profile.useQuery(undefined, {
    retry: false,
  });
  const { data: bookings } = trpc.bookings.mine.useQuery({ includePast: false });
  const { data: corporateBookings } = trpc.corporateBookings.mine.useQuery({ includePast: false });
  // COMPANY-002: existing, unmodified query — `/schedule` already uses it
  // for the personal/company credit-source picker. `null` covers both
  // "never linked" and "linked but the company was since deactivated"
  // (see getCompanyForMember's own comment) — not distinguished here,
  // same as everywhere else this query is already used.
  const { data: company } = trpc.corporateBookings.myCompany.useQuery();
  const { data: rescheduleHistory } = trpc.reschedules.history.useQuery();

  const cancel = trpc.bookings.cancel.useMutation({
    onSuccess: async () => {
      await utils.bookings.mine.invalidate();
      await utils.members.profile.invalidate();
      await utils.classes.list.invalidate();
    },
  });

  const cancelCorporate = trpc.corporateBookings.cancel.useMutation({
    onSuccess: async () => {
      await utils.corporateBookings.mine.invalidate();
      await utils.classes.list.invalidate();
    },
  });

  if (isLoading) return <p className="muted">Loading...</p>;
  if (!profile) return <p className="muted">Please sign in to view your bookings.</p>;

  const ms = profile.membership;

  return (
    <div className="space-y-10 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, {profile.name.split(" ")[0]}
        </h1>
        <p className="muted mt-1 text-sm">
          {profile.classesAttended} classes attended
        </p>
      </div>

      <div className="rounded-xl border p-6 space-y-10" style={{ borderColor: "var(--border)" }}>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Your Membership</h2>
        {ms ? (
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="panel p-5 border-t-2 border-t-green-500/50 flex flex-col justify-center">
              <span className="muted text-xs font-semibold uppercase tracking-wider mb-1">Active Plan</span>
              <span className="text-lg font-medium">{ms.planName}</span>
            </div>
            
            <div className="panel p-5 flex flex-col justify-center relative overflow-hidden">
              <span className="muted text-xs font-semibold uppercase tracking-wider mb-1">Status</span>
              <span className="text-lg font-medium text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                {ms.status.charAt(0).toUpperCase() + ms.status.slice(1)}
              </span>
            </div>
            
            <div className="panel p-5 flex flex-col justify-center">
              <span className="muted text-xs font-semibold uppercase tracking-wider mb-1">Credits Remaining</span>
              {ms.creditsRemaining >= 999 ? (
                <span className="inline-flex w-max items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                  Unlimited
                </span>
              ) : (
                <span className="text-2xl font-bold">{ms.creditsRemaining}</span>
              )}
            </div>
            
            <div className="panel p-5 flex flex-col justify-center">
              <span className="muted text-xs font-semibold uppercase tracking-wider mb-1">Renews On</span>
              <span className="text-lg font-medium">{formatDate(ms.endDate)}</span>
            </div>
          </div>
        ) : (
          <div className="panel p-6 text-center space-y-3 bg-gradient-to-br from-[#171a21] to-[#12141a]">
            <p className="muted">No active membership found.</p>
            <a href="/plans" className="btn btn-primary inline-block">Explore Plans</a>
          </div>
        )}
      </section>

      {/* COMPANY-002: corporate credit pool visibility, mirrors the
          personal membership card above. No "renews on" row — the
          companies table has no renewal/expiry date field, unlike a
          personal membership's endDate (see known-issues.md). */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Corporate Membership</h2>
        {company ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="panel p-5 border-t-2 border-t-green-500/50 flex flex-col justify-center">
              <span className="muted text-xs font-semibold uppercase tracking-wider mb-1">Company</span>
              <span className="text-lg font-medium">{company.name}</span>
            </div>

            <div className="panel p-5 flex flex-col justify-center relative overflow-hidden">
              <span className="muted text-xs font-semibold uppercase tracking-wider mb-1">Status</span>
              <span className="text-lg font-medium text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                Active
              </span>
            </div>

            <div className="panel p-5 flex flex-col justify-center">
              <span className="muted text-xs font-semibold uppercase tracking-wider mb-1">Credit Pool Balance</span>
              <span className="text-2xl font-bold">{company.creditPoolBalance}</span>
            </div>
          </div>
        ) : (
          <div className="panel p-6 text-center space-y-1 bg-gradient-to-br from-[#171a21] to-[#12141a]">
            <p className="muted">Not part of any corporate account.</p>
          </div>
        )}
      </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Upcoming bookings</h2>

        {successMessage && (
          <p className="panel p-3 text-sm" style={{ color: "#4ade80" }}>
            {successMessage}
          </p>
        )}

        {cancel.error && (
          <p className="panel p-3 text-sm" style={{ color: "#f87171" }}>
            {cancel.error.message}
          </p>
        )}

        {bookings && bookings.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence>
              {bookings.filter(b => b.status !== "cancelled").map((b) => (
                <motion.div 
                  key={b.id} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="panel p-5 flex flex-col gap-4"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{b.className}</h3>
                      <p className="muted text-sm mt-1">
                        {formatDateTime(b.startsAt)} &middot; {b.room}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${
                      b.status === "booked" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                      b.status === "waitlisted" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                      "bg-gray-500/10 text-gray-400"
                    }`}>
                      {b.status}
                    </span>
                  </div>

                  {(b.status === "booked" || b.status === "waitlisted") && (
                    <div className="flex gap-2 w-full sm:w-auto">
                    {b.status === "booked" && (
                      <button
                        className="btn text-sm flex-1 sm:flex-none"
                        disabled={cancel.isPending}
                        onClick={() => {
                          setRescheduleModal({
                            isOpen: true,
                            bookingId: b.id,
                            classId: b.classId,
                            className: b.className,
                            classTime: b.startsAt,
                          });
                        }}
                      >
                        Reschedule
                      </button>
                    )}
                    <button
                      className="btn text-sm flex-1 sm:flex-none"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate({ bookingId: b.id })}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <p className="muted text-sm">No upcoming bookings.</p>
        )}
      </section>

      {corporateBookings && corporateBookings.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Corporate bookings</h2>

          {cancelCorporate.error && (
            <p className="panel p-3 text-sm" style={{ color: "#f87171" }}>
              {cancelCorporate.error.message}
            </p>
          )}

          <div className="space-y-2">
            <AnimatePresence>
              {corporateBookings.filter(b => b.status !== "cancelled").map((b) => (
                <motion.div 
                  key={b.id} 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="panel flex items-center gap-2 p-4 flex-wrap sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{b.className}</h3>
                      <span className="muted text-xs uppercase tracking-wide">
                        {b.status}
                      </span>
                    </div>
                    <p className="muted mt-0.5 text-sm">
                      {formatDateTime(b.startsAt)} &middot; {b.room} &middot; {b.companyName}
                    </p>
                  </div>

                  {(b.status === "booked" || b.status === "waitlisted") && (
                    <button
                      className="btn text-sm flex-1 sm:flex-none"
                      disabled={cancelCorporate.isPending}
                      onClick={() => cancelCorporate.mutate({ bookingId: b.id })}
                    >
                      Cancel
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {rescheduleHistory && rescheduleHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Reschedule history</h2>
          <div className="space-y-2">
            {rescheduleHistory.map((r) => (
              <div key={r.id} className="panel p-4">
                <div className="text-sm">
                  <p className="font-medium">
                    {r.fromClassName}
                  </p>
                  <p className="muted text-xs mt-1">
                    From: {formatDateTime(r.fromClassTime ?? "")} • {r.fromClassRoom}
                  </p>
                  <p className="muted text-xs">
                    To: {formatDateTime(r.toClassTime ?? "")} • {r.toClassRoom}
                  </p>
                  <p className="muted text-xs mt-1">
                    Rescheduled {formatDate(r.rescheduledAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <RescheduleModal
        isOpen={rescheduleModal.isOpen}
        onClose={() =>
          setRescheduleModal({ ...rescheduleModal, isOpen: false })
        }
        fromBookingId={rescheduleModal.bookingId}
        fromClassId={rescheduleModal.classId}
        fromClassName={rescheduleModal.className}
        fromClassTime={rescheduleModal.classTime}
        onSuccess={() => {
          setSuccessMessage("Class rescheduled successfully!");
          setTimeout(() => setSuccessMessage(null), 3000);
        }}
      />
    </div>
  );
}
