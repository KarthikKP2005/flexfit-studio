"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/format";

/**
 * Membership plan catalog and self-serve subscribe button. Not
 * responsible for: pre-emptively disabling the Subscribe button for a
 * member who already has an active membership — `plans.subscribe`
 * rejects that server-side with CONFLICT (PLAN-001, fixed) and this page
 * relies on `subscribe.error.message` (rendered below) to surface it,
 * rather than duplicating the "do they already have one" check client-side.
 */
export default function PlansPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: plans, isLoading } = trpc.plans.list.useQuery({});

  const subscribe = trpc.plans.subscribe.useMutation({
    onSuccess: async () => {
      await utils.members.profile.invalidate();
      await utils.payments.mine.invalidate();
    },
  });

  if (isLoading) return <p className="muted">Loading plans...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Membership plans</h1>

      {subscribe.error && (
        <p className="panel p-3 text-sm" style={{ color: "#f87171" }}>
          {subscribe.error.message}
        </p>
      )}

      {subscribe.isSuccess && (
        <p className="panel p-3 text-sm" style={{ color: "var(--accent)" }}>
          Membership activated.
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {plans?.map((p) => {
          const isUnlimited = p.classCredits >= 999;
          
          return (
            <div 
              key={p.id} 
              className={`panel flex flex-col gap-4 p-6 relative overflow-hidden transition-all hover:border-green-500/50 ${
                isUnlimited ? "border-green-500/30 shadow-[0_0_15px_rgba(74,222,128,0.05)]" : ""
              }`}
            >
              {isUnlimited && (
                <div className="absolute top-0 right-0 bg-green-500 text-green-950 text-[10px] font-bold px-3 py-1 uppercase tracking-wider rounded-bl-lg">
                  Best Value
                </div>
              )}
              
              <div>
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="muted mt-1 text-sm leading-relaxed">{p.description}</p>
              </div>

              <div className="text-3xl font-bold flex items-baseline gap-1">
                {formatMoney(p.priceCents)}
                <span className="text-sm font-normal muted">
                  / {p.durationDays} days
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-green-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {isUnlimited ? "Unlimited classes" : `${p.classCredits} class credits`}
              </div>

            {/* Signed-out visitor: clickable button that sends them to
                sign in, same pattern as schedule/page.tsx's Book button,
                instead of a disabled button. Signed-in Subscribe flow is
                unchanged. */}
            <button
              className="btn btn-primary mt-auto"
              disabled={!!user && subscribe.isPending}
              onClick={() =>
                user
                  ? subscribe.mutate({ planId: p.id, method: "card" })
                  : router.push("/login")
              }
            >
              {user ? "Subscribe" : "Sign in to subscribe"}
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}
