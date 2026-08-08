"use client";

import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/format";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type SearchResult = RouterOutputs["members"]["search"][number];
type Role = "member" | "trainer" | "admin";

/**
 * Admin member directory: search (members.search), detail view
 * (members.byId), and activate/deactivate + role controls
 * (members.setActive/setRole). All four procedures are called exactly
 * as they already existed (see MEMBER-005 in known-issues.md) — this
 * page only adds the missing UI, it doesn't change what any of them do.
 *
 * Behavior note: search is not restricted to role "member" (matches the
 * backend's own behavior, see members.ts's search comment), so
 * trainers/admins show up here too — intentional, since demoting/
 * deactivating a trainer or admin also needs this page.
 */
export default function AdminMembersPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const { data: results, isLoading: searchLoading } = trpc.members.search.useQuery({
    q: query,
    limit: 50,
  });

  const {
    data: member,
    isLoading: detailLoading,
    refetch: refetchMember,
  } = trpc.members.byId.useQuery({ id: selectedId! }, { enabled: selectedId !== null });

  const setActiveMutation = trpc.members.setActive.useMutation({
    onSuccess: (data) => {
      // MEMBER-003: setActive silently returns undefined for a bad id
      // instead of throwing. Not expected here (ids only come from a
      // real search/byId result), but don't assume success either.
      if (!data) {
        setActiveMutation.reset();
        setActionError("Could not update this member — they may no longer exist.");
        return;
      }
      setActionError("");
      refetchMember();
    },
  });

  const setRoleMutation = trpc.members.setRole.useMutation({
    onSuccess: (data) => {
      if (!data) {
        setActionError("Could not update this member — they may no longer exist.");
        return;
      }
      setActionError("");
      refetchMember();
    },
  });

  const handleToggleActive = () => {
    if (member) {
      setActiveMutation.mutate({ id: member.id, active: !member.active });
    }
  };

  const handleRoleChange = (role: Role) => {
    if (member) {
      setRoleMutation.mutate({ id: member.id, role });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="input max-w-md"
        placeholder="Search by name or email"
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          {searchLoading && <p className="muted text-sm">Searching...</p>}
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {results && results.length > 0 ? (
              results.map((u: SearchResult) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedId(u.id);
                    setActionError("");
                  }}
                  className="flex w-full items-center gap-4 p-3 text-left hover:opacity-75 transition"
                  style={{
                    background: u.id === selectedId ? "#212633" : undefined,
                  }}
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{u.name}</div>
                    <div className="text-xs muted">{u.email}</div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="muted">{u.role}</div>
                    <div className={u.active ? "text-green-600" : "text-red-600"}>
                      {u.active ? "Active" : "Inactive"}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center muted">No members found</div>
            )}
          </div>
        </div>

        <div className="panel p-4">
          {selectedId === null && <p className="muted">Select a member to view details.</p>}
          {selectedId !== null && detailLoading && <p className="muted">Loading...</p>}
          {selectedId !== null && !detailLoading && !member && (
            <p className="muted">Member not found.</p>
          )}
          {member && (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-semibold">{member.name}</div>
                <div className="text-sm muted">{member.email}</div>
                {member.phone && <div className="text-sm muted">{member.phone}</div>}
              </div>

              {actionError && (
                <div className="p-3 rounded" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}>
                  <p style={{ color: "#ef4444" }}>{actionError}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-sm muted">Role</span>
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(e.target.value as Role)}
                  disabled={setRoleMutation.isPending}
                  className="input"
                  style={{ width: "auto" }}
                >
                  <option value="member">member</option>
                  <option value="trainer">trainer</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              <button
                onClick={handleToggleActive}
                disabled={setActiveMutation.isPending}
                className={member.active ? "btn btn-danger btn-sm" : "btn btn-sm"}
              >
                {member.active ? "Deactivate" : "Activate"}
              </button>

              <div className="space-y-2">
                <h2 className="font-medium text-sm">Membership history</h2>
                {member.memberships.length > 0 ? (
                  <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
                    {member.memberships.map((m) => (
                      <div key={m.id} className="p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{m.planName}</span>
                          <span
                            className={m.status === "active" ? "text-green-600" : undefined}
                          >
                            {m.status}
                          </span>
                        </div>
                        <div className="muted">
                          {formatDate(m.startDate)} – {formatDate(m.endDate)}
                        </div>
                        <div className="muted">Credits remaining: {m.creditsRemaining}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted text-sm">No memberships.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
