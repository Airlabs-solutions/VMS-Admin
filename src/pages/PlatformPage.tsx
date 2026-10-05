import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button, DataTable, Field, PageHeader, StateMessage, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";

type Company = { id: string; name: string; status: string; plan: string; maxVehicles: number; smsCredits: number };
type Grant = { id: string; companyName: string; reason: string; expiresAt: string };

const empty = { name: "", maxVehicles: "100", smsCredits: "500", adminName: "", email: "", password: "", mobile: "" };

export function PlatformPage() {
  const client = useQueryClient();
  const companies = useQuery({ queryKey: ["platform-companies"], queryFn: () => api<{ data: Company[] }>("/platform/companies") });
  const grants = useQuery({ queryKey: ["grants"], queryFn: () => api<{ data: Grant[] }>("/platform/support-grants") });
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api("/platform/companies", {
        method: "POST",
        body: {
          name: form.name,
          maxVehicles: Number(form.maxVehicles),
          smsCredits: Number(form.smsCredits),
          admin: { name: form.adminName, email: form.email, password: form.password, mobile: form.mobile },
        },
      }),
    onSuccess: async () => {
      setForm(empty);
      await client.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create the company"),
  });
  const enter = useMutation({
    mutationFn: (id: string) => api(`/platform/support-grants/${id}/enter`, { method: "POST" }),
    onSuccess: () => {
      window.location.href = "/dashboard";
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Companies" />
      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-line bg-card p-4 md:grid-cols-3">
        <Field label="Company name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label="Max vehicles"><TextInput value={form.maxVehicles} onChange={(event) => setForm({ ...form, maxVehicles: event.target.value })} required /></Field>
        <Field label="SMS credits"><TextInput value={form.smsCredits} onChange={(event) => setForm({ ...form, smsCredits: event.target.value })} required /></Field>
        <Field label="Admin name"><TextInput value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })} required /></Field>
        <Field label="Admin email"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
        <Field label="Admin password"><TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></Field>
        <Field label="Admin mobile"><TextInput value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} required /></Field>
        {error ? <p className="text-sm text-status-danger md:col-span-3">{error}</p> : null}
        <div className="md:col-span-3"><Button disabled={create.isPending}>Create company</Button></div>
      </form>
      {companies.isLoading ? <StateMessage>Loading companies...</StateMessage> : null}
      {companies.data ? (
        <DataTable
          columns={["Name", "Status", "Plan", "Vehicle limit", "SMS credits"]}
          rows={companies.data.data.map((company) => [company.name, company.status, company.plan, String(company.maxVehicles), String(company.smsCredits)])}
        />
      ) : null}
      <h2 className="text-lg font-semibold">Open support grants</h2>
      {grants.data?.data.length === 0 ? <StateMessage>No active support grants.</StateMessage> : null}
      {grants.data && grants.data.data.length > 0 ? (
        <DataTable
          columns={["Company", "Reason", "Expires", ""]}
          rows={grants.data.data.map((grant) => [
            grant.companyName,
            grant.reason,
            new Date(grant.expiresAt).toLocaleString("en-GB"),
            <Button key={grant.id} variant="secondary" onClick={() => enter.mutate(grant.id)}>Enter</Button>,
          ])}
        />
      ) : null}
    </div>
  );
}
