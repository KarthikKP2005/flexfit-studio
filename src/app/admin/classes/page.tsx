"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

export default function AdminClassesPage() {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [room, setRoom] = useState("Studio A");
  const [capacity, setCapacity] = useState(20);
  const [startsAt, setStartsAt] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [creditCost, setCreditCost] = useState(1);
  const [trainerId, setTrainerId] = useState("");

  const { data: users, isLoading: usersLoading } = trpc.members.search.useQuery({
    limit: 500,
  });

  const { data: classesList, isLoading: classesLoading } = trpc.classes.list.useQuery({
    includeCancelled: false,
  });

  const trainers = users?.filter((u) => u.role === "trainer") || [];

  const createClass = trpc.classes.create.useMutation({
    onSuccess: () => {
      utils.classes.list.invalidate();
      setName("");
      setDescription("");
      setStartsAt("");
      setTrainerId("");
    },
  });

  const checkAvailability = trpc.trainers.checkAvailability.useQuery(
    {
      trainerId: Number(trainerId),
      startsAt,
      durationMin,
    },
    {
      enabled: !!trainerId && !!startsAt && !!durationMin,
    }
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class Management</h1>
        <p className="muted mt-1 text-sm">Create and schedule classes.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <form
          className="panel p-5 space-y-4 h-fit"
          onSubmit={(e) => {
            e.preventDefault();
            createClass.mutate({
              name,
              description: description || undefined,
              room,
              capacity,
              startsAt: new Date(startsAt).toISOString(),
              durationMin,
              creditCost,
              trainerId: trainerId ? Number(trainerId) : undefined,
            });
          }}
        >
          <h2 className="font-medium mb-2">Create New Class</h2>

          <div className="space-y-1.5">
            <label className="text-sm muted">Class Name</label>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm muted">Description</label>
            <textarea
              className="input w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm muted">Room</label>
              <select className="input w-full" value={room} onChange={(e) => setRoom(e.target.value)}>
                <option value="Studio A">Studio A</option>
                <option value="Studio B">Studio B</option>
                <option value="Spin Room">Spin Room</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm muted">Capacity</label>
              <input
                type="number"
                min="1"
                className="input w-full"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm muted">Start Time (Local)</label>
              <input
                type="datetime-local"
                className="input w-full"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm muted">Duration (mins)</label>
              <input
                type="number"
                min="1"
                className="input w-full"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm muted">Trainer</label>
              <select
                className="input w-full"
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
              >
                <option value="">(No trainer)</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm muted">Credit Cost</label>
              <input
                type="number"
                min="0"
                className="input w-full"
                value={creditCost}
                onChange={(e) => setCreditCost(Number(e.target.value))}
                required
              />
            </div>
          </div>

          {checkAvailability.data?.available === false && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              Warning: {checkAvailability.data.reason}
            </p>
          )}

          {createClass.error && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              {createClass.error.message}
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={createClass.isPending || (checkAvailability.data?.available === false)}
          >
            {createClass.isPending ? "Creating..." : "Create Class"}
          </button>
        </form>

        <div className="space-y-4">
          <h2 className="font-medium">Upcoming Classes</h2>
          {classesLoading ? (
            <p className="muted text-sm">Loading classes...</p>
          ) : (
            <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
              {classesList?.map((c) => (
                <div key={c.id} className="p-4 text-sm">
                  <div className="font-medium">{c.name}</div>
                  <div className="flex justify-between mt-1 muted text-xs">
                    <span>{formatDateTime(c.startsAt)} ({c.durationMin}m)</span>
                    <span>{c.room}</span>
                  </div>
                  <div className="flex justify-between mt-1 muted text-xs">
                    <span>Trainer: {c.trainerName || "None"}</span>
                    <span>{c.capacity - c.spotsLeft} / {c.capacity} booked</span>
                  </div>
                </div>
              ))}
              {classesList?.length === 0 && (
                <p className="muted p-4 text-sm">No upcoming classes found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
