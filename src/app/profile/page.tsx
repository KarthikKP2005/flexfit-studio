"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Member self-service profile (MEMBER-004): view read-only account info
 * and edit name/phone via the existing, unmodified
 * `members.updateProfile` mutation. Not responsible for: password or
 * email changes — `updateProfile`'s input only accepts name/phone, so
 * neither is offered here; email and role are shown read-only.
 */
export default function ProfilePage() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.members.profile.useQuery();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Seed the editable fields from the server once, the first time profile
  // loads — not on every refetch, or a background refetch mid-edit would
  // silently overwrite whatever the member had just typed.
  useEffect(() => {
    if (profile && !initialized) {
      setName(profile.name);
      setPhone(profile.phone ?? "");
      setInitialized(true);
    }
  }, [profile, initialized]);

  const updateProfile = trpc.members.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.members.profile.invalidate();
      // NavBar reads the display name from auth.me, not members.profile —
      // invalidate both so the name in the header updates immediately too.
      await utils.auth.me.invalidate();
      setSuccessMessage("Profile updated.");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  if (isLoading) return <p className="muted">Loading...</p>;
  if (!profile) return <p className="muted">Please sign in to view your profile.</p>;

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          // Explicit null (not omitted) clears the phone field server-side
          // — updateProfile's `phone` is nullable().optional(), and
          // `.set(input)` only touches fields actually present in input.
          updateProfile.mutate({ name, phone: phone.trim() ? phone : null });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-sm muted">Email</label>
          <input className="input" type="email" value={profile.email} disabled />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Role</label>
          <input className="input capitalize" type="text" value={profile.role} disabled />
        </div>

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
          <label className="text-sm muted">Phone (optional)</label>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {updateProfile.error && (
          <p className="text-sm" style={{ color: "#f87171" }}>
            {updateProfile.error.message}
          </p>
        )}

        {successMessage && (
          <p className="text-sm" style={{ color: "#4ade80" }}>
            {successMessage}
          </p>
        )}

        <button
          className="btn btn-primary w-full"
          type="submit"
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
