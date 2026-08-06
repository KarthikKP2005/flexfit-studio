"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

/**
 * Modal for picking a same-named class to reschedule an existing
 * booking into. Not responsible for: excluding the original class from
 * the picker — see the behavior note on `sameNameClasses` below, this
 * component doesn't receive the original class's id at all.
 */
interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromBookingId: number;
  fromClassName: string;
  fromClassTime: string;
  onSuccess: () => void;
}

export function RescheduleModal({
  isOpen,
  onClose,
  fromBookingId,
  fromClassName,
  fromClassTime,
  onSuccess,
}: RescheduleModalProps) {
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Get available classes with the same name
  const { data: availableClasses } = trpc.classes.list.useQuery(
    {
      from: new Date().toISOString(),
    },
    {
      enabled: isOpen,
    }
  );

  // Behavior note: despite the comment above, this does NOT exclude the
  // original class — it only checks the name, and the component is
  // never given the original class's id to compare against. The
  // original class stays selectable; picking it fails server-side with
  // "You already have an active booking for this class." See plan.md
  // item #37.
  const sameNameClasses = (availableClasses || []).filter(
    (cls) => cls.name === fromClassName
  );

  const reschedule = trpc.reschedules.reschedule.useMutation({
    onSuccess: async () => {
      await utils.bookings.mine.invalidate();
      await utils.bookings.waitlisted.invalidate();
      await utils.reschedules.history.invalidate();
      await utils.classes.list.invalidate();
      setSelectedClassId(null);
      onClose();
      onSuccess();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Behavior note: `error` is only ever set (in onError above), never
  // reset — reopening the modal, picking a different target class, or
  // closing via the overlay all leave a previous error message visible
  // until the next failed submit overwrites it. See plan.md item #38.
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
      onClick={onClose}
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
                onClick={() => setSelectedClassId(cls.id)}
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
            onClick={onClose}
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
