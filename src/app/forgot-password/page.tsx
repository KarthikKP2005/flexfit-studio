"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState(false);

  const resetMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    },
  });

  const isPending = resetMutation.isPending;
  const error = resetMutation.error;

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>

      {success ? (
        <div className="panel p-5 text-center space-y-3">
          <p className="text-green-600 font-medium">Password reset successfully!</p>
          <p className="text-sm muted">Redirecting to login...</p>
        </div>
      ) : (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            resetMutation.mutate({ email, newPassword });
          }}
        >
          <p className="text-sm muted pb-2">
            Enter your email and a new password to instantly reset it.
          </p>
          
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
            <label className="text-sm muted">New Password</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              {error.message}
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Resetting..." : "Reset password"}
          </button>
        </form>
      )}

      <p className="muted text-center text-sm">
        Remember your password?{" "}
        <Link href="/login" className="hover:text-white" style={{ color: "var(--text)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
