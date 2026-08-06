/**
 * trainer/schedule/page.tsx — Trainer-facing dashboard page.
 *
 * Responsible for: displaying the trainer's upcoming classes with attendance
 * stats (normal + corporate combined), an expandable named roster per class,
 * and weekly availability management (add/edit/remove time slots).
 *
 * NOT responsible for: class creation/update/cancellation (admin-only),
 * booking mutations, or check-in flows (see /kiosk).
 *
 * Key fixes applied here:
 * - TRAINER-02: Added expandable named roster (was aggregate counts only)
 * - TRAINER-04: Attendance stats now include corporate bookings
 */
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
/**
 * StatusBadge — small colored pill showing booking status.
 * Maps each booking status string to a background/text color pair.
 * Used in the roster list to visually distinguish booked/attended/waitlisted/cancelled.
 */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    booked: { bg: "#1e3a5f", color: "#93c5fd", label: "Booked" },
    attended: { bg: "#14532d", color: "#86efac", label: "Attended" },
    waitlisted: { bg: "#422006", color: "#fcd34d", label: "Waitlisted" },
    cancelled: { bg: "#3f1f1f", color: "#fca5a5", label: "Cancelled" },
  };
  const style = map[status] ?? { bg: "#333", color: "#ccc", label: status };
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-medium"
      style={{ background: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
}

/**
 * ClassCard — renders a single class entry on the trainer schedule.
 *
 * Shows: class name, time, room, duration, occupancy bar, and booking stats
 * (normal + corporate combined — TRAINER-04). Includes a toggle button to
 * expand/collapse the full named roster (TRAINER-02).
 *
 * The roster is fetched lazily via `trainers.rosterWithCorporate` only when
 * the trainer clicks "View Roster", so we don't load member data for every
 * class on page mount.
 *
 * Defects addressed: TRAINER-02 (named roster), TRAINER-04 (corporate count)
 * Source: finallist_phase1.docx — Trainer Problems #2, #4
 */
function ClassCard({
  classId,
  className,
  startsAt,
  room,
  durationMin,
  capacity,
  cancelled,
  totalBookedCount,
  normalBookedCount,
  corporateBookedCount,
  checkinCount,
}: {
  classId: number;
  className: string;
  startsAt: string;
  room: string;
  durationMin: number;
  capacity: number;
  cancelled: boolean;
  totalBookedCount: number;
  normalBookedCount: number;
  corporateBookedCount: number;
  checkinCount: number;
}) {
  const [showRoster, setShowRoster] = useState(false);

  // TRAINER-02: Fetch the named roster (normal + corporate members combined)
  // from the server. Only fires when the trainer expands this class's roster
  // panel (enabled: showRoster) to avoid unnecessary API calls on page load.
  const { data: roster, isLoading: rosterLoading } =
    trpc.trainers.rosterWithCorporate.useQuery(
      { classId },
      { enabled: showRoster },
    );

  const occupancyPct = capacity > 0 ? Math.round((totalBookedCount / capacity) * 100) : 0;

  return (
    <div
      className="rounded-xl border p-4 space-y-3 transition-all duration-200"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-secondary)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base">{className}</span>
            {cancelled && (
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={{ background: "#7f1d1d", color: "#fca5a5" }}
              >
                Cancelled
              </span>
            )}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--fg-muted, #9ca3af)" }}
          >
            {formatDateTime(startsAt)} · {room} · {durationMin} min
          </div>
        </div>

        {/* Fix #1: roster toggle button */}
        {!cancelled && (
          <button
            onClick={() => setShowRoster((v) => !v)}
            className="btn btn-sm shrink-0"
            style={{
              background: showRoster ? "var(--accent)" : "var(--bg-secondary)",
              color: showRoster ? "#fff" : "var(--fg)",
              borderColor: "var(--border)",
              fontSize: "0.75rem",
              padding: "4px 10px",
            }}
          >
            {showRoster ? "Hide Roster" : "View Roster"}
          </button>
        )}
      </div>

      {/* Stats row — Fix #4: shows totalBookedCount (normal + corporate) */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <div className="flex items-center gap-1.5">
          <span>📊</span>
          <span style={{ color: "var(--fg-muted, #9ca3af)" }}>
            <strong style={{ color: "var(--fg)" }}>{totalBookedCount}</strong>
            /{capacity} booked
            {corporateBookedCount > 0 && (
              <span style={{ color: "#fbbf24", marginLeft: "4px" }}>
                ({normalBookedCount} personal + {corporateBookedCount} corporate)
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>✓</span>
          <span style={{ color: "var(--fg-muted, #9ca3af)" }}>
            <strong style={{ color: "var(--fg)" }}>{checkinCount}</strong> checked in
          </span>
        </div>

        {/* Occupancy bar */}
        <div className="flex-1 min-w-24">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(occupancyPct, 100)}%`,
                background:
                  occupancyPct >= 90
                    ? "#ef4444"
                    : occupancyPct >= 70
                    ? "#f59e0b"
                    : "var(--accent)",
              }}
            />
          </div>
        </div>
        <span
          className="text-xs font-medium"
          style={{
            color:
              occupancyPct >= 90
                ? "#ef4444"
                : occupancyPct >= 70
                ? "#f59e0b"
                : "var(--accent)",
          }}
        >
          {occupancyPct}%
        </span>
      </div>

      {/* Fix #2: Expanded named roster panel */}
      {showRoster && (
        <div
          className="rounded-lg border pt-2 pb-1 px-3 space-y-1"
          style={{
            borderColor: "var(--border)",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {rosterLoading ? (
            <p className="text-xs py-2" style={{ color: "var(--fg-muted, #9ca3af)" }}>
              Loading roster…
            </p>
          ) : !roster || roster.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--fg-muted, #9ca3af)" }}>
              No bookings yet.
            </p>
          ) : (
            <>
              <div
                className="text-xs font-medium pb-1"
                style={{ color: "var(--fg-muted, #9ca3af)", borderBottom: "1px solid var(--border)" }}
              >
                Member Roster ({roster.length})
              </div>
              {/* Walk each roster entry (sorted chronologically by bookedAt)
                  and render a row with avatar initial, name, email, booking
                  status badge, and a "Corp" tag for corporate bookings. */}
              {roster.map((entry, i) => (
                <div
                  key={`${entry.source}-${entry.id}`}
                  className="flex items-center justify-between py-1 text-xs"
                  style={{
                    borderBottom: i < roster.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {entry.memberName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{entry.memberName}</div>
                      <div
                        className="truncate"
                        style={{ color: "var(--fg-muted, #9ca3af)", fontSize: "0.65rem" }}
                      >
                        {entry.memberEmail}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <StatusBadge status={entry.status} />
                    {entry.source === "corporate" && (
                      <span
                        className="rounded px-1.5 py-0.5 text-xs"
                        style={{ background: "#292524", color: "#fbbf24" }}
                      >
                        Corp
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day names (local, matching JS Date.getDay() — 0=Sun … 6=Sat)
// ---------------------------------------------------------------------------
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function TrainerSchedulePage() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: upcomingClasses, isLoading: classesLoading } =
    trpc.trainers.upcomingClasses.useQuery(undefined, {
      enabled: user?.role === "trainer",
    });
  const { data: availability, isLoading: availLoading } =
    trpc.trainers.availability.useQuery(undefined, {
      enabled: user?.role === "trainer",
    });

  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const setAvailability = trpc.trainers.setAvailability.useMutation({
    onSuccess: async () => {
      await utils.trainers.availability.invalidate();
      setEditingDay(null);
      setStartTime("");
      setEndTime("");
    },
  });

  const removeAvailability = trpc.trainers.removeAvailability.useMutation({
    onSuccess: async () => {
      await utils.trainers.availability.invalidate();
    },
  });

  if (user?.role !== "trainer") {
    return (
      <p className="muted">Access denied. Trainers only.</p>
    );
  }

  const isLoading = classesLoading || availLoading;

  const handleEditDay = (day: number) => {
    const existing = availability?.find((a) => a.dayOfWeek === day);
    setEditingDay(day);
    setStartTime(existing?.startTime || "");
    setEndTime(existing?.endTime || "");
  };

  const handleSave = () => {
    if (editingDay === null || !startTime || !endTime) return;
    setAvailability.mutate({
      dayOfWeek: editingDay,
      startTime,
      endTime,
    });
  };

  const handleRemove = (day: number) => {
    removeAvailability.mutate({ dayOfWeek: day });
  };

  if (isLoading) return <p className="muted">Loading…</p>;

  const availabilityMap = new Map(
    availability?.map((a) => [a.dayOfWeek, a]) || [],
  );

  return (
    <div className="space-y-10">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Trainer Schedule
        </h1>
        <p className="muted mt-1 text-sm">
          Manage your availability and upcoming classes. Availability is stored
          in local time.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Upcoming classes                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Upcoming Classes</h2>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: "var(--bg-secondary)", color: "var(--fg-muted, #9ca3af)", border: "1px solid var(--border)" }}
          >
            {upcomingClasses?.length ?? 0} classes
          </span>
        </div>

        {upcomingClasses && upcomingClasses.length > 0 ? (
          <div className="space-y-3">
            {upcomingClasses.map((cls) => (
              <ClassCard
                key={cls.id}
                classId={cls.id}
                className={cls.name}
                startsAt={cls.startsAt}
                room={cls.room}
                durationMin={cls.durationMin}
                capacity={cls.capacity}
                cancelled={cls.cancelled}
                totalBookedCount={cls.totalBookedCount}
                normalBookedCount={cls.normalBookedCount}
                corporateBookedCount={cls.corporateBookedCount}
                checkinCount={cls.checkinCount}
              />
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No upcoming classes.</p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Weekly availability                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-lg">Weekly Availability</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted, #9ca3af)" }}>
            Times are in your local timezone and are enforced server-side when classes are scheduled.
          </p>
        </div>
        <div className="space-y-2">
          {DAYS.map((day, idx) => {
            const avail = availabilityMap.get(idx);
            const isEditing = editingDay === idx;

            return (
              <div
                key={idx}
                className="panel p-4 rounded-xl"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{day}</div>
                    {avail && !isEditing && (
                      <div
                        className="mt-1 text-sm"
                        style={{ color: "var(--accent)" }}
                      >
                        {avail.startTime} – {avail.endTime}
                      </div>
                    )}
                    {!avail && !isEditing && (
                      <div
                        className="mt-1 text-xs"
                        style={{ color: "var(--fg-muted, #9ca3af)" }}
                      >
                        Not available
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="ml-4 flex gap-2 items-center flex-wrap">
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="rounded border px-2 py-1 text-sm"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--bg-secondary)",
                          color: "var(--fg)",
                        }}
                      />
                      <span className="text-xs muted">to</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="rounded border px-2 py-1 text-sm"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--bg-secondary)",
                          color: "var(--fg)",
                        }}
                      />
                      <button
                        onClick={handleSave}
                        disabled={setAvailability.isPending || !startTime || !endTime}
                        className="btn btn-primary btn-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingDay(null)}
                        className="btn btn-sm"
                        style={{
                          background: "var(--bg-secondary)",
                          color: "var(--fg)",
                          borderColor: "var(--border)",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="ml-4 flex gap-2">
                      <button
                        onClick={() => handleEditDay(idx)}
                        className="btn btn-sm"
                        style={{
                          background: avail ? "var(--bg-secondary)" : "var(--accent)",
                          color: avail ? "var(--fg)" : "#fff",
                          borderColor: "var(--border)",
                        }}
                      >
                        {avail ? "Edit" : "Add"}
                      </button>
                      {avail && (
                        <button
                          onClick={() => handleRemove(idx)}
                          disabled={removeAvailability.isPending}
                          className="btn btn-sm"
                          style={{
                            background: "var(--bg-secondary)",
                            color: "#ef4444",
                            borderColor: "var(--border)",
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
