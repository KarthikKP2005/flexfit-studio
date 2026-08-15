"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

/**
 * Phase 3 of restructure-plan.md: moved verbatim out of
 * src/app/admin/plans/page.tsx — no JSX, styling, trpc call, or logic
 * changed, only the file location. The page itself is now route-level
 * composition only (plan.md item #54's own pattern).
 *
 * Membership plan list + create-plan form, archive/reactivate toggle.
 */
export function PlanManager() {
  const { data: plans, isLoading, refetch } = trpc.adminPlans.list.useQuery();
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("30");
  const [credits, setCredits] = useState("10");

  const createMutation = trpc.adminPlans.create.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setName("");
      setDescription("");
      setPrice("");
      setDuration("30");
      setCredits("10");
      refetch();
    },
  });

  const toggleMutation = trpc.adminPlans.toggleActive.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) return <p className="muted">Loading plans...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Membership Plans</h1>
        <div className="flex gap-2">
          <Link href="/admin" className="btn btn-outline btn-sm">
            Back to Dashboard
          </Link>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-sm">
            {showForm ? "Cancel" : "Create Plan"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="panel p-4 space-y-4">
          <h2 className="font-medium">Create a New Membership Plan</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name,
                description,
                priceCents: Math.round(parseFloat(price) * 100),
                durationDays: parseInt(duration),
                classCredits: parseInt(credits),
              });
            }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-start"
          >
            <div className="lg:col-span-2">
              <label className="block text-sm muted mb-1">Plan Name</label>
              <input
                className="input w-full"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 10 Classes / Month"
                required
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-sm muted mb-1">Description</label>
              <input
                className="input w-full"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Access to 10 classes a month"
              />
            </div>
            <div>
              <label className="block text-sm muted mb-1">Price (₹)</label>
              <input
                className="input w-full"
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm muted mb-1">Duration (Days)</label>
              <input
                className="input w-full"
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                min="1"
                required
              />
            </div>
            <div>
              <label className="block text-sm muted mb-1">Class Credits</label>
              <input
                className="input w-full"
                type="number"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                min="0"
                required
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Save Plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan) => (
          <div key={plan.id} className="panel p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg leading-tight">{plan.name}</h3>
                <span className={`text-xs px-2 py-1 rounded tracking-wider uppercase font-semibold ${
                  plan.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {plan.active ? "Active" : "Archived"}
                </span>
              </div>
              <div className="text-2xl font-bold mb-2">
                {formatMoney(plan.priceCents)}
              </div>
              {plan.description && <p className="text-sm muted mb-4">{plan.description}</p>}
            </div>

            <div className="space-y-4">
              <div className="text-sm border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex justify-between py-1">
                  <span className="muted">Credits:</span>
                  <span className="font-medium">{plan.classCredits > 900 ? 'Unlimited' : plan.classCredits}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="muted">Duration:</span>
                  <span className="font-medium">{plan.durationDays} days</span>
                </div>
              </div>
              <button
                onClick={() => toggleMutation.mutate({ id: plan.id, active: !plan.active })}
                className={`btn btn-sm w-full ${plan.active ? 'btn-outline text-red-600' : 'btn-primary'}`}
                disabled={toggleMutation.isPending}
              >
                {plan.active ? "Archive Plan" : "Reactivate Plan"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
