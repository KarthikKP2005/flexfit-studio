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

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
    },
  });

  return (
    <div className="mx-auto max-w-sm space-y-6 mt-12">
      <h1 className="text-2xl font-semibold tracking-tight">Reset Password</h1>

      {success ? (
        <div className="panel space-y-4 p-5 text-center">
          <p className="text-sm" style={{ color: "var(--accent)" }}>
            Your password has been reset successfully!
          </p>
          <Link href="/login" className="btn btn-primary w-full">
            Return to Sign in
          </Link>
        </div>
      ) : (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            resetPassword.mutate({ email, newPassword });
          }}
        >
          <p className="muted text-sm pb-2">
            Enter your account email and a new password below to reset your access.
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

          {resetPassword.error && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              {resetPassword.error.message}
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={resetPassword.isPending}
          >
            {resetPassword.isPending ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      )}

      <p className="muted text-center text-sm">
        Remembered your password?{" "}
        <Link href="/login" className="hover:text-white" style={{ color: "var(--text)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
