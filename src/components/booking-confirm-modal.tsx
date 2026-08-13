"use client";

import { formatDateTime } from "@/lib/format";

/**
 * Confirmation popup shown before a class booking is actually submitted,
 * for both personal-credit and corporate-credit bookings. Reuses the
 * same overlay/panel styling as `reschedule-modal.tsx` for visual
 * consistency. Not responsible for: the booking eligibility rules
 * themselves (capacity, credits, membership) — those are unchanged and
 * still enforced server-side by `bookings.book`/`corporateBookings.book`;
 * this only adds a confirm step before that same call is made.
 */
interface BookingConfirmModalProps {
  isOpen: boolean;
  className: string;
  classTime: string;
  room: string;
  creditCost: number;
  full: boolean;
  source: "personal" | "corporate";
  companyName?: string;
  isPending: boolean;
  // SCHED-001: if the confirm mutation fails (e.g. already booked,
  // insufficient credits), this modal stays open (no onSuccess fires) —
  // without surfacing the error here too, the failure was previously
  // invisible, since the page's own error banner renders behind this
  // modal's overlay.
  errorMessage?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function BookingConfirmModal({
  isOpen,
  className,
  classTime,
  room,
  creditCost,
  full,
  source,
  companyName,
  isPending,
  errorMessage,
  onConfirm,
  onClose,
}: BookingConfirmModalProps) {
  if (!isOpen) return null;

  // Waitlisted bookings are always created with 0 credits used — credits
  // are only deducted later if/when promoted (see bookings.ts /
  // corporate-bookings.ts). The popup's credit line reflects that
  // instead of always showing the class's creditCost.
  const creditLine = full
    ? "You'll join the waitlist — no credits will be deducted unless you're promoted into a confirmed spot."
    : `${creditCost} credit${creditCost === 1 ? "" : "s"} will be deducted from your ${
        source === "corporate" ? `${companyName}'s pool` : "personal membership"
      }.`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="panel space-y-4 p-6"
        style={{ maxWidth: "420px", width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">
            {full ? "Join waitlist?" : "Confirm booking"}
          </h2>
          <p className="muted mt-1 text-sm">
            {className} &middot; {formatDateTime(classTime)} &middot; {room}
          </p>
        </div>

        <p className="text-sm">{creditLine}</p>

        {errorMessage && (
          <p style={{ color: "#f87171", fontSize: "0.875rem" }}>
            {errorMessage}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn" disabled={isPending} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Booking..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
