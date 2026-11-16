import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DateField } from "../components/DateField";
import { DocumentCapture, DocumentLink } from "../components/DocumentCapture";
import { Badge, Button, DataTable, Field, PageHeader, Panel, SelectInput, StateMessage, Tabs, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { emiSchedule, monthsRemaining } from "../lib/emi";
import { formatDate, formatKm, formatSar } from "../lib/format";
import type { ListResponse, Money, Status } from "../types";

type VehicleDetail = {
  id: string;
  name: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  color: string;
  fuelType: Status;
  platePhotoId: string | null;
  vehiclePhotoId: string | null;
  vin: string;
  type: Status;
  ownership: Status;
  odometerKm: number;
  status: Status;
  currentDriver: { id: string; name: string; mobileMasked: string; fileIds?: string[] } | null;
  istimara: { number: string; expiryDate: string | null; status: Status; fileIds?: string[] } | null;
  insurance: { policyNumber: string; insurer: string; startDate: string | null; endDate: string | null; status: Status; fileIds?: string[] } | null;
  documents?: Array<{ kind: string; fileId: string; uploadedAt: string | null }>;
  maintenance: Array<{ id: string; serviceType: string; nextDueDate: string | null; nextDueKm: number; status: Status }>;
};

const tabs = ["Overview", "Maintenance", "Istimara", "Insurance", "EMI", "Fuel", "Violations", "Trips", "Expenses", "Handovers"] as const;
type VehicleTab = (typeof tabs)[number];

function vehicleTab(value: string | null): VehicleTab {
  return tabs.find((item) => item === value) ?? "Overview";
}

export function VehicleDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = vehicleTab(params.get("tab"));
  function setTab(next: VehicleTab) {
    setParams(next === "Overview" ? {} : { tab: next }, { replace: true });
  }
  const vehicle = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => api<{ data: VehicleDetail }>(`/vehicles/${id}`),
  });

  if (vehicle.isLoading) return <StateMessage>Loading vehicle...</StateMessage>;
  if (vehicle.isError || !vehicle.data) return <StateMessage>This vehicle was not found.</StateMessage>;
  const record = vehicle.data.data;

  return (
    <div>
      <PageHeader title={`${record.name || record.model} · ${record.plateNumber}`}>
        <Badge code={record.status.code} label={record.status.label} />
      </PageHeader>
      <p className="mb-4 text-sm text-muted">
        {record.make} {record.model} · {record.year} · {record.color} · {record.fuelType.label} · {record.ownership.label} · {formatKm(record.odometerKm)} · VIN {record.vin}
      </p>
      <div className="mb-4">
        <Tabs label="Vehicle sections" value={tab} options={tabs.map((item) => ({ id: item, label: item }))} onChange={(id) => setTab(vehicleTab(id))} />
      </div>
      {tab === "Overview" ? <Overview record={record} /> : null}
      {tab === "Maintenance" ? <MaintenanceTab vehicleId={id} /> : null}
      {tab === "Istimara" ? <IstimaraTab vehicleId={id} /> : null}
      {tab === "Insurance" ? <InsuranceTab vehicleId={id} /> : null}
      {tab === "EMI" ? <EmiTab vehicleId={id} /> : null}
      {tab === "Fuel" ? <FuelTab vehicleId={id} /> : null}
      {tab === "Violations" ? <ViolationTab vehicleId={id} /> : null}
      {tab === "Trips" ? <TripTab vehicleId={id} /> : null}
      {tab === "Expenses" ? <ExpenseTab vehicleId={id} /> : null}
      {tab === "Handovers" ? <HandoverTab vehicleId={id} /> : null}
    </div>
  );
}

