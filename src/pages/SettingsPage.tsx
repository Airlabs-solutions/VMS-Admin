import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Field, PageHeader, Panel, Skeleton, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { CompanyLimits, Module, Subscription } from "../types";

type GmailAccess = { id: string; name: string; email: string; status: string; primary: boolean };

type CompanySettings = {
  id: string;
  name: string;
  status: string;
  modules: Module[];
  limits: CompanyLimits;
  subscription: Subscription;
  smsCredits: number;
};

const blank = { id: "", name: "", email: "", primary: false };

export function SettingsPage() {
  const client = useQueryClient();
  const company = useQuery({ queryKey: ["settings-company"], queryFn: () => api<{ data: CompanySettings }>("/settings/company") });
  const access = useQuery({ queryKey: ["gmail-access"], queryFn: () => api<{ data: GmailAccess[] }>("/settings/gmail-access") });

  const [form, setForm] = useState(blank);
  const [confirmId, setConfirmId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editing = form.id !== "";

  function fail(err: unknown, fallback: string) {
    setMessage("");
    setError(err instanceof ApiError ? err.message : fallback);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), email: form.email.trim() };
      if (editing) return api(`/settings/gmail-access/${form.id}`, { method: "PATCH", body });
      return api("/settings/gmail-access", { method: "POST", body });
    },
    onSuccess: () => {
      setForm(blank);
      setError("");
      setMessage(editing ? "Gmail access updated." : "Gmail access added.");
      void client.invalidateQueries({ queryKey: ["gmail-access"] });
    },
    onError: (err) => fail(err, "Could not save Gmail access"),
  });

  const setStatus = useMutation({
    mutationFn: (row: GmailAccess) =>
      api(`/settings/gmail-access/${row.id}`, {
        method: "PATCH",
        body: { status: row.status === "active" ? "inactive" : "active" },
      }),
    onSuccess: (_result, row) => {
      setError("");
      setMessage(row.status === "active" ? "Gmail access deactivated." : "Gmail access activated.");
      void client.invalidateQueries({ queryKey: ["gmail-access"] });
    },
    onError: (err) => fail(err, "Could not update access"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/settings/gmail-access/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmId("");
      setError("");
      setMessage("Gmail access removed.");
      void client.invalidateQueries({ queryKey: ["gmail-access"] });
    },
    onError: (err) => fail(err, "Could not remove access"),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    save.mutate();
  }

  const companyData = company.data?.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Company subscription profile, plan limits, and authentication access." />

      {/* Company Plan and Entitlements (Read-Only) */}
      {companyData ? (
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h2 className="text-base font-semibold text-ink">{companyData.name}</h2>
              <p className="text-sm text-muted">Subscription Plan: <span className="font-medium text-ink capitalize">{companyData.subscription?.plan ?? "Starter"}</span></p>
            </div>
            <Badge code={companyData.subscription?.status ?? "active"} label={(companyData.subscription?.status ?? "Active").toUpperCase()} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Active Modules</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(companyData.modules || ["fleet"]).map((mod) => (
                  <span key={mod} className="rounded-md border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-deep capitalize">
                    {mod}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Modules can only be modified by your system administrator.</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Plan Limits & Usage</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-ink">
                <div>Vehicles Limit: <span className="font-semibold">{companyData.limits?.vehicles ?? 0}</span></div>
                <div>Equipment Limit: <span className="font-semibold">{companyData.limits?.equipment ?? 0}</span></div>
                <div>Employees Limit: <span className="font-semibold">{companyData.limits?.employees ?? 0}</span></div>
                <div>Admin Seats: <span className="font-semibold">{companyData.limits?.adminSeats ?? 5}</span></div>
                <div>SMS Credits: <span className="font-semibold">{companyData.limits?.smsCredits ?? 0}</span></div>
                <div>Storage: <span className="font-semibold">{companyData.limits?.storageMb ?? 5120} MB</span></div>
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* Gmail Access Panel */}
      <Panel className="p-4 sm:p-5">
        <h2 className="text-base font-semibold text-ink">{editing ? "Edit Gmail access" : "Allow Gmail access"}</h2>
        <p className="mt-1 text-sm text-muted">Sign-in codes are sent from the configured Gmail account to an allowed address.</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Name">
            <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Gmail address" hint={form.primary ? "The primary Gmail address cannot be changed." : undefined}>
            <TextInput type="email" value={form.email} autoComplete="off" disabled={form.primary} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button disabled={save.isPending}>{save.isPending ? "Saving..." : editing ? "Save" : "Allow access"}</Button>
            {editing ? (
              <Button type="button" variant="secondary" onClick={() => { setForm(blank); setError(""); }}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Panel>

      {access.isLoading ? <Skeleton className="h-28 rounded-lg" /> : null}
      {access.isError ? (
        <ErrorState
          title="Could not load Gmail access."
          detail={access.error instanceof ApiError ? access.error.message : "Try again in a moment."}
          onRetry={() => void access.refetch()}
        />
      ) : null}
      {access.data && access.data.data.length === 0 ? (
        <EmptyState title="No Gmail access yet" detail="Add a Gmail address to allow sign-in." />
      ) : null}
      {access.data && access.data.data.length > 0 ? (
        <Panel className="divide-y divide-line">
          {access.data.data.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                  {row.primary ? <Badge label="Primary" /> : <Badge code={row.status} label={row.status === "active" ? "Active" : "Inactive"} />}
                </div>
                <p className="mt-1 truncate text-sm text-muted">{row.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConfirmId("");
                    setError("");
                    setForm({ id: row.id, name: row.name, email: row.email, primary: row.primary });
                  }}
                >
                  Edit
                </Button>
                {row.primary ? null : (
                  <Button type="button" variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate(row)}>
                    {row.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                )}
                {row.primary ? null : confirmId === row.id ? (
                  <>
                    <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}>
                      {remove.isPending ? "Removing..." : "Confirm remove"}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setConfirmId("")}>Cancel</Button>
                  </>
                ) : (
                  <Button type="button" variant="danger" onClick={() => setConfirmId(row.id)}>Remove</Button>
                )}
              </div>
            </div>
          ))}
        </Panel>
      ) : null}

      {message ? <p className="text-sm text-status-ok" role="status">{message}</p> : null}
      {error ? <p className="text-sm text-status-danger" role="alert">{error}</p> : null}
    </div>
  );
}
