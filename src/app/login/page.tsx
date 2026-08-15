"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      // Refresh cached tRPC data so the session-dependent UI reflects the new user
      await utils.invalidate();

      // Honor an explicit redirect (e.g. ?redirect=/booking) before falling back to role-based routing
      if (redirectUrl) {
        router.push(redirectUrl);
        return;
      }

      // Route each role to its own landing page
      if (data.role === "trainer") {
        router.push("/trainer/schedule");
      } else if (data.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    },
  });

  return (
    <div className="space-y-6 max-w-sm mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight">Sign In</h1>

      <form
        className="panel space-y-5 p-6 shadow-lg shadow-black/50"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password });
        }}
      >
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
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium muted">Password</label>
            <Link href="/forgot-password" className="text-xs text-green-400 hover:text-green-300">
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <input
              className="input focus:border-green-500/50 transition-colors pr-10"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
            {/* Toggle button swaps the input type and icon to reveal/hide the password */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {login.error && (
          <p className="text-sm text-red-400 bg-red-400/10 p-2 rounded">
            {login.error.message}
          </p>
        )}

        <button
          className="btn btn-primary w-full py-2.5 shadow-md shadow-green-500/10"
          type="submit"
          disabled={login.isPending}
        >
          {login.isPending ? "Signing in..." : "Sign in to your account"}
        </button>
      </form>

      <p className="muted text-center text-sm">
        New to FlexFit?{" "}
        <Link href={`/signup${redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`} className="text-white hover:text-green-400 transition-colors">
          Create an account
        </Link>
      </p>

      {/* Interactive Demo Credentials for Reviewers */}
      <div className="panel p-5 space-y-3 border-dashed border-gray-700 bg-gray-900/50">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          One-Tap Demo Accounts
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setEmail("admin@flexfit.test"); setPassword("admin123"); }} className="px-3 py-1.5 rounded-full text-xs bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition">Admin</button>
          <button type="button" onClick={() => { setEmail("arjun@flexfit.test"); setPassword("trainer123"); }} className="px-3 py-1.5 rounded-full text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition">Trainer</button>
          <button type="button" onClick={() => { setEmail("rahul.k@example.com"); setPassword("member123"); }} className="px-3 py-1.5 rounded-full text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 transition">Member</button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid md:grid-cols-2 gap-12 items-center min-h-[75vh]">
      {/* Brand Panel (Hidden on mobile) */}
      <div className="hidden md:flex flex-col justify-center space-y-6 p-10 h-full bg-gradient-to-br from-[#171a21] to-[#0f1115] rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl -ml-10 -mb-10"></div>
        <div className="relative z-10">
          <p className="text-green-400 font-semibold tracking-widest uppercase text-sm mb-4">FlexFit Studio</p>
          <h2 className="text-4xl font-extrabold tracking-tight text-white leading-tight">
            Your Fitness Journey, Simplified.
          </h2>
          <p className="muted text-lg leading-relaxed mt-6 max-w-md">
            Access your bookings, track your active memberships, and manage your schedule all in one seamless place.
          </p>
        </div>
      </div>
      
      {/* Form Panel */}
      <div>
        <Suspense fallback={<p className="muted text-center">Loading...</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
