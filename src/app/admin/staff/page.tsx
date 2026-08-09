"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";

export default function AdminStaffPage() {
  const { data: staff, isLoading, refetch } = trpc.adminStaff.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const createMutation = trpc.adminStaff.createTrainer.useMutation({
    onSuccess: () => {
      setName("");
      setEmail("");
      setPassword("");
      setShowForm(false);
      refetch();
    },
  });

  if (isLoading) return <p className="muted">Loading staff...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Manage Staff</h1>
        <div className="flex gap-2">
          <Link href="/admin" className="btn btn-outline btn-sm">
            Back to Dashboard
          </Link>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-sm">
            {showForm ? "Cancel" : "Add Trainer"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="panel p-4 space-y-4">
          <h2 className="font-medium">Appoint a new Trainer</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ name, email, password });
            }}
            className="grid gap-4 sm:grid-cols-3 items-end"
          >
            <div>
              <label className="block text-sm muted mb-1">Name</label>
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm muted mb-1">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm muted mb-1">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="sm:col-span-3 flex items-center justify-between">
              {createMutation.error ? (
                <p className="text-red-500 text-sm">{createMutation.error.message}</p>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Saving..." : "Create Trainer"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
        {staff?.map((user) => (
          <div key={user.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{user.name}</div>
              <div className="text-sm muted">{user.email}</div>
            </div>
            <div className="flex gap-4 items-center">
              <span className="uppercase text-xs tracking-wider font-semibold muted">
                {user.role}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  user.active
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {user.active ? "Active" : "Inactive"}
              </span>
              <Link href={`/admin/staff/${user.id}`} className="btn btn-sm btn-outline">
                {user.role === "trainer" ? "Manage Schedule" : "View"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
