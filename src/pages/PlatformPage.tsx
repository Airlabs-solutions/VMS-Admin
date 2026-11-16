import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Badge, Button, DataTable, Field, PageHeader, SelectInput, StateMessage, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { CompanyLimits, Module, Subscription } from "../types";

type CompanyItem = {
  id: string;
  name: string;
  status: string;
  modules: Module[];
  limits: CompanyLimits;
  subscription: Subscription;
  smsSenderName: string;
  smsCredits: number;
};

type AuditItem = {
  id: string;
  actorEmail: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  timestamp: string;
};

type Grant = { id: string; companyName: string; reason: string; expiresAt: string };

const ALL_MODULES: Module[] = ["fleet", "equipment", "hr", "payroll"];

export function PlatformPage() {
  const client = useQueryClient();
  const companies = useQuery({ queryKey: ["platform-companies"], queryFn: () => api<{ data: CompanyItem[] }>("/platform/companies") });
  const grants = useQuery({ queryKey: ["grants"], queryFn: () => api<{ data: Grant[] }>("/platform/support-grants") });

  const [selectedCompany, setSelectedCompany] = useState<CompanyItem | null>(null);
  const [historyCompanyId, setHistoryCompanyId] = useState<string | null>(null);

  // Creation form state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    vehicles: "500",
    smsCredits: "500",
    adminName: "",
    email: "",
    password: "",
    mobile: "",
    modules: ["fleet"] as Module[],
  });
  const [createError, setCreateError] = useState("");

  // Edit form state
  const [editModules, setEditModules] = useState<Module[]>([]);
  const [editLimits, setEditLimits] = useState<CompanyLimits>({
    vehicles: 500,
    equipment: 0,
    employees: 0,
    adminSeats: 5,
    smsCredits: 0,
    storageMb: 5120,
  });
  const [editSubscription, setEditSubscription] = useState({
    plan: "starter",
    status: "active" as Subscription["status"],
    notes: "",
  });
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);
  const [editError, setEditError] = useState("");

  const auditLogs = useQuery({
    queryKey: ["platform-audit", historyCompanyId],
    queryFn: () => api<{ data: AuditItem[] }>(`/platform/companies/${historyCompanyId}/audit`),
    enabled: Boolean(historyCompanyId),
  });

  const create = useMutation({
    mutationFn: () =>
      api("/platform/companies", {
        method: "POST",
        body: {
          name: createForm.name,
          modules: createForm.modules,
          limits: {
            vehicles: Number(createForm.vehicles),
            smsCredits: Number(createForm.smsCredits),
          },
          admin: {
            name: createForm.adminName,
            email: createForm.email,
            password: createForm.password,
            mobile: createForm.mobile,
          },
        },
      }),
    onSuccess: async () => {
      setShowCreate(false);
      setCreateError("");
      await client.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : "Could not create the company"),
  });

  const update = useMutation({
    mutationFn: () => {
      if (!selectedCompany) throw new Error("No company selected");
      return api(`/platform/companies/${selectedCompany.id}`, {
        method: "PATCH",
        body: {
          modules: editModules,
          limits: editLimits,
          subscription: editSubscription,
          confirmDowngrade,
        },
      });
    },
    onSuccess: async () => {
      setSelectedCompany(null);
      setEditError("");
      setConfirmDowngrade(false);
      await client.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "Failed to update company settings"),
  });

  const enter = useMutation({
    mutationFn: (id: string) => api(`/platform/support-grants/${id}/enter`, { method: "POST" }),
    onSuccess: () => {
      window.location.href = "/dashboard";
    },
  });

  function startEdit(company: CompanyItem) {
    setSelectedCompany(company);
    setEditModules(company.modules ?? ["fleet"]);
    setEditLimits({
      vehicles: company.limits?.vehicles ?? 500,
      equipment: company.limits?.equipment ?? 0,
      employees: company.limits?.employees ?? 0,
      adminSeats: company.limits?.adminSeats ?? 5,
      smsCredits: company.limits?.smsCredits ?? 0,
      storageMb: company.limits?.storageMb ?? 5120,
    });
    setEditSubscription({
      plan: company.subscription?.plan ?? "starter",
      status: (company.subscription?.status as Subscription["status"]) ?? "active",
      notes: company.subscription?.notes ?? "",
    });
    setConfirmDowngrade(false);
    setEditError("");
  }

  function toggleModule(mod: Module) {
    setEditModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Platform Companies">
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Close form" : "New company"}
        </Button>
      </PageHeader>

      {/* Creation Form */}
      {showCreate ? (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid gap-3 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] md:grid-cols-3"
        >
          <Field label="Company name">
            <TextInput value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
          </Field>
          <Field label="Vehicle limit">
            <TextInput type="number" value={createForm.vehicles} onChange={(e) => setCreateForm({ ...createForm, vehicles: e.target.value })} required />
          </Field>
          <Field label="Initial SMS credits">
            <TextInput type="number" value={createForm.smsCredits} onChange={(e) => setCreateForm({ ...createForm, smsCredits: e.target.value })} required />
          </Field>
          <Field label="Admin name">
            <TextInput value={createForm.adminName} onChange={(e) => setCreateForm({ ...createForm, adminName: e.target.value })} required />
          </Field>
          <Field label="Admin email">
            <TextInput type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
          </Field>
          <Field label="Admin password">
            <TextInput type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
          </Field>
          <Field label="Admin mobile">
            <TextInput value={createForm.mobile} onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })} required placeholder="+966 5X XXX XXXX" />
          </Field>

          {createError ? <p className="text-sm text-status-danger md:col-span-3">{createError}</p> : null}
          <div className="md:col-span-3">
            <Button disabled={create.isPending}>Save company</Button>
          </div>
        </form>
      ) : null}

      {/* Edit Company Modal / Drawer */}
      {selectedCompany ? (
        <div className="rounded-lg border-2 border-brand bg-card p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Manage {selectedCompany.name}</h2>
            <Button variant="ghost" onClick={() => setSelectedCompany(null)}>Cancel</Button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Enabled Modules</p>
              <div className="flex flex-wrap gap-3">
                {ALL_MODULES.map((mod) => (
                  <label key={mod} className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-brand-soft">
                    <input
                      type="checkbox"
                      checked={editModules.includes(mod)}
                      onChange={() => toggleModule(mod)}
                      className="rounded border-line text-brand focus:ring-brand"
                    />
                    <span className="capitalize">{mod}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Vehicle limit">
                <TextInput
                  type="number"
                  value={editLimits.vehicles}
                  onChange={(e) => setEditLimits({ ...editLimits, vehicles: Number(e.target.value) })}
                />
              </Field>
              <Field label="Equipment limit">
                <TextInput
                  type="number"
                  value={editLimits.equipment}
                  onChange={(e) => setEditLimits({ ...editLimits, equipment: Number(e.target.value) })}
                />
              </Field>
              <Field label="Employee limit">
                <TextInput
                  type="number"
                  value={editLimits.employees}
                  onChange={(e) => setEditLimits({ ...editLimits, employees: Number(e.target.value) })}
                />
              </Field>
              <Field label="Admin seats limit">
                <TextInput
                  type="number"
                  value={editLimits.adminSeats}
                  onChange={(e) => setEditLimits({ ...editLimits, adminSeats: Number(e.target.value) })}
                />
              </Field>
              <Field label="SMS credits balance">
                <TextInput
                  type="number"
                  value={editLimits.smsCredits}
                  onChange={(e) => setEditLimits({ ...editLimits, smsCredits: Number(e.target.value) })}
                />
              </Field>
              <Field label="Subscription status">
                <SelectInput
                  value={editSubscription.status}
                  onChange={(e) => setEditSubscription({ ...editSubscription, status: e.target.value as Subscription["status"] })}
                >
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspended</option>
                  <option value="expired">Expired</option>
                </SelectInput>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={confirmDowngrade}
                onChange={(e) => setConfirmDowngrade(e.target.checked)}
                className="rounded border-line text-brand"
              />
              Confirm downgrade if lowering limits below current usage
            </label>

            {editError ? <p className="text-sm text-status-danger">{editError}</p> : null}

            <div className="flex gap-2">
              <Button onClick={() => update.mutate()} disabled={update.isPending}>
                Save changes
              </Button>
              <Button variant="secondary" onClick={() => setHistoryCompanyId(selectedCompany.id)}>
                View change history
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Change History Drawer */}
      {historyCompanyId ? (
        <div className="rounded-lg border border-line bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-ink">Change History Audit</h3>
            <Button variant="ghost" onClick={() => setHistoryCompanyId(null)}>Close</Button>
          </div>
          {auditLogs.isLoading ? <StateMessage>Loading audit history...</StateMessage> : null}
          {auditLogs.data?.data.length === 0 ? <p className="text-sm text-muted">No audit history found.</p> : null}
          {auditLogs.data && auditLogs.data.data.length > 0 ? (
            <div className="divide-y divide-line text-xs">
              {auditLogs.data.data.map((log) => (
                <div key={log.id} className="py-2">
                  <div className="flex justify-between font-medium text-ink">
                    <span>{log.action} by {log.actorEmail}</span>
                    <span className="text-muted">{new Date(log.timestamp).toLocaleString("en-GB")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Companies List */}
      {companies.isLoading ? <StateMessage>Loading companies...</StateMessage> : null}
      {companies.data ? (
        <DataTable
          columns={["Name", "Status", "Modules", "Limits (Veh / Eq / Emp)", "SMS Credits", "Actions"]}
          rows={companies.data.data.map((company) => [
            <span key={company.id} className="font-medium text-ink">{company.name}</span>,
            <Badge key={`st-${company.id}`} code={company.status} label={company.status} />,
            <div key={`m-${company.id}`} className="flex flex-wrap gap-1">
              {(company.modules || ["fleet"]).map((m) => (
                <span key={m} className="rounded bg-brand-soft px-1.5 py-0.5 text-xs text-brand-deep capitalize">{m}</span>
              ))}
            </div>,
            `${company.limits?.vehicles ?? 0} / ${company.limits?.equipment ?? 0} / ${company.limits?.employees ?? 0}`,
            String(company.limits?.smsCredits ?? 0),
            <Button key={`act-${company.id}`} variant="secondary" onClick={() => startEdit(company)}>
              Configure
            </Button>,
          ])}
        />
      ) : null}

      {/* Support Grants */}
      <h2 className="text-lg font-semibold text-ink">Active Support Grants</h2>
      {grants.data?.data.length === 0 ? <StateMessage>No active support grants.</StateMessage> : null}
      {grants.data && grants.data.data.length > 0 ? (
        <DataTable
          columns={["Company", "Reason", "Expires", "Action"]}
          rows={grants.data.data.map((grant) => [
            grant.companyName,
            grant.reason,
            new Date(grant.expiresAt).toLocaleString("en-GB"),
            <Button key={grant.id} variant="secondary" onClick={() => enter.mutate(grant.id)}>Enter tenant</Button>,
          ])}
        />
      ) : null}
    </div>
  );
}
