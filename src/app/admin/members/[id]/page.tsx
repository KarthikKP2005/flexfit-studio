"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

export default function AdminMemberProfilePage() {
  const params = useParams();
  const id = parseInt(params.id as string);

  const { data: profile, isLoading, refetch } = trpc.adminMembers.getProfile.useQuery({ id });
  
  const [adjustmentAmount, setAdjustmentAmount] = useState("1");
  const [adjustingPlanId, setAdjustingPlanId] = useState<number | null>(null);

  const adjustMutation = trpc.adminMembers.adjustCredits.useMutation({
    onSuccess: () => {
      setAdjustingPlanId(null);
      refetch();
    },
  });

  const toggleMutation = trpc.adminMembers.toggleActive.useMutation({
    onSuccess: () => {
      refetch();
    }
  });

  if (isLoading) return <p className="muted">Loading profile...</p>;
  if (!profile) return <p className="muted">Member not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
          <p className="muted text-sm">{profile.email} {profile.phone && `• ${profile.phone}`}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/members" className="btn btn-outline btn-sm">
            Back to Members
          </Link>
          <button 
            onClick={() => toggleMutation.mutate({ id: profile.id, active: !profile.active })}
            className={`btn btn-sm ${profile.active ? 'btn-outline text-red-600' : 'btn-primary'}`}
            disabled={toggleMutation.isPending}
          >
            {profile.active ? "Deactivate Account" : "Reactivate Account"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* MEMBERSHIPS PANEL */}
        <div className="space-y-3">
          <h2 className="font-medium">Active & Past Memberships</h2>
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {profile.memberships.map((plan) => (
              <div key={plan.id} className="p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{plan.planName}</div>
                    <div className="text-xs muted">
                      {plan.startDate} to {plan.endDate}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded uppercase tracking-wider ${
                    plan.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {plan.status}
                  </span>
                </div>
                
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm">Credits: <span className="font-semibold">{plan.creditsRemaining > 900 ? 'Unlimited' : plan.creditsRemaining}</span></div>
                  {plan.status === 'active' && plan.creditsRemaining < 900 && (
                    <button 
                      onClick={() => setAdjustingPlanId(adjustingPlanId === plan.id ? null : plan.id)}
                      className="btn-outline btn-sm"
                    >
                      Adjust Credits
                    </button>
                  )}
                </div>

                {adjustingPlanId === plan.id && (
                  <div className="mt-2 flex gap-2 items-center p-2 bg-gray-50 rounded">
                    <input 
                      type="number" 
                      className="input w-24 text-sm" 
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder="+/-"
                    />
                    <button 
                      className="btn btn-primary btn-sm"
                      disabled={adjustMutation.isPending}
                      onClick={() => adjustMutation.mutate({ membershipId: plan.id, adjustment: parseInt(adjustmentAmount) })}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            ))}
            {profile.memberships.length === 0 && (
              <div className="p-4 muted text-sm text-center">No memberships found.</div>
            )}
          </div>
        </div>

        {/* BOOKINGS PANEL */}
        <div className="space-y-3">
          <h2 className="font-medium">Booking History</h2>
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {profile.bookings.map((booking) => (
              <div key={booking.id} className="p-3 text-sm flex justify-between items-center">
                <div>
                  <div className="font-medium">{booking.className}</div>
                  <div className="text-xs muted">{formatDateTime(booking.startsAt)}</div>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    booking.status === 'attended' ? 'bg-green-100 text-green-800' : 
                    booking.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {booking.status}
                  </span>
                  <div className="text-xs muted mt-1">Cost: {booking.creditsUsed} cr</div>
                </div>
              </div>
            ))}
            {profile.bookings.length === 0 && (
              <div className="p-4 muted text-sm text-center">No bookings found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
