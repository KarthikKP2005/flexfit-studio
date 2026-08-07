"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

function ClassCard({ classId, className, startsAt, room, durationMin, cancelled }: { classId: number; className: string; startsAt: string; room: string; durationMin: number; cancelled: boolean }) {
  const [showRoster, setShowRoster] = useState(false);
  const { data: roster, isLoading: rosterLoading } = trpc.trainers.rosterFor.useQuery({ classId }, { enabled: showRoster });
  const { data: checkinData, isLoading: checkinLoading } = trpc.bookings.checkinCountFor.useQuery({ classId });

  // Note: we can't calculate exact booked count until we load the roster, 
  // or we could add a bookedCount to upcomingClasses.
  // For now, we'll fetch roster on demand to show it.
  const checkins = checkinData?.count || 0;

  return (
    <div className="p-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-lg">{className}</div>
          <div className="muted mt-1 text-sm">
            {formatDateTime(startsAt)} · {room} · {durationMin} min
          </div>
          {!checkinLoading && (
            <div className="muted mt-2 text-xs font-semibold" style={{ color: "var(--accent)" }}>
              ✓ {checkins} checked in
            </div>
          )}
          {cancelled && (
            <div className="mt-2 inline-block rounded px-2 py-1 text-xs font-semibold" style={{ background: "#7f1d1d", color: "#fca5a5" }}>
              Cancelled
            </div>
          )}
        </div>
        <button 
          className="btn btn-sm" 
          onClick={() => setShowRoster(!showRoster)}
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          {showRoster ? "Hide Roster" : "View Roster"}
        </button>
      </div>

      {showRoster && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          {rosterLoading ? (
            <p className="muted text-xs">Loading roster...</p>
          ) : roster && roster.length > 0 ? (
            <ul className="space-y-2">
              {roster.map((r, i) => (
                <li key={i} className="flex justify-between items-center text-xs">
                  <span className={r.status === "cancelled" ? "line-through opacity-50" : ""}>
                    {r.memberName}
                    {r.type === "corporate" && <span className="ml-2 rounded bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">Corporate</span>}
                  </span>
                  <span className="muted capitalize">{r.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted text-xs">No one has booked this class yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainerSchedulePage() {
  const { data: user } = trpc.auth.me.useQuery();
  const { data: classes, isLoading: classesLoading } =
    trpc.trainers.upcomingClasses.useQuery(undefined, {
      enabled: user?.role === "trainer",
    });

  if (user?.role !== "trainer") {
    return <p className="muted">Access denied. Trainers only.</p>;
  }

  if (classesLoading) return <p className="muted">Loading schedule...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trainer Schedule</h1>
        <p className="muted mt-1 text-sm">View your upcoming classes and attendee rosters</p>
      </div>

      <section className="space-y-4">
        {classes && classes.length > 0 ? (
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {classes.map((cls) => (
              <ClassCard key={cls.id} classId={cls.id} className={cls.name} startsAt={cls.startsAt} room={cls.room} durationMin={cls.durationMin} cancelled={cls.cancelled} />
            ))}
          </div>
        ) : (
          <div className="panel p-8 text-center text-sm muted">
            You have no upcoming classes scheduled.
          </div>
        )}
      </section>
    </div>
  );
}