function Overview({ record }: { record: VehicleDetail }) {
  const storedDocs = record.documents ?? [];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Panel className="p-4 text-sm">
        <h2 className="font-semibold">Current driver</h2>
        <p className="mt-2">{record.currentDriver ? `${record.currentDriver.name} (${record.currentDriver.mobileMasked})` : "Unassigned"}</p>
        {record.currentDriver?.fileIds && record.currentDriver.fileIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {record.currentDriver.fileIds.map((fid, i) => (
              <span key={fid} className="inline-flex items-center gap-1 text-xs text-muted">
                License/Iqama #{i + 1}: <DocumentLink id={fid} />
              </span>
            ))}
          </div>
        ) : null}
      </Panel>
      <Panel className="p-4 text-sm">
        <h2 className="font-semibold">Istimara</h2>
        {record.istimara ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>{record.istimara.number} · {formatDate(record.istimara.expiryDate)}</span>
            <Badge code={record.istimara.status.code} label={record.istimara.status.label} />
            {record.istimara.fileIds?.[0] ? <DocumentLink id={record.istimara.fileIds[0]} /> : null}
          </div>
        ) : <p className="mt-2 text-muted">No istimara recorded.</p>}
      </Panel>
      <Panel className="p-4 text-sm">
        <h2 className="font-semibold">Insurance</h2>
        {record.insurance ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>{record.insurance.insurer} {record.insurance.policyNumber} · Start {formatDate(record.insurance.startDate)} · Expiry {formatDate(record.insurance.endDate)}</span>
            <Badge code={record.insurance.status.code} label={record.insurance.status.label} />
            {record.insurance.fileIds?.[0] ? <DocumentLink id={record.insurance.fileIds[0]} /> : null}
          </div>
        ) : <p className="mt-2 text-muted">No policy recorded.</p>}
      </Panel>
      <Panel className="p-4 text-sm">
        <h2 className="font-semibold">Stored OCR Documents</h2>
        {storedDocs.length === 0 ? (
          <p className="mt-2 text-muted">No OCR documents uploaded for this vehicle yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {storedDocs.map((doc) => (
              <li key={doc.fileId} className="flex items-center justify-between gap-2">
                <span className="capitalize text-ink">
                  {doc.kind.replace("_", " ")} {doc.uploadedAt ? `(${formatDate(doc.uploadedAt)})` : ""}
                </span>
                <DocumentLink id={doc.fileId} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel className="p-4 text-sm">
        <h2 className="font-semibold">Vehicle photo</h2>
        <PlatePhoto fileId={record.vehiclePhotoId} empty="No vehicle photo." />
      </Panel>
      <Panel className="p-4 text-sm">
        <h2 className="font-semibold">Number plate photo</h2>
        <PlatePhoto fileId={record.platePhotoId} empty="No number plate photo." />
      </Panel>
      <Panel className="p-4 text-sm">
        <h2 className="font-semibold">Next service</h2>
        {record.maintenance.length === 0 ? <p className="mt-2 text-muted">No schedule recorded.</p> : null}
        <ul className="mt-2 space-y-2">
          {record.maintenance.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span>{item.serviceType}: {formatDate(item.nextDueDate)} or {formatKm(item.nextDueKm)}</span>
              <Badge code={item.status.code} label={item.status.label} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function PlatePhoto({ fileId, empty }: { fileId: string | null; empty: string }) {
  const photo = useQuery({
    queryKey: ["plate-photo", fileId],
    queryFn: () => api<{ data: { url: string } }>(`/files/${fileId}/url`),
    enabled: Boolean(fileId),
  });
  if (!fileId) return <p className="mt-2 text-muted">{empty}</p>;
  if (!photo.data) return <p className="mt-2 text-muted">Loading photo...</p>;
  return <img src={photo.data.data.url} alt="" className="mt-2 max-h-40 rounded-md border border-line object-cover" />;
}

function useList<T>(key: string, path: string) {
  return useQuery({ queryKey: [key], queryFn: () => api<ListResponse<T>>(path) });
}

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-sm text-status-danger">{error instanceof ApiError ? error.message : "Could not save"}</p>;
}

function MaintenanceTab({ vehicleId }: { vehicleId: string }) {
  const client = useQueryClient();
  const schedules = useList<{ id: string; serviceType: string; nextDueDate: string | null; nextDueKm: number; status: Status }>("schedules-" + vehicleId, `/maintenance/schedules?vehicleId=${vehicleId}`);
  const logs = useList<{ id: string; date: string; serviceType: string; workshop: string; odometerKm: number; cost: Money }>("logs-" + vehicleId, `/maintenance/logs?vehicleId=${vehicleId}`);
  const [form, setForm] = useState({ serviceType: "Oil change", intervalMonths: "6", intervalKm: "10000" });
  const [log, setLog] = useState({ date: "", odometerKm: "", serviceType: "Oil change", workshop: "", cost: "", scheduleId: "" });
  const [error, setError] = useState<unknown>(null);
  const saveSchedule = useMutation({
    mutationFn: () => api("/maintenance/schedules", { method: "POST", body: { vehicleId, ...form, intervalMonths: Number(form.intervalMonths), intervalKm: Number(form.intervalKm) } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["schedules-" + vehicleId] }),
    onError: setError,
  });
  const saveLog = useMutation({
    mutationFn: () => api("/maintenance/logs", { method: "POST", body: { vehicleId, ...log, odometerKm: Number(log.odometerKm), cost: Number(log.cost), scheduleId: log.scheduleId || undefined } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["logs-" + vehicleId] });
      void client.invalidateQueries({ queryKey: ["schedules-" + vehicleId] });
      void client.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
    },
    onError: setError,
  });
  return (
    <div className="space-y-4">
      <form className="grid gap-3 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] md:grid-cols-4" onSubmit={(event: FormEvent) => { event.preventDefault(); saveSchedule.mutate(); }}>
        <Field label="Service type"><TextInput value={form.serviceType} onChange={(event) => setForm({ ...form, serviceType: event.target.value })} required /></Field>
        <Field label="Every months"><TextInput value={form.intervalMonths} onChange={(event) => setForm({ ...form, intervalMonths: event.target.value })} required /></Field>
        <Field label="Every km"><TextInput value={form.intervalKm} onChange={(event) => setForm({ ...form, intervalKm: event.target.value })} required /></Field>
        <div className="flex items-end"><Button>Add schedule</Button></div>
      </form>
      <ErrorText error={error} />
      {schedules.data ? (
        <DataTable
          columns={["Service", "Next date", "Next km", "Status"]}
          rows={schedules.data.data.map((row) => [row.serviceType, formatDate(row.nextDueDate), formatKm(row.nextDueKm), <Badge key={row.id} code={row.status.code} label={row.status.label} />])}
        />
      ) : <StateMessage>Loading schedules...</StateMessage>}
      <form className="grid gap-3 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); saveLog.mutate(); }}>
        <Field label="Service date"><TextInput type="date" value={log.date} onChange={(event) => setLog({ ...log, date: event.target.value })} required /></Field>
        <Field label="Odometer"><TextInput value={log.odometerKm} onChange={(event) => setLog({ ...log, odometerKm: event.target.value })} required /></Field>
        <Field label="Cost (SAR)"><TextInput value={log.cost} onChange={(event) => setLog({ ...log, cost: event.target.value })} required /></Field>
        <Field label="Workshop"><TextInput value={log.workshop} onChange={(event) => setLog({ ...log, workshop: event.target.value })} /></Field>
        <Field label="Service type"><TextInput value={log.serviceType} onChange={(event) => setLog({ ...log, serviceType: event.target.value })} required /></Field>
        <Field label="Schedule">
          <SelectInput value={log.scheduleId} onChange={(event) => setLog({ ...log, scheduleId: event.target.value })}>
            <option value="">None</option>
            {schedules.data?.data.map((row) => <option key={row.id} value={row.id}>{row.serviceType}</option>)}
          </SelectInput>
        </Field>
        <div className="md:col-span-3"><Button>Log service</Button></div>
      </form>
      {logs.data ? (
        <DataTable
          columns={["Date", "Service", "Workshop", "Odometer", "Cost"]}
          rows={logs.data.data.map((row) => [formatDate(row.date as string), row.serviceType, row.workshop, formatKm(row.odometerKm), formatSar(row.cost)])}
        />
      ) : null}
    </div>
  );
}

function IstimaraTab({ vehicleId }: { vehicleId: string }) {
  const client = useQueryClient();
  const rows = useList<{ id: string; number: string; issueDate: string; expiryDate: string; status: Status; fileIds?: string[] }>("ist-" + vehicleId, `/istimara?vehicleId=${vehicleId}`);
  const [form, setForm] = useState({ number: "", issueDate: "", expiryDate: "" });
  const [fileId, setFileId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => api("/istimara", { method: "POST", body: { vehicleId, ...form, fileIds: fileId ? [fileId] : undefined } }),
    onSuccess: () => {
      setForm({ number: "", issueDate: "", expiryDate: "" });
      setFileId("");
      setError(null);
      void client.invalidateQueries({ queryKey: ["ist-" + vehicleId] });
      void client.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
    },
    onError: setError,
  });
  return (
    <div className="space-y-4">
      <DocumentCapture
        kind="istimara"
        vehicleId={vehicleId}
        onRead={(id, fields) => {
          setFileId(id);
          setError(null);
          setForm((current) => ({
            number: fields.number || current.number,
            issueDate: fields.issueDate || current.issueDate,
            expiryDate: fields.expiryDate || current.expiryDate,
          }));
        }}
      />
      <form className="grid gap-3 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <Field label="Number"><TextInput value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} required /></Field>
        <Field label="Issue date"><TextInput type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} required /></Field>
        <Field label="Expiry date"><TextInput type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} required /></Field>
        <div className="flex items-end"><Button disabled={save.isPending}>{save.isPending ? "Saving..." : "Add renewal"}</Button></div>
      </form>
      <ErrorText error={error} />
      {rows.data ? <DataTable columns={["Number", "Issued", "Expires", "Status", "Document"]} rows={rows.data.data.map((row) => [row.number, formatDate(row.issueDate), formatDate(row.expiryDate), <Badge key={row.id} code={row.status.code} label={row.status.label} />, row.fileIds?.[0] ? <DocumentLink key={`${row.id}-file`} id={row.fileIds[0]} /> : ""])} /> : <StateMessage>Loading istimara history...</StateMessage>}
    </div>
  );
}

function InsuranceTab({ vehicleId }: { vehicleId: string }) {
  const client = useQueryClient();
  const rows = useList<{ id: string; policyNumber: string; insurer: string; type: Status; endDate: string; premium: Money; status: Status; fileIds?: string[] }>("pol-" + vehicleId, `/insurance/policies?vehicleId=${vehicleId}`);
  const [form, setForm] = useState({ policyNumber: "", insurer: "", type: "comprehensive", startDate: "", endDate: "", premium: "" });
  const [fileId, setFileId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => api("/insurance/policies", { method: "POST", body: { vehicleId, ...form, premium: Number(form.premium), fileIds: fileId ? [fileId] : undefined } }),
    onSuccess: () => {
      setForm({ policyNumber: "", insurer: "", type: "comprehensive", startDate: "", endDate: "", premium: "" });
      setFileId("");
      setError(null);
      void client.invalidateQueries({ queryKey: ["pol-" + vehicleId] });
      void client.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
    },
    onError: setError,
  });
  return (
    <div className="space-y-4">
      <DocumentCapture
        kind="insurance"
        vehicleId={vehicleId}
        onRead={(id, fields) => {
          setFileId(id);
          setError(null);
          setForm((current) => ({
            policyNumber: fields.policyNumber || current.policyNumber,
            insurer: fields.insurer || current.insurer,
            type: fields.type === "comprehensive" || fields.type === "third_party" ? fields.type : current.type,
            startDate: fields.startDate || current.startDate,
            endDate: fields.endDate || current.endDate,
            premium: fields.premium || current.premium,
          }));
        }}
      />
      <form className="grid gap-3 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <Field label="Policy number"><TextInput value={form.policyNumber} onChange={(event) => setForm({ ...form, policyNumber: event.target.value })} required /></Field>
        <Field label="Insurer"><TextInput value={form.insurer} onChange={(event) => setForm({ ...form, insurer: event.target.value })} required /></Field>
        <Field label="Type">
          <SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="comprehensive">Comprehensive</option>
            <option value="third_party">Third party</option>
          </SelectInput>
        </Field>
        <Field label="Start"><TextInput type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required /></Field>
        <Field label="End"><TextInput type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></Field>
        <Field label="Premium (SAR)"><TextInput value={form.premium} onChange={(event) => setForm({ ...form, premium: event.target.value })} required /></Field>
        <div><Button disabled={save.isPending}>{save.isPending ? "Saving..." : "Add policy"}</Button></div>
      </form>
      <ErrorText error={error} />
      {rows.data ? <DataTable columns={["Policy", "Insurer", "Type", "End", "Premium", "Status", "Document"]} rows={rows.data.data.map((row) => [row.policyNumber, row.insurer, row.type.label, formatDate(row.endDate), formatSar(row.premium), <Badge key={row.id} code={row.status.code} label={row.status.label} />, row.fileIds?.[0] ? <DocumentLink key={`${row.id}-file`} id={row.fileIds[0]} /> : ""])} /> : <StateMessage>Loading policies...</StateMessage>}
    </div>
  );
}

