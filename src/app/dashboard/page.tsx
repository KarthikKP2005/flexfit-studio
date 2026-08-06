"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/format";
import { RescheduleModal } from "@/components/reschedule-modal";

export default function DashboardPage() {
  const [rescheduleModal, setRescheduleModal] = useState<{
    isOpen: boolean;
    bookingId: number;
    className: string;
    classTime: string;
    classId: number;
  }>({
    isOpen: false,
    bookingId: 0,
    className: "",
    classTime: "",
    classId: 0,
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fix #4: Profile editing state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.members.profile.useQuery(undefined, {
    retry: false,
  });
  const { data: bookings } = trpc.bookings.mine.useQuery({ includePast: false });
  const { data: rescheduleHistory } = trpc.reschedules.history.useQuery();

  // Fix #2: Also fetch corporate bookings
  const { data: corpBookings } = trpc.corporateBookings.mine.useQuery({ includePast: false });

  const cancel = trpc.bookings.cancel.useMutation({
    onSuccess: async () => {
      await utils.bookings.mine.invalidate();
      await utils.members.profile.invalidate();
      await utils.classes.list.invalidate();
    },
  });

  const cancelCorp = trpc.corporateBookings.cancel.useMutation({
    onSuccess: async () => {
      await utils.corporateBookings.mine.invalidate();
      await utils.members.profile.invalidate();
      await utils.classes.list.invalidate();
    },
  });

  // Fix #4: Profile update mutation
  const updateProfile = trpc.members.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.members.profile.invalidate();
      await utils.auth.me.invalidate();
      setEditing(false);
      setSuccessMessage("Profile updated successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  if (isLoading) return <p className="muted">Loading...</p>;
  if (!profile) return <p className="muted">Please sign in to view your bookings.</p>;

  const ms = profile.membership;

  const handleEditStart = () => {
    setEditName(profile.name);
    setEditPhone(profile.phone || "");
    setEditing(true);
  };

  const handleEditSave = () => {
    updateProfile.mutate({
      name: editName,
      phone: editPhone || null,
    });
  };

  // Combine personal + corporate bookings for display
  const allBookings = [
    ...(bookings || []).map((b) => ({ ...b, source: "personal" as const })),
    ...(corpBookings || []).map((b) => ({
      ...b,
      source: "corporate" as const,
    })),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, {profile.name.split(" ")[0]}
        </h1>
        <p className="muted mt-1 text-sm">
          {profile.classesAttended} classes attended
        </p>
      </div>

      {/* Fix #4: Profile section with edit */}
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Profile</h2>
          {!editing && (
            <button
              className="btn btn-sm text-xs"
              onClick={handleEditStart}
              style={{
                background: "var(--bg-secondary, #1a1d25)",
                borderColor: "var(--border)",
              }}
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="text-xs muted">Name</label>
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs muted">Phone</label>
              <input
                className="input"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+91 9876543210"
              />
            </div>
            {updateProfile.error && (
              <p className="text-xs" style={{ color: "#f87171" }}>
                {updateProfile.error.message}
              </p>
            )}
            <div className="flex gap-2">
              <button
                className="btn btn-primary btn-sm text-xs"
                onClick={handleEditSave}
                disabled={updateProfile.isPending || !editName}
              >
                {updateProfile.isPending ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-sm text-xs"
                onClick={() => setEditing(false)}
                style={{
                  background: "var(--bg-secondary, #1a1d25)",
                  borderColor: "var(--border)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="muted">Name</dt>
              <dd>{profile.name}</dd>
            </div>
            <div>
              <dt className="muted">Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt className="muted">Phone</dt>
              <dd>{profile.phone || "Not set"}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-medium">Membership</h2>
        {ms ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="muted">Plan</dt>
              <dd>{ms.planName}</dd>
            </div>
            <div>
              <dt className="muted">Status</dt>
              <dd>{ms.status}</dd>
            </div>
            <div>
              <dt className="muted">Valid until</dt>
              <dd>{formatDate(ms.endDate)}</dd>
            </div>
            <div>
              <dt className="muted">Credits</dt>
              <dd>{ms.creditsRemaining >= 999 ? "Unlimited" : ms.creditsRemaining}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted mt-2 text-sm">
            No active membership. Pick a plan to start booking classes.
          </p>
        )}
      </section>

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

        {allBookings.length ? (
          <div className="space-y-2">
            {allBookings.map((b) => (
              <div key={`${b.source}-${b.id}`} className="panel flex items-center gap-2 p-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{b.className}</h3>
                    <span className="muted text-xs uppercase tracking-wide">
                      {b.status}
                    </span>
                    {b.source === "corporate" && (
                      <span
                        className="rounded px-1.5 py-0.5 text-xs"
                        style={{ background: "#292524", color: "#fbbf24" }}
                      >
                        Corporate
                      </span>
                    )}
                  </div>
                  <p className="muted mt-0.5 text-sm">
                    {formatDateTime(b.startsAt)} &middot; {b.room}
                    {"companyName" in b && b.companyName ? ` · ${b.companyName}` : ""}
                  </p>
                </div>

                {(b.status === "booked" || b.status === "waitlisted") && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    {b.status === "booked" && b.source === "personal" && (
                      <button
                        className="btn text-sm flex-1 sm:flex-none"
                        disabled={cancel.isPending}
                        onClick={() => {
                          setRescheduleModal({
                            isOpen: true,
                            bookingId: b.id,
                            className: b.className,
                            classTime: b.startsAt,
                            classId: b.classId,
                          });
                        }}
                      >
                        Reschedule
                      </button>
                    )}
                    <button
                      className="btn text-sm flex-1 sm:flex-none"
                      disabled={cancel.isPending || cancelCorp.isPending}
                      onClick={() => {
                        if (b.source === "corporate") {
                          cancelCorp.mutate({ bookingId: b.id });
                        } else {
                          cancel.mutate({ bookingId: b.id });
                        }
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No upcoming bookings.</p>
        )}
      </section>

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
        fromClassName={rescheduleModal.className}
        fromClassTime={rescheduleModal.classTime}
        fromClassId={rescheduleModal.classId}
        onSuccess={() => {
          setSuccessMessage("Class rescheduled successfully!");
          setTimeout(() => setSuccessMessage(null), 3000);
        }}
      />
    </div>
  );
}
