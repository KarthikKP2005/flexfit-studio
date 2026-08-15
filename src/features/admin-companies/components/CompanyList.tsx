"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/format";

/**
 * Phase 3 of restructure-plan.md: moved verbatim out of
 * src/app/admin/companies/page.tsx — no JSX, styling, trpc call, or
 * logic changed, only the file location. The page itself is now
 * route-level composition only (plan.md item #54's own pattern),
 * wrapping this in `RequireRole`.
 *
 * Corporate account list + create-company form. Links out to each
 * company's detail page.
 */
export function CompanyList() {
  const { data: companies, isLoading, refetch } = trpc.adminCompanies.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState("0");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const createMutation = trpc.adminCompanies.create.useMutation({
    onSuccess: () => {
      setName("");
      setEmail("");
      setCredits("0");
      setShowForm(false);
      setSuccess(true);
      refetch();
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      contactEmail: email.trim(),
      creditPoolBalance: parseInt(credits) || 0,
    });
  };

  if (isLoading) return <p className="muted">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Corporate Memberships</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-sm"
          >
            New Company
          </button>
        )}
      </div>

      {success && (
        <div className="p-3 rounded" style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}>
          <p style={{ color: "var(--accent)" }}>Company created successfully!</p>
        </div>
      )}

      {showForm && (
        <div className="panel p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-4">Create New Company</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Company Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g. TechCorp Inc"
                disabled={createMutation.isPending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Contact Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="contact@techcorp.com"
                disabled={createMutation.isPending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Initial Credit Pool</label>
              <input
                type="number"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="input"
                placeholder="0"
                disabled={createMutation.isPending}
                min="0"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="btn"
                disabled={createMutation.isPending || !name.trim() || !email.trim()}
              >
                {createMutation.isPending ? "Creating..." : "Create Company"}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
            </div>

            {error && (
              <div className="p-3 rounded" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}>
                <p style={{ color: "#ef4444" }}>{error}</p>
              </div>
            )}
          </form>
        </div>
      )}

      <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
        {companies && companies.length > 0 ? (
          companies.map((c) => (
            <Link
              key={c.id}
              href={`/admin/companies/${c.id}`}
              className="flex items-center gap-4 p-4 hover:opacity-75 transition"
            >
              <div className="flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="text-sm muted">{c.contactEmail}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{c.creditPoolBalance} credits</div>
                <div className={`text-sm ${c.active ? "text-green-600" : "text-red-600"}`}>
                  {c.active ? "Active" : "Inactive"}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="p-4 text-center muted">No companies yet</div>
        )}
      </div>
    </div>
  );
}
