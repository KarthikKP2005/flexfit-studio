"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

/**
 * Sign-in form. Not responsible for: registration (no signup page exists
 * — auth.ts's `register` mutation has no UI caller anywhere in the app)
 * or role-aware routing after login (see the redirect note below).
 */
export default function LoginPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      // Behavior note: every role lands on /dashboard (the member view)
      // regardless of the signed-in user's actual role — trainers and
      // admins have to navigate away manually. See plan.md item #39.
      router.push("/dashboard");
    },
  });

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-sm muted">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {login.error && (
          <p className="text-sm" style={{ color: "#f87171" }}>
            {login.error.message}
          </p>
        )}

        <button
          className="btn btn-primary w-full"
          type="submit"
          disabled={login.isPending}
        >
          {login.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {/* Demo credentials are hardcoded here unconditionally — fine for
          this demo repo, but would need gating behind an env flag before
          any production deployment. See plan.md item #51. */}
      <div className="panel p-4 text-sm muted">
        <p className="mb-2 font-medium" style={{ color: "var(--text)" }}>
          Demo accounts
        </p>
        <p>admin@flexfit.test / admin123</p>
        <p>arjun@flexfit.test / trainer123</p>
        <p>rahul.k@example.com / member123</p>
      </div>
    </div>
  );
}
