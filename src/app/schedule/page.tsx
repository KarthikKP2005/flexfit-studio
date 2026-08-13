"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";
import { BookingConfirmModal } from "@/components/booking-confirm-modal";

/**
 * Public class browser and booking entry point. Books against the
 * caller's personal membership credits via `bookings.book` by default;
 * for a member linked to an active company (CORP-005), the book button
 * also offers a company-credits option via `corporateBookings.book`.
 * Clicking Book/Personal credits/Company credits opens a confirmation
 * popup (class details + credits to be deducted) before either mutation
 * actually fires — previously it booked immediately on click.
 * Not responsible for: reconciling personal and corporate capacity —
 * `spotsLeft`/`full` below reflect personal bookings only, same as
 * before (see CORP-002 in known-issues.md, not changed here).
 */
export default function SchedulePage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: myCompany } = trpc.corporateBookings.myCompany.useQuery(undefined, {
    enabled: !!user,
  });
  // FIX: Stabilize the "from" date so React Query gets a consistent query key.
  // Previously `new Date().toISOString()` was called on every render, producing
  // a slightly different timestamp each time (milliseconds apart). React Query
  // treats each unique input as a new query → re-fetches → re-render → new
  // timestamp → infinite loop. useState(() => ...) runs once on mount only.
  const [now] = useState(() => new Date().toISOString());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const { data: classes, isLoading } = trpc.classes.list.useQuery({
    from: now,
  });

  const book = trpc.bookings.book.useMutation({
    onSuccess: async () => {
      await utils.classes.list.invalidate();
      await utils.bookings.mine.invalidate();
    },
  });

  const bookCorporate = trpc.corporateBookings.book.useMutation({
    onSuccess: async () => {
      await utils.classes.list.invalidate();
      await utils.corporateBookings.mine.invalidate();
    },
  });

  const bookingError = book.error ?? bookCorporate.error;
  const isBooking = book.isPending || bookCorporate.isPending;

  // Which class + credit source the confirm popup is currently showing,
  // or null when it's closed. Set by BookButton's callbacks below;
  // cleared on Cancel, overlay click, or a successful booking.
  const [confirmTarget, setConfirmTarget] = useState<{
    classId: number;
    className: string;
    startsAt: string;
    room: string;
    creditCost: number;
    full: boolean;
    source: "personal" | "corporate";
  } | null>(null);

  function closeConfirm() {
    setConfirmTarget(null);
  }

  function handleConfirm() {
    if (!confirmTarget) return;
    if (confirmTarget.source === "corporate") {
      bookCorporate.mutate(
        { classId: confirmTarget.classId },
        { onSuccess: closeConfirm },
      );
    } else {
      book.mutate(
        { classId: confirmTarget.classId },
        { onSuccess: closeConfirm },
      );
    }
  }

  if (isLoading) return <p className="muted">Loading schedule...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class schedule</h1>
        <p className="muted mt-1 text-sm">
          {classes?.length ?? 0} upcoming classes
        </p>
      </div>

      {bookingError && (
        <p className="panel p-3 text-sm" style={{ color: "#f87171" }}>
          {bookingError.message}
        </p>
      )}

      {/* Day Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setSelectedDay(null)}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            selectedDay === null 
              ? "bg-green-500/10 text-green-400 border border-green-500/20" 
              : "bg-[#12141a] text-gray-400 border border-transparent hover:text-gray-200"
          }`}
        >
          All Days
        </button>
        {DAYS.map((day, idx) => (
          <button
            key={day}
            onClick={() => setSelectedDay(idx)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedDay === idx 
                ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                : "bg-[#12141a] text-gray-400 border border-transparent hover:text-gray-200"
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {classes?.filter(c => selectedDay === null || new Date(c.startsAt).getDay() === selectedDay).length === 0 && (
          <p className="muted text-sm py-4">No classes scheduled for this day.</p>
        )}
        {classes?.filter(c => selectedDay === null || new Date(c.startsAt).getDay() === selectedDay).map((c) => (
          <div
            key={c.id}
            className="panel flex items-center gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{c.name}</h2>
                {c.full && (
                  <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "#3a2a1a", color: "#fbbf24" }}>
                    Full
                  </span>
                )}
              </div>
              <p className="muted mt-0.5 text-sm">
                {formatDateTime(c.startsAt)} &middot; {c.room} &middot;{" "}
                {c.trainerName ?? "Unassigned"} &middot; {c.durationMin} min
              </p>
            </div>

            <div className="text-right text-sm muted">
              <div>
                {c.spotsLeft} / {c.capacity} left
              </div>
              <div>
                {c.creditCost} credit{c.creditCost === 1 ? "" : "s"}
              </div>
            </div>

            {/* Signed-out visitors get a clickable Book button that sends
                them to sign in, instead of a disabled button — they no
                longer have to notice the small "Sign in to book a class"
                line below to know what to do. Signed-in behavior
                (book/waitlist, personal vs. company credits) is
                unchanged. */}
            <BookButton
              full={c.full}
              disabled={isBooking}
              company={myCompany ?? null}
              onBookPersonal={() =>
                user
                  ? setConfirmTarget({
                      classId: c.id,
                      className: c.name,
                      startsAt: c.startsAt,
                      room: c.room,
                      creditCost: c.creditCost,
                      full: c.full,
                      source: "personal",
                    })
                  : router.push("/login")
              }
              onBookCompany={() =>
                user
                  ? setConfirmTarget({
                      classId: c.id,
                      className: c.name,
                      startsAt: c.startsAt,
                      room: c.room,
                      creditCost: c.creditCost,
                      full: c.full,
                      source: "corporate",
                    })
                  : router.push("/login")
              }
            />
          </div>
        ))}
      </div>

      {!user && (
        <p className="muted text-sm">Sign in to book a class.</p>
      )}

      <BookingConfirmModal
        isOpen={confirmTarget !== null}
        className={confirmTarget?.className ?? ""}
        classTime={confirmTarget?.startsAt ?? ""}
        room={confirmTarget?.room ?? ""}
        creditCost={confirmTarget?.creditCost ?? 0}
        full={confirmTarget?.full ?? false}
        source={confirmTarget?.source ?? "personal"}
        companyName={myCompany?.name}
        isPending={isBooking}
        onConfirm={handleConfirm}
        onClose={closeConfirm}
      />
    </div>
  );
}