function EmiTab({ vehicleId }: { vehicleId: string }) {
  const client = useQueryClient();
  const plans = useList<{ id: string; bank: string; interestRate: number; monthlyAmount: Money; balloonAmount: Money; totalPaid: Money; remaining: Money; nextDue: string | null; startDate: string | null; tenureMonths: number; installmentCount: number; installmentsLeft: number; status: Status; vehicleId: string }>("emi-" + vehicleId, `/emi/plans?vehicleId=${vehicleId}`);
  const [form, setForm] = useState({ bank: "", emiAmount: "", balloonAmount: "0", interestRate: "0", tenureMonths: "36", startDate: "", dueDay: "1" });
  const [error, setError] = useState<unknown>(null);
  const locked = plans.data?.data.some((plan) => plan.installmentsLeft < plan.installmentCount) ?? false;
  const tenure = Number(form.tenureMonths);
  const preview = emiSchedule(Number(form.emiAmount), Number(form.balloonAmount || 0), tenure);
  const remaining = monthsRemaining(form.startDate, tenure);
  const save = useMutation({
    mutationFn: () => api("/emi/plans", { method: "POST", body: { vehicleId, bank: form.bank, emiAmount: Number(form.emiAmount), balloonAmount: Number(form.balloonAmount || 0), interestRate: Number(form.interestRate || 0), tenureMonths: Number(form.tenureMonths), startDate: form.startDate, dueDay: Number(form.dueDay) } }),
    onSuccess: async () => {
      setForm({ bank: "", emiAmount: "", balloonAmount: "0", interestRate: "0", tenureMonths: "36", startDate: "", dueDay: "1" });
      setError(null);
      await client.invalidateQueries({ queryKey: ["emi-" + vehicleId] });
      await client.invalidateQueries({ queryKey: ["emi-list"] });
    },
    onError: setError,
  });
  return (
    <div className="space-y-4">
      {locked ? <StateMessage>Payments are already recorded, so this schedule stays as it is.</StateMessage> : (
        <form className="grid gap-3 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <Field label="Bank"><TextInput value={form.bank} onChange={(event) => setForm({ ...form, bank: event.target.value })} required /></Field>
          <Field label="EMI amount (SAR)"><TextInput value={form.emiAmount} onChange={(event) => setForm({ ...form, emiAmount: event.target.value })} required /></Field>
          <Field label="Balloon amount (SAR)"><TextInput value={form.balloonAmount} onChange={(event) => setForm({ ...form, balloonAmount: event.target.value })} /></Field>
          <Field label="Interest % per year"><TextInput value={form.interestRate} onChange={(event) => setForm({ ...form, interestRate: event.target.value })} required /></Field>
          <Field label="Tenure (months)"><TextInput value={form.tenureMonths} onChange={(event) => setForm({ ...form, tenureMonths: event.target.value })} required /></Field>
          <Field label="Start date"><DateField value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate })} /></Field>
          <Field label="Months remaining"><TextInput value={remaining == null ? "" : String(remaining)} disabled readOnly /></Field>
          <Field label="Due day (1 to 28)"><TextInput value={form.dueDay} onChange={(event) => setForm({ ...form, dueDay: event.target.value })} required /></Field>
          <div className="flex items-end"><Button disabled={!preview || !form.startDate || !form.bank.trim() || save.isPending}>{plans.data?.data.length ? "Replace schedule" : "Create schedule"}</Button></div>
          {preview ? <p className="text-sm text-muted md:col-span-3">EMI {formatSar({ halalas: preview.monthlyHalalas })} for {tenure} months.{preview.balloonHalalas > 0 ? ` Balloon ${formatSar({ halalas: preview.balloonHalalas })} after the monthly payments.` : ""}{remaining == null ? "" : ` ${remaining} months remaining.`} <span className="font-semibold text-ink">Total {formatSar({ halalas: preview.totalHalalas })}.</span></p> : null}
        </form>
      )}
      <ErrorText error={error} />
      {plans.data?.data.map((plan) => <Installments key={plan.id} plan={plan} vehicleId={vehicleId} />)}
      {plans.data?.data.length === 0 ? <StateMessage>No EMI plan for this vehicle.</StateMessage> : null}
    </div>
  );
}

