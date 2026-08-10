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

  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      await utils.invalidate();
      
      if (redirectUrl) {
        router.push(redirectUrl);
        return;
      }
      
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
          <input
            className="input focus:border-green-500/50 transition-colors"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
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