/**
 * Book button for one class row. A member with no active company link
 * (the common case) sees the exact same single button as before this
 * change. A company-linked member sees a button that expands on
 * hover/click into two options — personal vs. company credits — so the
 * choice is explicit rather than silently picked (see CORP-005).
 * Expanding on click too (not just hover) so it also works on touch
 * devices, which don't fire hover events.
 */
function BookButton({
  full,
  disabled,
  company,
  onBookPersonal,
  onBookCompany,
}: {
  full: boolean;
  disabled: boolean;
  company: { id: number; name: string; creditPoolBalance: number } | null;
  onBookPersonal: () => void;
  onBookCompany: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!company) {
    return (
      <button className="btn btn-primary" disabled={disabled} onClick={onBookPersonal}>
        {full ? "Join waitlist" : "Book"}
      </button>
    );
  }

  return (
    <div
      className="relative flex justify-end"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        className="flex gap-1.5 overflow-hidden transition-all duration-200"
        style={{ maxWidth: expanded ? 420 : 96 }}
      >
        {!expanded ? (
          <button
            className="btn btn-primary whitespace-nowrap"
            disabled={disabled}
            onClick={() => setExpanded(true)}
          >
            {full ? "Join waitlist" : "Book"}
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary whitespace-nowrap text-sm"
              disabled={disabled}
              onClick={onBookPersonal}
            >
              Personal credits
            </button>
            <button
              className="btn whitespace-nowrap text-sm"
              disabled={disabled}
              onClick={onBookCompany}
            >
              {company.name} credits
            </button>
          </>
        )}
      </div>
    </div>
  );
}