function Installments({ plan, vehicleId }: { plan: { id: string; bank: string; monthlyAmount: Money; balloonAmount: Money; totalPaid: Money; remaining: Money; nextDue: string | null; startDate: string | null; tenureMonths: number; installmentsLeft: number; status: Status }; vehicleId: string }) {
  const client = useQueryClient();
  const rows = useQuery({ queryKey: ["inst", plan.id], queryFn: () => api<{ data: Array<{ id: string; seq: number; dueDate: string; amount: Money; status: Status }> }>(`/emi/plans/${plan.id}/installments`) });
  const mark = useMutation({
    mutationFn: (input: { id: string; status: "paid" | "unpaid" }) => api(`/emi/installments/${input.id}`, { method: "PATCH", body: { status: input.status } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["inst", plan.id] });
      await client.invalidateQueries({ queryKey: ["emi-" + vehicleId] });
      await client.invalidateQueries({ queryKey: ["emi-list"] });
    },
  });
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{plan.bank}</p>
        <Badge code={plan.status.code} label={plan.status.label} />
      </div>
      <p className="mt-1 text-sm text-muted">EMI {formatSar(plan.monthlyAmount)}. Balloon {formatSar(plan.balloonAmount)}. {monthsRemaining(plan.startDate ?? "", plan.tenureMonths) ?? 0} months remaining. Paid {formatSar(plan.totalPaid)}. Remaining {formatSar(plan.remaining)}. Next due {formatDate(plan.nextDue) || "None"}. {plan.installmentsLeft} left.</p>
      {mark.isError ? <p className="mt-2 text-sm text-status-danger">Could not update this installment.</p> : null}
      {rows.data ? (
        <div className="mt-3">
          <DataTable
            columns={["#", "Due", "Amount", "Status", ""]}
            rows={rows.data.data.map((row) => [
              row.seq,
              formatDate(row.dueDate),
              formatSar(row.amount),
              <Badge key={row.id} code={row.status.code} label={row.status.label} />,
              row.status.code === "unpaid" ? (
                <Button key={`${row.id}-pay`} variant="secondary" disabled={mark.isPending} onClick={() => mark.mutate({ id: row.id, status: "paid" })}>
                  {mark.isPending && mark.variables?.id === row.id ? "Saving..." : "Mark paid"}
                </Button>
              ) : (
                <Button key={`${row.id}-unpay`} variant="secondary" disabled={mark.isPending} onClick={() => mark.mutate({ id: row.id, status: "unpaid" })}>
                  {mark.isPending && mark.variables?.id === row.id ? "Saving..." : "Mark unpaid"}
                </Button>
              ),
            ])}
          />
        </div>
      ) : null}
    </Panel>
  );
}

