"use client";

import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

export default function SchedulePage() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  // Fetch profile to see if they belong to a company, only if logged in
  const { data: profile } = trpc.members.profile.useQuery(undefined, {
    enabled: !!user && user.role === "member",
    retry: false,
  });

  const { data: classes, isLoading } = trpc.classes.list.useQuery({
    from: new Date().toISOString(),
  });

  const book = trpc.bookings.book.useMutation({
    onSuccess: async () => {
      await utils.classes.list.invalidate();
      await utils.bookings.mine.invalidate();
    },
  });

  const bookCorp = trpc.corporateBookings.book.useMutation({
    onSuccess: async () => {
      await utils.classes.list.invalidate();
      await utils.corporateBookings.mine.invalidate();
    },
  });

  if (isLoading) return <p className="muted">Loading schedule...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class schedule</h1>
        <p className="muted mt-1 text-sm">
          {classes?.length ?? 0} upcoming classes
        </p>
      </div>

      {book.error && (
        <p className="panel p-3 text-sm" style={{ color: "#f87171" }}>
          {book.error.message}
        </p>
      )}

      {bookCorp.error && (
        <p className="panel p-3 text-sm" style={{ color: "#f87171" }}>
          {bookCorp.error.message}
        </p>
      )}

      <div className="space-y-2">
        {classes?.map((c) => (
          <div
            key={c.id}
            className="panel flex items-center gap-4 p-4 flex-wrap sm:flex-nowrap"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{c.name}</h2>
                {c.full && (
                  <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "#3a2a1a", color: "#fbbf24" }}>
                    Waitlist
                  </span>
                )}
              </div>
              <p className="muted mt-0.5 text-sm">
                {formatDateTime(c.startsAt)} &middot; {c.room} &middot;{" "}
                {c.trainerName ?? "Unassigned"} &middot; {c.durationMin} min
              </p>
            </div>

            <div className="text-right text-sm muted w-full sm:w-auto flex justify-between sm:block">
              <div>
                {c.spotsLeft} / {c.capacity} left
              </div>
              <div>
                {c.creditCost} credit{c.creditCost === 1 ? "" : "s"}
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <button
                className="btn btn-primary flex-1 sm:flex-none"
                disabled={!user || book.isPending || bookCorp.isPending || user.role !== "member"}
                onClick={() => book.mutate({ classId: c.id })}
              >
                {c.full ? "Join waitlist" : "Book"}
              </button>

              {profile?.company && (
                <button
                  className="btn flex-1 sm:flex-none"
                  disabled={book.isPending || bookCorp.isPending}
                  onClick={() => bookCorp.mutate({ classId: c.id })}
                  style={{
                    background: "var(--bg-secondary, #1a1d25)",
                    borderColor: "var(--border)",
                  }}
                >
                  {c.full ? "Waitlist (Corp)" : "Book (Corp)"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!user && (
        <p className="muted text-sm">Sign in to book a class.</p>
      )}
      {user && user.role !== "member" && (
        <p className="muted text-sm">Only members can book classes.</p>
      )}
    </div>
  );
}
