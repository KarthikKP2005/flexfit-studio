"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";


/**
 * Handles the complete signup flow:
 * 1. Collects and validates registration details.
 * 2. Creates the account through `auth.register`.
 * 3. Automatically signs the new user in through `auth.login`.
 * 4. Redirects the user to the original requested page or dashboard.
 */


function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
          <div className="relative">
            <input
              className="input focus:border-green-500/50 transition-colors pr-10"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              placeholder="••••••••"
            />
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
