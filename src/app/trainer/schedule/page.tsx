"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";
import { RequireRole } from "@/components/require-role";

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
    <div className="p-4 sm:p-5 text-sm transition-colors hover:bg-[#1a1e28]">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowRoster(!showRoster)}>
        <div>
          <div className="font-semibold text-lg flex items-center gap-3">
            {className}
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded tracking-wide ${showRoster ? 'bg-gray-700 text-gray-300' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {showRoster ? "Hide Roster" : "View Roster"}
            </span>
          </div>
          <div className="muted mt-1">
            {formatDateTime(startsAt)} · {room} · {durationMin} min
          </div>
          {!rosterLoading && !corpRosterLoading && (
            <div className="flex gap-3 mt-3">
              <span className="flex items-center gap-1.5 px-2 py-1 bg-[#12141a] rounded text-xs">
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                {bookedCount} booked
              </span>
              <span className="flex items-center gap-1.5 px-2 py-1 bg-[#12141a] rounded text-xs">
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {checkins} checked in
              </span>
            </div>
          )}
          {cancelled && (
            <div className="mt-2 inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
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
 * Wrapped in `RequireRole` (see AUTH-004 in known-issues.md), which
 * replaces this page's own previous inline role check — that check ran
 * before `auth.me` itself settled, so a real trainer also saw a false
 * "Access denied" flash on every load. trpc's staff-only procedures
 * remain the real security boundary underneath either way.
 */
export default function TrainerSchedulePage() {
  return (
    <RequireRole role="trainer">
      <TrainerScheduleContent />
    </RequireRole>
  );
}

function TrainerScheduleContent() {
  const utils = trpc.useUtils();
  const { data: classes, isLoading: classesLoading } =
    trpc.trainers.upcomingClasses.useQuery();
  const { data: availability, isLoading: availLoading } =
    trpc.trainers.availability.useQuery();

  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  
  const [activeSection, setActiveSection] = useState<"upcoming" | "availability">("upcoming");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

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

  const todayClasses = classes?.filter(c => new Date(c.startsAt).toDateString() === new Date().toDateString()) || [];
  const expectedAttendees = todayClasses.reduce((acc, c) => acc + (c.capacity - c.spotsLeft), 0);
  const remainingCapacity = todayClasses.reduce((acc, c) => acc + c.spotsLeft, 0);

  return (
    <div className="space-y-8 py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trainer Dashboard</h1>
          <p className="muted mt-1 text-sm">Manage your availability and class rosters</p>
        </div>
      </div>

      {/* Top Metrics Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="panel p-5 bg-gradient-to-br from-[#171a21] to-[#12141a]">
          <p className="text-xs font-semibold uppercase tracking-wider muted mb-1">Classes Today</p>
          <p className="text-2xl font-bold">{todayClasses.length}</p>
        </div>
        <div className="panel p-5 bg-gradient-to-br from-[#171a21] to-[#12141a]">
          <p className="text-xs font-semibold uppercase tracking-wider muted mb-1">Expected Attendees</p>
          <p className="text-2xl font-bold text-green-400">{expectedAttendees}</p>
        </div>
        <div className="panel p-5 bg-gradient-to-br from-[#171a21] to-[#12141a]">
          <p className="text-xs font-semibold uppercase tracking-wider muted mb-1">Remaining Spots</p>
          <p className="text-2xl font-bold text-blue-400">{remainingCapacity}</p>
        </div>
      </div>

      <div className="border-b" style={{ borderColor: "var(--border)" }}>
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => { setActiveSection("upcoming"); setPage(1); }}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeSection === "upcoming"
                ? "border-green-500 text-green-400"
                : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            Upcoming Classes
          </button>
          <button
            onClick={() => setActiveSection("availability")}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeSection === "availability"
                ? "border-green-500 text-green-400"
                : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            Weekly Availability
          </button>
        </nav>
      </div>

      {activeSection === "upcoming" && (
        <section className="space-y-4">
          {classes && classes.length > 0 ? (
            <>
              <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
                {classes.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map((cls) => (
                  <ClassCard key={cls.id} classId={cls.id} className={cls.name} startsAt={cls.startsAt} room={cls.room} durationMin={cls.durationMin} cancelled={cls.cancelled} />
                ))}
              </div>
              
              {classes.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between panel p-4">
                  <p className="text-sm muted">
                    Showing {((page - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(page * ITEMS_PER_PAGE, classes.length)} of {classes.length}
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn btn-sm"
                    >
                      Previous
                    </button>
                    <button 
                      onClick={() => setPage(p => p + 1)}
                      disabled={page * ITEMS_PER_PAGE >= classes.length}
                      className="btn btn-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="muted text-sm">No upcoming classes.</p>
          )}
        </section>
      )}

      {activeSection === "availability" && (
        <section className="space-y-3">
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
      )}
    </div>
  );
}
