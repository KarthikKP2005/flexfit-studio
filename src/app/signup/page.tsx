"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      if (redirectUrl) {
        router.push(redirectUrl);
      } else {
        router.push("/dashboard");
      }
    },
  });

  const register = trpc.auth.register.useMutation({
    onSuccess: (_, variables) => {
      login.mutate({ email: variables.email, password: variables.password });
    },
  });

  const isPending = register.isPending || login.isPending;
  const error = register.error ?? login.error;

  return (
    <div className="space-y-6 max-w-sm mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight">Create an Account</h1>

      <form
        className="panel space-y-5 p-6 shadow-lg shadow-black/50"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate({ name, email, phone: phone || undefined, password });
        }}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium muted">Full Name</label>
          <input
            className="input focus:border-green-500/50 transition-colors"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium muted">Email Address</label>
          <input
            className="input focus:border-green-500/50 transition-colors"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium muted">Phone (optional)</label>
          <input
            className="input focus:border-green-500/50 transition-colors"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium muted">Password</label>
          <input
            className="input focus:border-green-500/50 transition-colors"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 p-2 rounded">
            {error.message}
          </p>
        )}

        <button
          className="btn btn-primary w-full py-2.5 shadow-md shadow-green-500/10"
          type="submit"
          disabled={isPending}
        >
          {isPending
            ? register.isPending
              ? "Creating account..."
              : "Signing in..."
            : "Create account"}
        </button>
      </form>

      <p className="muted text-center text-sm">
        Already have an account?{" "}
        <Link href={`/login${redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`} className="text-white hover:text-green-400 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="grid md:grid-cols-2 gap-12 items-center min-h-[75vh]">
      {/* Brand Panel (Hidden on mobile) */}
      <div className="hidden md:flex flex-col justify-center space-y-6 p-10 h-full bg-gradient-to-br from-[#171a21] to-[#0f1115] rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl -ml-10 -mb-10"></div>
        <div className="relative z-10">
          <p className="text-green-400 font-semibold tracking-widest uppercase text-sm mb-4">Join The Club</p>
          <h2 className="text-4xl font-extrabold tracking-tight text-white leading-tight">
            Commit to Your Best Self.
          </h2>
          <p className="muted text-lg leading-relaxed mt-6 max-w-md">
            Experience world-class facilities, expert trainers, and a supportive community. Your first class awaits.
          </p>
        </div>
      </div>
      
      {/* Form Panel */}
      <div>
        <Suspense fallback={<p className="muted text-center">Loading...</p>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
