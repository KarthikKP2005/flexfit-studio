"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useParams } from "next/navigation";
import Link from "next/link";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AdminStaffProfilePage() {
  const params = useParams();
  const id = parseInt(params.id as string);

  // Fetch staff list just to get this specific user's details
  // (In a real app we'd have a getProfile endpoint for staff, but this works for MVP)
  const { data: staffList } = trpc.adminStaff.list.useQuery();
  const user = staffList?.find(u => u.id === id);

  const { data: availability, isLoading, refetch } = trpc.adminStaff.getAvailability.useQuery(
    { trainerId: id },
    { enabled: user?.role === "trainer" }
  );

  const [slots, setSlots] = useState<{ dayOfWeek: number; startTime: string; endTime: string }[]>([]);

  useEffect(() => {
    if (availability) {
      setSlots(availability.map(a => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })));
    }
  }, [availability]);

  const saveMutation = trpc.adminStaff.setAvailability.useMutation({
    onSuccess: () => {
      refetch();
      alert("Availability saved successfully!");
    }
  });

  const handleAddSlot = (dayOfWeek: number) => {
    setSlots([...slots, { dayOfWeek, startTime: "09:00", endTime: "17:00" }]);
  };

  const handleRemoveSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  const handleUpdateSlot = (index: number, field: 'startTime' | 'endTime', value: string) => {
    const newSlots = [...slots];
    newSlots[index][field] = value;
    setSlots(newSlots);
  };

  if (!user && staffList) return <p className="muted">Staff member not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user?.name}</h1>
          <p className="muted text-sm capitalize">{user?.role} • {user?.email}</p>
        </div>
        <Link href="/admin/staff" className="btn btn-outline btn-sm">
          Back to Staff
        </Link>
      </div>

      {user?.role === "trainer" && (
        <div className="panel p-5 space-y-5">
          <div>
            <h2 className="font-medium text-lg">Trainer Availability Overrides</h2>
            <p className="text-sm muted">Manage when this trainer is available. This overrides their normal schedule if they call in sick or need time off.</p>
          </div>

          {isLoading ? (
            <p className="muted text-sm">Loading schedule...</p>
          ) : (
            <div className="space-y-6">
              {DAYS.map((dayName, dayIndex) => {
                const daySlots = slots.filter(s => s.dayOfWeek === dayIndex);
                return (
                  <div key={dayIndex} className="space-y-2 pb-4 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium w-32">{dayName}</div>
                      {daySlots.length === 0 && (
                        <div className="text-sm muted flex-1 text-center">Not available</div>
                      )}
                      <button 
                        onClick={() => handleAddSlot(dayIndex)}
                        className="btn-outline btn-sm text-xs"
                      >
                        + Add Slot
                      </button>
                    </div>
                    
                    {daySlots.map((slot, i) => {
                      // find the absolute index in the main array
                      const absoluteIndex = slots.findIndex(s => s === slot);
                      return (
                        <div key={absoluteIndex} className="flex items-center justify-center gap-2">
                          <input 
                            type="time" 
                            className="input text-sm"
                            value={slot.startTime}
                            onChange={(e) => handleUpdateSlot(absoluteIndex, 'startTime', e.target.value)}
                          />
                          <span className="muted">to</span>
                          <input 
                            type="time" 
                            className="input text-sm"
                            value={slot.endTime}
                            onChange={(e) => handleUpdateSlot(absoluteIndex, 'endTime', e.target.value)}
                          />
                          <button 
                            onClick={() => handleRemoveSlot(absoluteIndex)}
                            className="text-red-500 hover:bg-red-50 p-2 rounded"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                );
              })}

              <div className="flex justify-end pt-2">
                <button 
                  onClick={() => saveMutation.mutate({ trainerId: id, slots })}
                  className="btn btn-primary"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "Saving..." : "Save Availability"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {user?.role === "admin" && (
        <div className="panel p-5">
          <p className="muted">Admins do not have a schedule to override.</p>
        </div>
      )}
    </div>
  );
}