function FuelTab({ vehicleId }: { vehicleId: string }) {
  return <SimpleLog vehicleId={vehicleId} path="/fuel" columns={["Date", "Liters", "Cost", "Odometer", "Approval"]} map={(row) => [formatDate(row.date as string), String(row.liters), formatSar(row.cost as Money), formatKm(row.odometerKm as number), (row.approvalStatus as Status).label]} fields={[["date", "Date", "date"], ["liters", "Liters", "text"], ["cost", "Cost (SAR)", "text"], ["odometerKm", "Odometer", "text"], ["station", "Station", "text"]]} />;
}
function ViolationTab({ vehicleId }: { vehicleId: string }) {
  return <SimpleLog vehicleId={vehicleId} path="/violations" columns={["Date", "Number", "Type", "Amount", "Status"]} map={(row) => [formatDate(row.date as string), String(row.number), String(row.type), formatSar(row.amount as Money), (row.status as Status).label]} fields={[["date", "Date", "date"], ["number", "Number", "text"], ["type", "Type", "text"], ["amount", "Amount (SAR)", "text"]]} />;
}
function TripTab({ vehicleId }: { vehicleId: string }) {
  return <SimpleLog vehicleId={vehicleId} path="/trips" columns={["Date", "From", "To", "Distance"]} map={(row) => [formatDate(row.date as string), String(row.startLocation), String(row.endLocation), formatKm(row.distanceKm as number)]} fields={[["date", "Date", "date"], ["startLocation", "Start", "text"], ["endLocation", "End", "text"], ["startKm", "Start km", "text"], ["endKm", "End km", "text"], ["purpose", "Purpose", "text"]]} />;
}
function ExpenseTab({ vehicleId }: { vehicleId: string }) {
  return <SimpleLog vehicleId={vehicleId} path="/expenses" columns={["Date", "Category", "Amount"]} map={(row) => [formatDate(row.date as string), (row.category as Status).label, formatSar(row.amount as Money)]} fields={[["date", "Date", "date"], ["amount", "Amount (SAR)", "text"], ["notes", "Notes", "text"]]} />;
}

