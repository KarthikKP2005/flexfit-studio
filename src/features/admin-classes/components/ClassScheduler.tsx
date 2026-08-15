"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

/**
 * Phase 3 of restructure-plan.md: moved verbatim out of
 * src/app/admin/classes/page.tsx — no JSX, styling, trpc call, or logic
 * changed, only the file location. The page itself is now route-level
 * composition only (plan.md item #54's own pattern).
 *
 * ADMIN-004 fix: `createMutation`/`cancelMutation`/`swapMutation` now
 * all surface their `.error` in a panel above the form — previously
 * none were rendered anywhere, so a rejection (e.g. `TRAINER-003`'s
 * `BAD_REQUEST` when the new trainer isn't available) looked identical
 * to "Cancel Class"/"Confirm Swap"/"Schedule Class" silently doing
 * nothing. Same pattern already used by `SCHED-001`'s fix elsewhere.
 */
export function ClassScheduler() {
  const { data: classes, isLoading, refetch } = trpc.adminClasses.list.useQuery();
  const { data: staff } = trpc.adminStaff.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [showSwapForm, setShowSwapForm] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trainerId, setTrainerId] = useState<string>("");
  const [room, setRoom] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [startsAt, setStartsAt] = useState("");
  const [durationMin, setDurationMin] = useState("60");
  const [creditCost, setCreditCost] = useState("1");
  const [swapTrainerId, setSwapTrainerId] = useState<string>("");

  // Filter State (client-side only, list filtering)
  const [filterName, setFilterName] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const trainers = staff?.filter((u) => u.role === "trainer") || [];

  const filteredClasses = classes?.filter((c) => {
    if (filterName && !c.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterDate) {
      const d = new Date(c.startsAt);
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (localDate !== filterDate) return false;
    }
    return true;
  });

  const createMutation = trpc.adminClasses.create.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setName("");
      setDescription("");
      setRoom("");
      setStartsAt("");
      refetch();
    },
  });

  const cancelMutation = trpc.adminClasses.cancel.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const swapMutation = trpc.adminClasses.swapTrainer.useMutation({
    onSuccess: () => {
      setShowSwapForm(null);
      refetch();
    },
  });

  // ADMIN-004 fix: none of these three mutations surfaced their error to
  // the admin before this — a rejected create/cancel/swap (e.g.
  // TRAINER-003's "No availability set for this day.") looked identical
  // to a silent no-op. Same "show mutation.error in a panel" pattern
  // already used on schedule/page.tsx and trainer/schedule/page.tsx.
  const actionError = createMutation.error ?? cancelMutation.error ?? swapMutation.error;

  if (isLoading) return <p className="muted">Loading schedule...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Class Schedule</h1>
        <div className="flex gap-2">
          <Link href="/admin" className="btn btn-outline btn-sm">
            Back to Dashboard
          </Link>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-sm">
            {showForm ? "Cancel" : "Create Class"}
          </button>
        </div>
      </div>

      {actionError && (
        <p className="panel p-3 text-sm" style={{ color: "#f87171" }}>
          {actionError.message}
        </p>
      )}

      {/* CREATE CLASS FORM */}
      {showForm && (
        <div className="panel p-4 space-y-4">
          <h2 className="font-medium">Schedule a new Class</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name,
                description,
                trainerId: parseInt(trainerId),
                room,
                capacity: parseInt(capacity),
                startsAt: new Date(startsAt).toISOString(),
                durationMin: parseInt(durationMin),
                creditCost: parseInt(creditCost),
              });
            }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start"
          >
            <div>
              <label className="block text-sm muted mb-1">Class Name</label>
              <input
                className="input w-full"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Yoga"
                required
              />
            </div>
            <div>
              <label className="block text-sm muted mb-1">Trainer</label>
              <select
                className="input w-full"
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
                required
              >
                <option value="" disabled>Select Trainer</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm muted mb-1">Room</label>
              <input
                className="input w-full"
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Studio A"
                required
              />
            </div>
            <div>
              <label className="block text-sm muted mb-1 flex items-center gap-2">
                Date & Time
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 muted normal-case">
                  click date, then time
                </span>
              </label>
              <input
                className="input w-full"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-sm muted mb-1">Capacity</label>
                <input
                  className="input w-full"
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm muted mb-1">Duration (min)</label>
                <input
                  className="input w-full"
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm muted mb-1">Credit Cost</label>
                <input
                  className="input w-full"
                  type="number"
                  value={creditCost}
                  onChange={(e) => setCreditCost(e.target.value)}
                  min="0"
                  required
                />
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createMutation.isPending || !trainerId}
              >
                {createMutation.isPending ? "Creating..." : "Schedule Class"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CLASS LIST FILTERS */}
      <div className="panel p-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm muted mb-1">Filter by Name</label>
          <input
            className="input w-full"
            type="text"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="e.g. Yoga"
          />
        </div>
        <div>
          <label className="block text-sm muted mb-1">Filter by Date</label>
          <input
            className="input w-full"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>
      </div>

      {/* CLASS LIST */}
      <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
        {filteredClasses?.map((c) => (
          <div key={c.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-lg flex items-center gap-2">
                  {c.name}
                  {c.cancelled && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded uppercase">Cancelled</span>}
                </div>
                <div className="text-sm muted">
                  {formatDateTime(c.startsAt)} • {c.durationMin} mins • {c.room}
                </div>
              </div>
              <div className="flex gap-2">
                {!c.cancelled && (
                  <>
                    <button
                      onClick={() => setShowSwapForm(showSwapForm === c.id ? null : c.id)}
                      className="btn-outline btn-sm"
                    >
                      Swap Trainer
                    </button>
                    <button
                      onClick={() => cancelMutation.mutate({ id: c.id })}
                      className="btn-outline btn-sm text-red-600"
                      disabled={cancelMutation.isPending}
                    >
                      Cancel Class
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="text-sm flex gap-4">
              <span className="font-medium">Trainer: {c.trainerName || "Unassigned"}</span>
              <span className="muted">Capacity: {c.capacity}</span>
              <span className="muted">Cost: {c.creditCost} credits</span>
            </div>

            {/* SWAP TRAINER FORM */}
            {showSwapForm === c.id && (
              <div className="mt-3 p-3 bg-gray-50 rounded border" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-panel)" }}>
                <div className="text-sm font-medium mb-2">Assign new trainer for this class:</div>
                <div className="flex gap-2">
                  <select
                    className="input text-sm"
                    value={swapTrainerId}
                    onChange={(e) => setSwapTrainerId(e.target.value)}
                  >
                    <option value="" disabled>Select Trainer...</option>
                    {trainers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if(swapTrainerId) swapMutation.mutate({ classId: c.id, newTrainerId: parseInt(swapTrainerId) });
                    }}
                    className="btn btn-sm btn-primary"
                    disabled={!swapTrainerId || swapMutation.isPending}
                  >
                    Confirm Swap
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
