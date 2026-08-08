"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

/**
 * Sign-up form for new members. Not responsible for: creating trainer/
 * admin accounts — auth.ts's `register` mutation always creates role
 * "member" (see its header comment), so this page can't be used to
 * self-register as staff.
 *
 * End-to-end flow: `register` alone does not create a session (see
 * auth.ts), so this page composes `register` then `login` with the same
 * credentials on success, landing the new member signed in on
 * /dashboard rather than sending them back to /login to type their
 * password a second time. Neither mutation itself was changed to build
 * this page — both are called exactly as they already existed.
 */
export default function SignupPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      router.push("/dashboard");
    },
  });

  const register = trpc.auth.register.useMutation({
    onSuccess: (_, variables) => {
      // register doesn't sign the new user in — chain straight into
      // login with the same credentials rather than bouncing them to
      // /login to type the password again.
      login.mutate({ email: variables.email, password: variables.password });
    },
  });

  const isPending = register.isPending || login.isPending;
  const error = register.error ?? login.error;

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          // Empty phone becomes undefined, not "", so the server stores
          // null (its own ?? null fallback) rather than an empty string.
          register.mutate({ name, email, phone: phone || undefined, password });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-sm muted">Name</label>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
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
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Phone (optional)</label>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-500/10 p-3 border border-red-500/20">
            <p className="text-sm text-red-500">
              {(() => {
                let msg = error.message;
                try {
                  if (msg.startsWith('[')) {
                    const parsed = JSON.parse(msg);
                    if (Array.isArray(parsed) && parsed[0]?.message) {
                      msg = parsed.map(e => e.message).join(', ');
                    }
                  }
                } catch (e) {}
                return msg;
              })()}
            </p>
          </div>
        )}

        <button
          className="btn btn-primary w-full"
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
        <Link href="/login" className="hover:text-white" style={{ color: "var(--text)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
