"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [success, setSuccess] = useState(false);

  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 1500);
    },
  });

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>

      {success ? (
        <div
          className="panel p-5 text-center space-y-2"
          style={{ borderColor: "var(--accent)" }}
        >
          <p className="text-lg font-medium" style={{ color: "var(--accent)" }}>
            ✓ Account created!
          </p>
          <p className="text-sm muted">
            Redirecting to sign in…
          </p>
        </div>
      ) : (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate({
              name,
              email,
              password,
              phone: phone || undefined,
            });
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm muted">Full name</label>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="John Doe"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm muted">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
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
              minLength={6}
              placeholder="Min. 6 characters"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm muted">Phone (optional)</label>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
            />
          </div>

          {register.error && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              {register.error.message}
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={register.isPending}
          >
            {register.isPending ? "Creating account…" : "Sign up"}
          </button>
        </form>
      )}

      <p className="text-sm text-center muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium"
          style={{ color: "var(--accent)" }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
