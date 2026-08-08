"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function AdminMembersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.members.search.useQuery({
    q: searchTerm,
    limit: 500,
  });

  const setRole = trpc.members.setRole.useMutation({
    onSuccess: () => utils.members.search.invalidate(),
  });

  const setActive = trpc.members.setActive.useMutation({
    onSuccess: () => utils.members.search.invalidate(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Staff & Member Management</h1>
      </div>

      <div className="panel p-4">
        <input
          className="input w-full max-w-sm"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="muted">Loading users...</p>
      ) : (
        <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
          {users?.map((user) => (
            <div key={user.id} className="flex items-center gap-4 p-4 text-sm">
              <div className="flex-1">
                <div className="font-medium">{user.name}</div>
                <div className="muted text-xs">{user.email}</div>
              </div>

              <div className="w-32">
                <select
                  className="input py-1 text-sm"
                  value={user.role}
                  onChange={(e) =>
                    setRole.mutate({
                      id: user.id,
                      role: e.target.value as "member" | "trainer" | "admin",
                    })
                  }
                  disabled={setRole.isPending}
                >
                  <option value="member">Member</option>
                  <option value="trainer">Trainer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="w-24 text-right">
                <button
                  className={`btn btn-sm ${user.active ? "muted" : "btn-primary"}`}
                  onClick={() => setActive.mutate({ id: user.id, active: !user.active })}
                  disabled={setActive.isPending}
                >
                  {user.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
          {users?.length === 0 && (
            <p className="muted p-4 text-sm">No users found.</p>
          )}
        </div>
      )}
    </div>
  );
}