function SimpleLog({
  vehicleId,
  path,
  columns,
  map,
  fields,
}: {
  vehicleId: string;
  path: string;
  columns: string[];
  map: (row: Record<string, unknown>) => Array<string>;
  fields: Array<[string, string, string]>;
}) {
  const client = useQueryClient();
  const rows = useQuery({ queryKey: [path, vehicleId], queryFn: () => api<ListResponse<Record<string, unknown>>>(`${path}?vehicleId=${vehicleId}`) });
  const [form, setForm] = useState<Record<string, string>>({ category: "tolls" });
  const [error, setError] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { vehicleId, category: form.category || undefined };
      for (const [key] of fields) {
        const value = form[key];
        body[key] = ["liters", "cost", "odometerKm", "amount", "startKm", "endKm"].includes(key) ? Number(value) : value;
      }
      return api(path, { method: "POST", body });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [path, vehicleId] }),
    onError: setError,
  });
  return (
    <div className="space-y-4">
      <form className="grid gap-3 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        {path === "/expenses" ? (
          <Field label="Category">
            <SelectInput value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {["tolls", "parking", "washing", "tires", "spare_parts", "fines", "other"].map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectInput>
          </Field>
        ) : null}
        {fields.map(([key, label, type]) => (
          <Field key={key} label={label}>
            <TextInput type={type === "date" ? "date" : "text"} value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key !== "station" && key !== "purpose" && key !== "notes"} />
          </Field>
        ))}
        <div className="flex items-end"><Button>Save</Button></div>
      </form>
      <ErrorText error={error} />
      {rows.isLoading ? <StateMessage>Loading records...</StateMessage> : null}
      {rows.data?.data.length === 0 ? <StateMessage>No records yet.</StateMessage> : null}
      {rows.data && rows.data.data.length > 0 ? <DataTable columns={columns} rows={rows.data.data.map((row) => map(row))} /> : null}
    </div>
  );
}

function HandoverTab({ vehicleId }: { vehicleId: string }) {
  const rows = useQuery({
    queryKey: ["handover", vehicleId],
    queryFn: () => api<{ data: Array<{ id: string; date: string; odometerKm: number; fuelLevel: string; notes: string }> }>(`/vehicles/${vehicleId}/handovers`),
  });
  if (rows.isLoading) return <StateMessage>Loading handovers...</StateMessage>;
  if (!rows.data?.data.length) return <StateMessage>No handover records yet. Assign a new driver from the Drivers page to create one.</StateMessage>;
  return <DataTable columns={["Date", "Odometer", "Fuel", "Notes"]} rows={rows.data.data.map((row) => [formatDate(row.date as string), formatKm(row.odometerKm), row.fuelLevel, row.notes])} />;
}
