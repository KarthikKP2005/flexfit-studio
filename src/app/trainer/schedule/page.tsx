"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

/** 
 * Booked/checked-in counts for one class card, with a toggleable roster view to mark attendance. 
 * WHY IT'S IMPLEMENTED: Trainer Roster & Attendance UI with Waitlist admitting and Privacy.
 */
function ClassCard({ classId, className, startsAt, room, durationMin, cancelled }: { classId: number; className: string; startsAt: string; room: string; durationMin: number; cancelled: boolean }) {
  const [showRoster, setShowRoster] = useState(false);
  const [activeTab, setActiveTab] = useState<"booked" | "waitlist">("booked");
  const utils = trpc.useUtils();
  
  const { data: roster, isLoading: rosterLoading } = trpc.bookings.rosterFor.useQuery({ classId });
  const { data: corpRoster, isLoading: corpRosterLoading } = trpc.corporateBookings.rosterFor.useQuery({ classId });

  const markAttended = trpc.bookings.markAttended.useMutation({
    onSuccess: () => utils.bookings.rosterFor.invalidate({ classId })
  });

  const markCorpAttended = trpc.corporateBookings.markAttended.useMutation({
    onSuccess: () => utils.corporateBookings.rosterFor.invalidate({ classId })
  });

  const admitFromWaitlist = trpc.bookings.admitFromWaitlist.useMutation({
    onSuccess: () => utils.bookings.rosterFor.invalidate({ classId })
  });

  const admitCorpFromWaitlist = trpc.corporateBookings.admitFromWaitlist.useMutation({
    onSuccess: () => utils.corporateBookings.rosterFor.invalidate({ classId })
  });

  const activeRoster = roster?.filter((r) => r.status === "booked" || r.status === "attended") || [];
  const activeCorpRoster = corpRoster?.filter((r) => r.status === "booked" || r.status === "attended") || [];

  const waitlistRoster = roster?.filter((r) => r.status === "waitlisted") || [];
  const waitlistCorpRoster = corpRoster?.filter((r) => r.status === "waitlisted") || [];

  const bookedCount = activeRoster.length + activeCorpRoster.length;
  const checkins = activeRoster.filter(r => r.status === "attended").length + activeCorpRoster.filter(r => r.status === "attended").length;

  return (
    <div className="p-3 text-sm">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowRoster(!showRoster)}>
        <div>
          <div className="font-medium flex items-center gap-2">
            {className}
            <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{showRoster ? "Hide Roster" : "View Roster"}</span>
          </div>
          <div className="muted mt-1 text-xs">
            {formatDateTime(startsAt)} · {room} · {durationMin} min
          </div>
          {!rosterLoading && !corpRosterLoading && (
            <div className="muted mt-2 text-xs">
              📊 {bookedCount} booked · ✓ {checkins} checked in
            </div>
          )}
          {cancelled && (
            <div className="mt-1 rounded px-2 py-1 text-xs" style={{ background: "#7f1d1d", color: "#fca5a5" }}>
              Cancelled
            </div>
          )}
        </div>
      </div>

      {showRoster && !cancelled && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-4 mb-3 border-b pb-2">
            <button 
              className={`text-xs font-semibold uppercase tracking-wider ${activeTab === 'booked' ? 'text-primary' : 'muted'}`}
              onClick={() => setActiveTab('booked')}
            >
              Booked ({bookedCount})
            </button>
            <button 
              className={`text-xs font-semibold uppercase tracking-wider ${activeTab === 'waitlist' ? 'text-primary' : 'muted'}`}
              onClick={() => setActiveTab('waitlist')}
            >
              Waitlist ({waitlistRoster.length + waitlistCorpRoster.length})
            </button>
          </div>
          
          <div className="space-y-2">
            {activeTab === "booked" && (
              <>
                {activeRoster.map(member => (
                  <div key={`personal-${member.bookingId}`} className="flex items-center justify-between py-1">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {member.memberName}
                        {member.isFirstClass && <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">First-Timer!</span>}
                      </div>
                    </div>
                    <div>
                      {member.status === "attended" ? (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">Attended</span>
                      ) : (
                        <button 
                          onClick={() => markAttended.mutate({ bookingId: member.bookingId, source: "trainer" })}
                          className="btn btn-sm btn-primary text-xs px-2 py-1"
                          disabled={markAttended.isPending}
                        >
                          Check In
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {activeCorpRoster.map(member => (
                  <div key={`corp-${member.bookingId}`} className="flex items-center justify-between py-1">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {member.memberName} <span className="text-xs muted font-normal">({member.companyName})</span>
                        {member.isFirstClass && <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">First-Timer!</span>}
                      </div>
                    </div>
                    <div>
                      {member.status === "attended" ? (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">Attended</span>
                      ) : (
                        <button 
                          onClick={() => markCorpAttended.mutate({ bookingId: member.bookingId, source: "trainer" })}
                          className="btn btn-sm btn-primary text-xs px-2 py-1"
                          disabled={markCorpAttended.isPending}
                        >
                          Check In
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {activeRoster.length === 0 && activeCorpRoster.length === 0 && (
                  <div className="text-xs muted text-center py-2">No one is currently booked for this class.</div>
                )}
              </>
            )}

            {activeTab === "waitlist" && (
              <>
                {waitlistRoster.map(member => (
                  <div key={`personal-${member.bookingId}`} className="flex items-center justify-between py-1">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {member.memberName}
                      </div>
                      <div className="text-xs muted">Waitlisted: {formatDateTime(member.bookedAt)}</div>
                    </div>
                    <div>
                      <button 
                        onClick={() => admitFromWaitlist.mutate({ bookingId: member.bookingId })}
                        className="btn btn-sm btn-outline text-xs px-2 py-1"
                        disabled={admitFromWaitlist.isPending}
                      >
                        Admit
                      </button>
                    </div>
                  </div>
                ))}

                {waitlistCorpRoster.map(member => (
                  <div key={`corp-${member.bookingId}`} className="flex items-center justify-between py-1">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {member.memberName} <span className="text-xs muted font-normal">({member.companyName})</span>
                      </div>
                      <div className="text-xs muted">Waitlisted: {formatDateTime(member.bookedAt)}</div>
                    </div>
                    <div>
                      <button 
                        onClick={() => admitCorpFromWaitlist.mutate({ bookingId: member.bookingId })}
                        className="btn btn-sm btn-outline text-xs px-2 py-1"
                        disabled={admitCorpFromWaitlist.isPending}
                      >
                        Admit
                      </button>
                    </div>
                  </div>
                ))}

                {waitlistRoster.length === 0 && waitlistCorpRoster.length === 0 && (
                  <div className="text-xs muted text-center py-2">Waitlist is empty.</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Trainer's own upcoming classes and weekly availability editor. Not
 * responsible for: editing/cancelling a trainer's own classes (no UI
 * calls classes.update/classes.cancel from here — those are admin-only
 * flows) or validating the time inputs client-side (trainers.ts's
 * setAvailability has no format/range validation either — see
 * TRAINER-001 in known-issues.md).
 *
 * Behavior note: role gating here is client-side only ("Access denied"
 * after the page has already loaded) — trpc's staff-only procedures are
 * the real security boundary underneath, this check is just UX.
 */
export default function TrainerSchedulePage() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: classes, isLoading: classesLoading } =
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
    return <p className="muted">Access denied. Trainers only.</p>;
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

  if (isLoading) return <p className="muted">Loading...</p>;

  const availabilityMap = new Map(
    availability?.map((a) => [a.dayOfWeek, a]) || [],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trainer Schedule</h1>
        <p className="muted mt-1 text-sm">Manage your availability and upcoming classes</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Upcoming Classes</h2>
        {classes && classes.length > 0 ? (
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {classes.map((cls) => (
              <ClassCard key={cls.id} classId={cls.id} className={cls.name} startsAt={cls.startsAt} room={cls.room} durationMin={cls.durationMin} cancelled={cls.cancelled} />
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No upcoming classes.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Weekly Availability</h2>
        <div className="space-y-2">
          {DAYS.map((day, idx) => {
            const avail = availabilityMap.get(idx);
            const isEditing = editingDay === idx;

            return (
              <div key={idx} className="panel p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{day}</div>
                    {avail && !isEditing && (
                      <div className="muted mt-1 text-sm">
                        {avail.startTime} - {avail.endTime}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="ml-4 flex gap-2">
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
                          background: "var(--bg-secondary)",
                          color: "var(--fg)",
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
