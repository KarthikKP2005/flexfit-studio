"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/format";

export default function AdminPlansPage() {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [classCredits, setClassCredits] = useState(0);

  const { data: plans, isLoading } = trpc.plans.list.useQuery({ includeInactive: true });

  const createPlan = trpc.plans.create.useMutation({
    onSuccess: () => {
      utils.plans.list.invalidate();
      setName("");
      setDescription("");
      setPriceCents(0);
      setDurationDays(30);
      setClassCredits(0);
    },
  });

  const setActive = trpc.plans.setActive.useMutation({
    onSuccess: () => utils.plans.list.invalidate(),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membership Plans</h1>
        <p className="muted mt-1 text-sm">Manage subscription plans and pricing.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <form
          className="panel p-5 space-y-4 h-fit"
          onSubmit={(e) => {
            e.preventDefault();
            createPlan.mutate({
              name,
              description: description || undefined,
              priceCents,
              durationDays,
              classCredits,
            });
          }}
        >
          <h2 className="font-medium mb-2">Create New Plan</h2>

          <div className="space-y-1.5">
            <label className="text-sm muted">Plan Name</label>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Unlimited Monthly"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm muted">Description</label>
            <textarea
              className="input w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm muted">Price (Cents)</label>
              <input
                type="number"
                min="0"
                className="input w-full"
                value={priceCents}
                onChange={(e) => setPriceCents(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm muted">Duration (Days)</label>
              <input
                type="number"
                min="1"
                className="input w-full"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm muted">Class Credits</label>
            <input
              type="number"
              min="0"
              className="input w-full"
              value={classCredits}
              onChange={(e) => setClassCredits(Number(e.target.value))}
              placeholder="Use 999 for unlimited"
              required
            />
            <p className="text-xs muted mt-1">Set to 999 for unlimited credits.</p>
          </div>

          {createPlan.error && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              {createPlan.error.message}
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={createPlan.isPending}
          >
            {createPlan.isPending ? "Creating..." : "Create Plan"}
          </button>
        </form>

        <div className="space-y-4">
          <h2 className="font-medium">Existing Plans</h2>
          {isLoading ? (
            <p className="muted text-sm">Loading plans...</p>
          ) : (
            <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
              {plans?.map((plan) => (
                <div key={plan.id} className="p-4 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{plan.name}</div>
                    <div className="muted text-xs mt-1">
                      {formatMoney(plan.priceCents)} • {plan.durationDays} Days • {plan.classCredits >= 999 ? 'Unlimited' : plan.classCredits} Credits
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm ${plan.active ? "muted" : "btn-primary"}`}
                    onClick={() => setActive.mutate({ id: plan.id, active: !plan.active })}
                    disabled={setActive.isPending}
                  >
                    {plan.active ? "Archive" : "Activate"}
                  </button>
                </div>
              ))}
              {plans?.length === 0 && (
                <p className="muted p-4 text-sm">No plans found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
