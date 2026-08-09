"use client";

import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

export default function AdminMembersListPage() {
  const { data: members, isLoading } = trpc.adminMembers.list.useQuery();

  if (isLoading) return <p className="muted">Loading members...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Members (CRM)</h1>
        <Link href="/admin" className="btn btn-outline btn-sm">
          Back to Dashboard
        </Link>
      </div>

      <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
        {members?.map((member) => (
          <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors" style={{ backgroundColor: "var(--bg-panel)" }}>
            <div>
              <div className="font-medium text-lg flex items-center gap-2">
                {member.name}
                {!member.active && (
                  <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded uppercase">Deactivated</span>
                )}
              </div>
              <div className="text-sm muted">
                {member.email} {member.phone && `• ${member.phone}`}
              </div>
              <div className="text-xs muted mt-1">Joined {formatDateTime(member.joinedAt)}</div>
            </div>
            <div>
              <Link href={`/admin/members/${member.id}`} className="btn btn-sm">
                View Profile
              </Link>
            </div>
          </div>
        ))}
        {members?.length === 0 && (
          <div className="p-4 text-center muted">No members found.</div>
        )}
      </div>
    </div>
  );
}
