"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

/**
 * Modal for picking a same-named class to reschedule an existing
 * booking into. Excludes the original class itself from the picker (see
 * RESCH-005 in known-issues.md), and resets its own `error`/selection
 * state on close/reselect (RESCH-007) — not responsible for the actual
 * reschedule eligibility rules, those live server-side in
 * `reschedules.ts`.
 */
interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromBookingId: number;
  fromClassId: number;
  fromClassName: string;
  fromClassTime: string;
  onSuccess: () => void;
}

export function RescheduleModal({
  isOpen,
  onClose,
  fromBookingId,
  fromClassId,
  fromClassName,
  fromClassTime,
  onSuccess,
}: RescheduleModalProps) {
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Get available classes with the same name. `from` is memoized on
  // `isOpen` (RESCH-006 — it used to be computed inline as `new
  // Date().toISOString()` on every render, which made every render pass
  // a new query input, so react-query treated each render as a brand
  // new query: fetch → resolves → state update → re-render → new `from`
  // → new query, forever. Reproduced live: 200+ requests in 6 seconds
  // with the picker permanently stuck on "No other classes available."
  // Memoizing keeps the query key stable while the modal stays open, and
  // still refreshes to "now" each time it's reopened.
  const fromTimestamp = useMemo(() => new Date().toISOString(), [isOpen]);

  const { data: availableClasses } = trpc.classes.list.useQuery(
    {
      from: fromTimestamp,
    },
    {
      enabled: isOpen,
    }
  );

  // Same-named future classes, excluding the original one being moved
  // from (RESCH-005 — previously only checked the name, so the original
  // class stayed selectable and picking it failed server-side with
  // "You already have an active booking for this class").
  const sameNameClasses = (availableClasses || []).filter(
    (cls) => cls.name === fromClassName && cls.id !== fromClassId
  );

  const reschedule = trpc.reschedules.reschedule.useMutation({
    onSuccess: async () => {
      await utils.bookings.mine.invalidate();
      await utils.bookings.waitlisted.invalidate();
      await utils.reschedules.history.invalidate();
      await utils.classes.list.invalidate();
      handleClose();
      onSuccess();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // RESCH-007 fix: the component never unmounts between opens (`isOpen`
  // just toggles an early `return null` below), so its `useState` stays
  // alive across opens. Without this, `error` from a failed attempt was
  // only ever set (in onError above) and never cleared, so it stayed
  // visible on the next reopen until a new failed submit overwrote it.
  // Route every way the modal can go away — success, Cancel, overlay
  // click — through this one resetter instead of `onClose` directly.
  function handleClose() {
    setSelectedClassId(null);
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

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
      onClick={handleClose}
    >
      <div
        className="panel space-y-4 p-6"
        style={{ maxWidth: "500px", width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">Reschedule class</h2>
          <p className="muted mt-1 text-sm">
            Moving: {fromClassName} on {formatDateTime(fromClassTime)}
          </p>
        </div>

        {error && (
          <p style={{ color: "#f87171", fontSize: "0.875rem" }}>
            {error}
          </p>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sameNameClasses.length ? (
            sameNameClasses.map((cls) => (
              <button
                key={cls.id}
                className={`panel w-full p-3 text-left`}
                onClick={() => {
                  // Selecting a different target clears any error from a
                  // previous failed attempt (RESCH-007) — otherwise a
                  // stale message from one class stays displayed while
                  // browsing to another.
                  setSelectedClassId(cls.id);
                  setError(null);
                }}
                style={{
                  border:
                    selectedClassId === cls.id
                      ? "2px solid #3b82f6"
                      : "1px solid transparent",
                }}
                disabled={reschedule.isPending}
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">{cls.name}</h3>
                  {(cls.full || (cls.spotsLeft ?? 0) === 0) && (
                    <span
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ background: "#3a2a1a", color: "#fbbf24" }}
                    >
                      Waitlist
                    </span>
                  )}
                </div>
                <p className="muted text-xs mt-1">
                  {formatDateTime(cls.startsAt)} • {cls.room}
                </p>
              </button>
            ))
          ) : (
            <p className="muted text-sm text-center py-4">
              No other {fromClassName} classes available
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            className="btn"
            disabled={reschedule.isPending}
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={
              !selectedClassId || reschedule.isPending
            }
            onClick={() => {
              if (selectedClassId) {
                reschedule.mutate({
                  fromBookingId,
                  toClassId: selectedClassId,
                });
              }
            }}
          >
            {reschedule.isPending ? "Rescheduling..." : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
