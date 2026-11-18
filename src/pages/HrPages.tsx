import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Panel,
  PhoneInput,
  SelectInput,
  StateMessage,
  Tabs,
  TextArea,
  TextInput,
  linkClass,
} from "../components/ui";
import { ApiError, api, download } from "../lib/api";

type StatusObj = { code: string; label: string };
type MoneyObj = { halalas: number; sar: number };

type HrDashboardData = {
  totalHeadcount: number;
  byStatus: {
    active?: number;
    probation?: number;
    on_leave?: number;
    terminated?: number;
  };
  byNationality: Array<{ nationality: string; count: number }>;
  documentWindows: {
    expired: number;
    within30Days: number;
    within60Days: number;
    within90Days: number;
  };
  upcomingExpiries: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    employeeNumber: string;
    docType: string;
    expiryDate: string | null;
    daysLeft: number;
    status: StatusObj;
  }>;
  probationEndingSoon: Array<{
    id: string;
    employeeNumber: string;
    nameEn: string;
    department: string;
    probationEndDate: string | null;
    daysLeft: number;
  }>;
  contractsEndingSoon: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    employeeNumber: string;
    position: string;
    endDate: string | null;
    daysLeft: number;
  }>;
};

type EmployeeDto = {
  id: string;
  employeeNumber: string;
  nameEn: string;
  nameAr: string;
  nationality: string;
  gender: string;
  dateOfBirth: string | null;
  jobTitle: string;
  department: string;
  branch: string;
  employmentStatus: StatusObj | string;
  joinDate: string | null;
  probationEndDate: string | null;
  mobileMasked: string;
  mobile?: string;
  email: string;
  iqamaMasked: string;
  iqamaNumber?: string;
  iqamaExpiry: string | null;
  iqamaStatus: StatusObj | null;
  passportMasked: string;
  passportNumber?: string;
  passportExpiry: string | null;
  passportStatus?: StatusObj | null;
  borderNumberMasked: string;
  emergencyContact?: { name: string; relation: string; mobile: string };
  customFields?: Record<string, unknown>;
};

type LookupItem = { id: string; kind: "department" | "branch" | "job_title"; name: string; code: string };

function formatSar(amount: number | MoneyObj | undefined | null) {
  const val = typeof amount === "object" && amount !== null ? amount.sar : Number(amount ?? 0);
  return `SAR ${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeStatus(status: StatusObj | string | undefined | null): StatusObj {
  if (!status) return { code: "valid", label: "Active" };
  if (typeof status === "object") return status;
  if (status === "active") return { code: "valid", label: "Active" };
  if (status === "probation") return { code: "expiring", label: "Probation" };
  if (status === "on_leave") return { code: "expiring", label: "On leave" };
  if (status === "suspended") return { code: "expiring", label: "Suspended" };
  return { code: "expired", label: "Terminated" };
}

export function HrDashboardPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const dashboard = useQuery({
    queryKey: ["hr-dashboard"],
    queryFn: () => api<{ data: HrDashboardData }>("/hr/dashboard"),
  });
  const lookups = useQuery({
    queryKey: ["hr-lookups"],
    queryFn: () => api<{ data: LookupItem[] }>("/hr/lookups"),
  });

  const [showLookups, setShowLookups] = useState(() => searchParams.get("lookups") === "open");
  useEffect(() => {
    setShowLookups(searchParams.get("lookups") === "open");
  }, [searchParams]);
  const [lookupKind, setLookupKind] = useState<"department" | "branch" | "job_title">("department");
  const [lookupName, setLookupName] = useState("");
  const [lookupCode, setLookupCode] = useState("");

  const addLookup = useMutation({
    mutationFn: (body: { kind: string; name: string; code: string }) =>
      api("/hr/lookups", { method: "POST", body }),
    onSuccess: () => {
      setLookupName("");
      setLookupCode("");
      void qc.invalidateQueries({ queryKey: ["hr-lookups"] });
    },
  });

  const removeLookup = useMutation({
    mutationFn: (id: string) => api(`/hr/lookups/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-lookups"] }),
  });

  if (dashboard.isLoading) return <StateMessage>Loading HR dashboard...</StateMessage>;
  if (dashboard.isError || !dashboard.data?.data) {
    return (
      <ErrorState
        title="Could not load HR dashboard"
        detail={dashboard.error instanceof ApiError ? dashboard.error.message : "Check that the HR module is enabled."}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const d = dashboard.data.data;
  const byStatus = d.byStatus ?? {};
  const windows = d.documentWindows ?? { expired: 0, within30Days: 0, within60Days: 0, within90Days: 0 };
  const upcomingExpiries = d.upcomingExpiries ?? [];
  const byNationality = d.byNationality ?? [];
  const probationEndingSoon = d.probationEndingSoon ?? [];
  const contractsEndingSoon = d.contractsEndingSoon ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Dashboard"
        description="Employee headcount, compliance document expiries, probation periods, and employment contracts."
      >
        <Button variant="secondary" type="button" onClick={() => setShowLookups((v) => !v)}>
          {showLookups ? "Hide HR Lookups" : "Departments & Lookups"}
        </Button>
        <Link
          to="/hr/employees"
          className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong"
        >
          View Employees
        </Link>
      </PageHeader>

      {showLookups ? (
        <Panel className="p-4 space-y-4">
          <h2 className="text-base font-semibold text-ink">Departments, Branches & Job Titles</h2>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!lookupName.trim()) return;
              addLookup.mutate({ kind: lookupKind, name: lookupName.trim(), code: lookupCode.trim() });
            }}
          >
            <Field label="Type">
              <SelectInput value={lookupKind} onChange={(e) => setLookupKind(e.target.value as any)}>
                <option value="department">Department</option>
                <option value="branch">Branch</option>
                <option value="job_title">Job title</option>
              </SelectInput>
            </Field>
            <Field label="Name">
              <TextInput value={lookupName} onChange={(e) => setLookupName(e.target.value)} placeholder="e.g. Heavy Operations" required />
            </Field>
            <Field label="Code">
              <TextInput value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} placeholder="e.g. OPS-02" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={addLookup.isPending}>
                {addLookup.isPending ? "Saving..." : "Add Lookup"}
              </Button>
            </div>
          </form>
          <DataTable
            columns={["Type", "Name", "Code", "Action"]}
            rows={(lookups.data?.data ?? []).map((item) => [
              item.kind.replace("_", " ").toUpperCase(),
              item.name,
              item.code || "-",
              <Button
                key={item.id}
                variant="ghost"
                className="h-8 px-2 text-xs text-status-danger"
                onClick={() => removeLookup.mutate(item.id)}
              >
                Remove
              </Button>,
            ])}
          />
        </Panel>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Total Headcount</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{d.totalHeadcount ?? 0}</p>
          <p className="mt-1 text-xs text-muted">
            Active: {byStatus.active ?? 0} | Probation: {byStatus.probation ?? 0} | On leave: {byStatus.on_leave ?? 0}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Docs Expiring (30 Days)</p>
          <p className="mt-2 text-2xl font-semibold text-status-danger">
            {(windows.expired ?? 0) + (windows.within30Days ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Expired: {windows.expired ?? 0} | 60d: {windows.within60Days ?? 0} | 90d: {windows.within90Days ?? 0}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Probation Ending (30d)</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{probationEndingSoon.length}</p>
          <p className="mt-1 text-xs text-muted">Employees in final 30 days of probation</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Contracts Ending (60d)</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{contractsEndingSoon.length}</p>
          <p className="mt-1 text-xs text-muted">Fixed-term renewals upcoming</p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-base font-semibold text-ink">Documents Expiring Within 90 Days</h2>
          <DataTable
            columns={["Employee", "Doc Type", "Expiry Date", "Remaining", "Status"]}
            rows={upcomingExpiries.map((doc) => [
              <Link key={doc.id} to={`/hr/employees/${doc.employeeId}`} className={linkClass}>
                {doc.employeeName} ({doc.employeeNumber})
              </Link>,
              doc.docType,
              doc.expiryDate || "-",
              `${doc.daysLeft}d`,
              <Badge key={doc.id} code={doc.status?.code} label={doc.status?.label || "Valid"} />,
            ])}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Headcount by Nationality</h2>
          <DataTable
            columns={["Nationality", "Employees"]}
            rows={byNationality.map((row) => [row.nationality, String(row.count)])}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Probation Ending Within 30 Days</h2>
          <DataTable
            columns={["Employee", "Department", "Probation End", "Days Left"]}
            rows={probationEndingSoon.map((emp) => [
              <Link key={emp.id} to={`/hr/employees/${emp.id}`} className={linkClass}>
                {emp.nameEn} ({emp.employeeNumber})
              </Link>,
              emp.department || "-",
              emp.probationEndDate || "-",
              `${emp.daysLeft}d`,
            ])}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Fixed-Term Contracts Ending Within 60 Days</h2>
          <DataTable
            columns={["Employee", "Position", "End Date", "Days Left"]}
            rows={contractsEndingSoon.map((c) => [
              <Link key={c.id} to={`/hr/employees/${c.employeeId}`} className={linkClass}>
                {c.employeeName} ({c.employeeNumber})
              </Link>,
              c.position || "-",
              c.endDate || "-",
              `${c.daysLeft}d`,
            ])}
          />
        </div>
      </div>
    </div>
  );
}

export function EmployeesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [nationality, setNationality] = useState("");
  const [department, setDepartment] = useState("");
  const [expiringWithinDays, setExpiringWithinDays] = useState(() => searchParams.get("expiring") ?? "");

  const [showColumns, setShowColumns] = useState(false);
  const [cols, setCols] = useState({
    nationality: true,
    department: true,
    branch: false,
    joinDate: true,
  });

  const [showCreate, setShowCreate] = useState(() => searchParams.get("action") === "new");
  const [showImport, setShowImport] = useState(() => searchParams.get("action") === "import");

  useEffect(() => {
    setShowCreate(searchParams.get("action") === "new");
    setShowImport(searchParams.get("action") === "import");
    setExpiringWithinDays(searchParams.get("expiring") ?? "");
  }, [searchParams]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    employeeNumber: "",
    nameEn: "",
    nameAr: "",
    nationality: "Saudi Arabia",
    gender: "male",
    jobTitle: "",
    department: "Operations",
    branch: "Riyadh HQ",
    employmentStatus: "active",
    joinDate: new Date().toISOString().slice(0, 10),
    probationEndDate: "",
    mobile: "+9665",
    email: "",
    iqamaNumber: "",
    iqamaExpiry: "",
    passportNumber: "",
    passportExpiry: "",
  });

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  if (nationality.trim()) params.set("nationality", nationality.trim());
  if (department.trim()) params.set("department", department.trim());
  if (expiringWithinDays) params.set("expiringWithinDays", expiringWithinDays);

  const employees = useQuery({
    queryKey: ["hr-employees", params.toString()],
    queryFn: () => api<{ data: EmployeeDto[]; meta: { total: number } }>(`/hr/employees?${params.toString()}`),
  });

  const lookups = useQuery({
    queryKey: ["hr-lookups"],
    queryFn: () => api<{ data: LookupItem[] }>("/hr/lookups"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ data: EmployeeDto }>("/hr/employees", {
        method: "POST",
        body: {
          ...form,
          probationEndDate: form.probationEndDate || undefined,
          passportNumber: form.passportNumber || undefined,
          passportExpiry: form.passportExpiry || undefined,
        },
      }),
    onSuccess: () => {
      setShowCreate(false);
      setFormError("");
      void qc.invalidateQueries({ queryKey: ["hr-employees"] });
      void qc.invalidateQueries({ queryKey: ["hr-dashboard"] });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof ApiError ? err.message : "Failed to create employee");
    },
  });

  const previewImportMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!importFile) throw new Error("Choose an Excel file first");
      const fd = new FormData();
      fd.append("file", importFile);
      return api<{ data: any }>(`/hr/employees/import?dryRun=${dryRun ? "true" : "false"}`, {
        method: "POST",
        form: fd,
      });
    },
    onSuccess: (res, dryRun) => {
      if (dryRun) {
        setImportPreview(res.data);
      } else {
        setShowImport(false);
        setImportPreview(null);
        setImportFile(null);
        void qc.invalidateQueries({ queryKey: ["hr-employees"] });
        void qc.invalidateQueries({ queryKey: ["hr-dashboard"] });
      }
    },
  });

  const departments = (lookups.data?.data ?? []).filter((l) => l.kind === "department");
  const branches = (lookups.data?.data ?? []).filter((l) => l.kind === "branch");

  const tableColumns = [
    "Emp #",
    "Name",
    ...(cols.nationality ? ["Nationality"] : []),
    "Job Title",
    ...(cols.department ? ["Department"] : []),
    ...(cols.branch ? ["Branch"] : []),
    "Iqama / ID",
    "Iqama Expiry",
    "Mobile",
    ...(cols.joinDate ? ["Join Date"] : []),
    "Status",
  ];

  const rows = (employees.data?.data ?? []).map((emp) => {
    const empBadge = normalizeStatus(emp.employmentStatus);
    return [
      <Link key={emp.id} to={`/hr/employees/${emp.id}`} className={linkClass}>
        {emp.employeeNumber}
      </Link>,
      <div key={`${emp.id}-name`}>
        <Link to={`/hr/employees/${emp.id}`} className="font-medium text-ink hover:text-brand-deep">
          {emp.nameEn}
        </Link>
        {emp.nameAr ? <p className="text-xs text-muted">{emp.nameAr}</p> : null}
      </div>,
      ...(cols.nationality ? [emp.nationality || "-"] : []),
      emp.jobTitle || "-",
      ...(cols.department ? [emp.department || "-"] : []),
      ...(cols.branch ? [emp.branch || "-"] : []),
      emp.iqamaMasked,
      emp.iqamaStatus ? (
        <div key={`${emp.id}-iq`} className="flex items-center gap-1.5">
          <span>{emp.iqamaExpiry}</span>
          <Badge code={emp.iqamaStatus.code} label={emp.iqamaStatus.label} />
        </div>
      ) : (
        emp.iqamaExpiry || "-"
      ),
      emp.mobileMasked,
      ...(cols.joinDate ? [emp.joinDate || "-"] : []),
      <Badge key={`${emp.id}-st`} code={empBadge.code} label={empBadge.label} />,
    ];
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employees"
        description="Manage employee records, identity documents, sponsorship, contracts, and salary structures."
      >
        <Button variant="secondary" type="button" onClick={() => setShowColumns((v) => !v)}>
          Columns
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => void download(`/hr/employees/export.xlsx?${params.toString()}`, "employees.xlsx")}
        >
          Export Excel
        </Button>
        <Button variant="secondary" type="button" onClick={() => setShowImport((v) => !v)}>
          Bulk Import
        </Button>
        <Button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Close Form" : "Add Employee"}
        </Button>
      </PageHeader>

      {showColumns ? (
        <Panel className="p-4 flex flex-wrap gap-4 items-center text-sm">
          <span className="font-medium text-ink">Visible columns:</span>
          {(["nationality", "department", "branch", "joinDate"] as const).map((key) => (
            <label key={key} className="inline-flex items-center gap-2 text-ink">
              <input
                type="checkbox"
                checked={cols[key]}
                onChange={(e) => setCols((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              {key === "joinDate" ? "Join Date" : key.charAt(0).toUpperCase() + key.slice(1)}
            </label>
          ))}
        </Panel>
      ) : null}

      {showImport ? (
        <Panel className="p-4 space-y-4">
          <h2 className="text-base font-semibold text-ink">Bulk Import Employees from Excel (.xlsx)</h2>
          <p className="text-xs text-muted">
            Expected columns: Employee #, Name (EN), Name (AR), Nationality, Gender, Job Title, Department, Branch, Join Date, Mobile, Email, Iqama / ID, Iqama Expiry.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null);
                setImportPreview(null);
              }}
              className="text-sm text-ink"
            />
            <Button
              variant="secondary"
              type="button"
              disabled={!importFile || previewImportMutation.isPending}
              onClick={() => previewImportMutation.mutate(true)}
            >
              Validate & Preview
            </Button>
            {importPreview && importPreview.validCount > 0 ? (
              <Button
                type="button"
                disabled={previewImportMutation.isPending}
                onClick={() => previewImportMutation.mutate(false)}
              >
                Import {importPreview.validCount} Valid Rows
              </Button>
            ) : null}
          </div>
          {importPreview ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ink">
                Total rows: {importPreview.totalRows} | Valid: {importPreview.validCount} | Errors: {importPreview.invalidCount ?? 0}
              </p>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {showCreate ? (
        <Panel className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-ink">New Employee Record</h2>
          {formError ? <p className="text-sm text-status-danger">{formError}</p> : null}
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <Field label="Employee Number">
              <TextInput
                value={form.employeeNumber}
                onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })}
                placeholder="EMP-0010"
                required
              />
            </Field>
            <Field label="Name (English, as on Iqama)">
              <TextInput
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                placeholder="Mohammed Al-Qahtani"
                required
              />
            </Field>
            <Field label="Name (Arabic)">
              <TextInput
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                placeholder="محمد القحطاني"
              />
            </Field>
            <Field label="Nationality">
              <TextInput
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                required
              />
            </Field>
            <Field label="Iqama / National ID (10 digits)">
              <TextInput
                value={form.iqamaNumber}
                onChange={(e) => setForm({ ...form, iqamaNumber: e.target.value })}
                placeholder="2456789012"
                required
              />
            </Field>
            <Field label="Iqama Expiry Date">
              <TextInput
                type="date"
                value={form.iqamaExpiry}
                onChange={(e) => setForm({ ...form, iqamaExpiry: e.target.value })}
                required
              />
            </Field>
            <Field label="Mobile">
              <PhoneInput
                value={form.mobile}
                onChange={(mobile) => setForm({ ...form, mobile })}
                required
              />
            </Field>
            <Field label="Email">
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="employee@company.sa"
              />
            </Field>
            <Field label="Job Title">
              <TextInput
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                placeholder="Heavy Truck Driver"
              />
            </Field>
            <Field label="Department">
              <SelectInput value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Branch">
              <SelectInput value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Join Date">
              <TextInput
                type="date"
                value={form.joinDate}
                onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
                required
              />
            </Field>
            <Field label="Probation End Date (optional)">
              <TextInput
                type="date"
                value={form.probationEndDate}
                onChange={(e) => setForm({ ...form, probationEndDate: e.target.value })}
              />
            </Field>
            <Field label="Passport Number (optional)">
              <TextInput
                value={form.passportNumber}
                onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
              />
            </Field>
            <Field label="Passport Expiry (optional)">
              <TextInput
                type="date"
                value={form.passportExpiry}
                onChange={(e) => setForm({ ...form, passportExpiry: e.target.value })}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save Employee"}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {employees.data && (rows.length > 0 || Boolean(q || status || department || nationality || expiringWithinDays)) ? (
      <Panel className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, Emp #, Iqama, mobile..."
          />
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="on_leave">On leave</option>
            <option value="terminated">Terminated</option>
          </SelectInput>
          <SelectInput value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </SelectInput>
          <TextInput
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            placeholder="Filter nationality..."
          />
          <SelectInput value={expiringWithinDays} onChange={(e) => setExpiringWithinDays(e.target.value)}>
            <option value="">All document states</option>
            <option value="30">Docs expiring in 30 days</option>
            <option value="60">Docs expiring in 60 days</option>
            <option value="90">Docs expiring in 90 days</option>
          </SelectInput>
        </div>
      </Panel>
      ) : null}

      {employees.isLoading ? (
        <StateMessage>Loading employees...</StateMessage>
      ) : employees.isError ? (
        <ErrorState
          title="Could not load employees"
          detail={employees.error instanceof ApiError ? employees.error.message : "Failed to fetch employee list."}
          onRetry={() => void employees.refetch()}
        />
      ) : rows.length === 0 ? (
        q || status || department || nationality || expiringWithinDays ? (
          <EmptyState
            title="No employees match these filters"
            detail="Try clearing or adjusting your search filters."
          />
        ) : (
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            title="Add employees and manage HR records"
            detail="Register staff profiles to track iqamas, passports, contracts, attendance, and payroll."
            action={<Button onClick={() => setShowCreate(true)}>Add Employee</Button>}
          />
        )
      ) : (
        <DataTable columns={tableColumns} rows={rows} />
      )}
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState("details");

  const detail = useQuery({
    queryKey: ["hr-employee", id],
    queryFn: () =>
      api<{
        data: {
          employee: EmployeeDto;
          documents: Array<{
            id: string;
            docType: string;
            label?: string;
            number: string;
            issueDate: string | null;
            expiryDate: string;
            isCurrent?: boolean;
            status: StatusObj;
          }>;
          sponsorship: {
            sponsorName: string;
            sponsorFileNumber: string;
            qiwaReference: string;
            muqeemReference: string;
            currentStatus: StatusObj | string;
            transferHistory: Array<{
              fromSponsor: string;
              toSponsor: string;
              transferDate: string | null;
              referenceNumber?: string;
              notes: string;
            }>;
          } | null;
          contracts: Array<{
            id: string;
            version: number;
            contractType: StatusObj | string;
            position: string;
            startDate: string | null;
            endDate: string | null;
            probationDays: number;
            noticePeriodDays: number;
            workingHoursPerWeek: number;
            isCurrent: boolean;
            notes: string;
          }>;
          events: Array<{
            id: string;
            type: string;
            eventDate: string | null;
            title: string;
            notes: string;
          }>;
          salaries: Array<{
            id: string;
            effectiveDate: string | null;
            basic: MoneyObj;
            housing: MoneyObj;
            transport: MoneyObj;
            otherAllowances: MoneyObj;
            total: MoneyObj;
            commissionRule: string;
            bankCode: string;
            ibanMasked: string;
            paymentMethod: string;
            isCurrent: boolean;
            notes: string;
          }> | null;
        };
      }>(`/hr/employees/${id}`),
    enabled: Boolean(id),
  });

  // Document form
  const [docForm, setDocForm] = useState({
    docType: "iqama",
    number: "",
    issueDate: "",
    expiryDate: "",
    notes: "",
  });
  const addDoc = useMutation({
    mutationFn: () =>
      api(`/hr/employees/${id}/documents`, {
        method: "POST",
        body: { ...docForm, issueDate: docForm.issueDate || undefined },
      }),
    onSuccess: () => {
      setDocForm({ docType: "iqama", number: "", issueDate: "", expiryDate: "", notes: "" });
      void qc.invalidateQueries({ queryKey: ["hr-employee", id] });
    },
  });

  // Sponsorship form
  const [sponsorForm, setSponsorForm] = useState({
    sponsorName: "",
    sponsorFileNumber: "",
    qiwaReference: "",
    muqeemReference: "",
    currentStatus: "under_company",
    fromSponsor: "",
    toSponsor: "",
    transferDate: "",
    referenceNumber: "",
  });
  const saveSponsor = useMutation({
    mutationFn: () =>
      api(`/hr/employees/${id}/sponsorship`, {
        method: "PUT",
        body: {
          sponsorName: sponsorForm.sponsorName || detail.data?.data.sponsorship?.sponsorName || "Main Establishment",
          sponsorFileNumber: sponsorForm.sponsorFileNumber || detail.data?.data.sponsorship?.sponsorFileNumber || "",
          qiwaReference: sponsorForm.qiwaReference || detail.data?.data.sponsorship?.qiwaReference || "",
          muqeemReference: sponsorForm.muqeemReference || detail.data?.data.sponsorship?.muqeemReference || "",
          currentStatus: sponsorForm.currentStatus,
          newTransfer:
            sponsorForm.fromSponsor && sponsorForm.toSponsor && sponsorForm.transferDate
              ? {
                  fromSponsor: sponsorForm.fromSponsor,
                  toSponsor: sponsorForm.toSponsor,
                  transferDate: sponsorForm.transferDate,
                  referenceNumber: sponsorForm.referenceNumber,
                }
              : undefined,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-employee", id] }),
  });

  // Contract form
  const [contractForm, setContractForm] = useState({
    contractType: "fixed",
    position: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    probationDays: "90",
    noticePeriodDays: "60",
    workingHoursPerWeek: "48",
    notes: "",
  });
  const addContract = useMutation({
    mutationFn: () =>
      api(`/hr/employees/${id}/contracts`, {
        method: "POST",
        body: {
          contractType: contractForm.contractType,
          position: contractForm.position || detail.data?.data.employee?.jobTitle || "Employee",
          startDate: contractForm.startDate,
          endDate: contractForm.endDate || undefined,
          probationDays: Number(contractForm.probationDays),
          noticePeriodDays: Number(contractForm.noticePeriodDays),
          workingHoursPerWeek: Number(contractForm.workingHoursPerWeek),
          notes: contractForm.notes,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-employee", id] }),
  });

  // Salary form
  const [salaryForm, setSalaryForm] = useState({
    effectiveDate: new Date().toISOString().slice(0, 10),
    basicSar: "4000",
    housingSar: "1000",
    transportSar: "500",
    otherAllowancesSar: "0",
    bankCode: "RJHI",
    iban: "",
    paymentMethod: "wps_bank",
    commissionRule: "",
    notes: "",
  });
  const addSalary = useMutation({
    mutationFn: () =>
      api(`/hr/employees/${id}/salary`, {
        method: "POST",
        body: {
          effectiveDate: salaryForm.effectiveDate,
          basicSar: Number(salaryForm.basicSar),
          housingSar: Number(salaryForm.housingSar),
          transportSar: Number(salaryForm.transportSar),
          otherAllowancesSar: Number(salaryForm.otherAllowancesSar),
          bankCode: salaryForm.bankCode,
          iban: salaryForm.iban,
          paymentMethod: salaryForm.paymentMethod,
          commissionRule: salaryForm.commissionRule,
          notes: salaryForm.notes,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-employee", id] }),
  });

  // Event form
  const [eventForm, setEventForm] = useState({
    type: "promoted",
    eventDate: new Date().toISOString().slice(0, 10),
    title: "",
    notes: "",
  });
  const addEvent = useMutation({
    mutationFn: () =>
      api(`/hr/employees/${id}/events`, {
        method: "POST",
        body: eventForm,
      }),
    onSuccess: () => {
      setEventForm({ ...eventForm, title: "", notes: "" });
      void qc.invalidateQueries({ queryKey: ["hr-employee", id] });
    },
  });

  if (detail.isLoading) return <StateMessage>Loading employee profile...</StateMessage>;
  if (detail.isError || !detail.data?.data?.employee) {
    return (
      <ErrorState
        title="Could not load employee profile"
        detail={detail.error instanceof ApiError ? detail.error.message : "Employee not found"}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const payload = detail.data.data;
  const emp = payload.employee;
  const documents = payload.documents ?? [];
  const contracts = payload.contracts ?? [];
  const events = payload.events ?? [];
  const salaries = payload.salaries;
  const sponsorship = payload.sponsorship;
  const empBadge = normalizeStatus(emp.employmentStatus);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${emp.nameEn} (${emp.employeeNumber})`}
        description={`${emp.jobTitle || "No title"} | ${emp.department || "No department"} | ${emp.branch || "Main branch"}`}
      >
        <Badge code={empBadge.code} label={empBadge.label} />
        <Link
          to="/hr/employees"
          className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-card px-3.5 text-sm font-medium text-ink hover:border-brand"
        >
          Back to Employees
        </Link>
      </PageHeader>

      <Tabs
        label="Employee profile sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "details", label: "Details" },
          { id: "documents", label: `Documents (${documents.length})` },
          { id: "sponsorship", label: "Sponsorship" },
          { id: "contract", label: `Contracts (${contracts.length})` },
          { id: "salary", label: "Salary Structure" },
          { id: "timeline", label: `Timeline (${events.length})` },
        ]}
      />

      {tab === "details" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel className="p-5 space-y-3">
            <h2 className="text-base font-semibold text-ink">Personal & Employment Information</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Employee Number</dt>
                <dd className="font-medium text-ink">{emp.employeeNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Name (English)</dt>
                <dd className="font-medium text-ink">{emp.nameEn}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Name (Arabic)</dt>
                <dd className="font-medium text-ink">{emp.nameAr || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Nationality</dt>
                <dd className="font-medium text-ink">{emp.nationality}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Iqama / National ID</dt>
                <dd className="font-medium text-ink">{emp.iqamaNumber || emp.iqamaMasked}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Iqama Expiry</dt>
                <dd className="font-medium text-ink">{emp.iqamaExpiry || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Passport</dt>
                <dd className="font-medium text-ink">{emp.passportNumber || emp.passportMasked || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Mobile</dt>
                <dd className="font-medium text-ink">{emp.mobile || emp.mobileMasked}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Join Date</dt>
                <dd className="font-medium text-ink">{emp.joinDate || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Probation End Date</dt>
                <dd className="font-medium text-ink">{emp.probationEndDate || "-"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel className="p-5 space-y-3">
            <h2 className="text-base font-semibold text-ink">Emergency Contact</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Contact Name</dt>
                <dd className="font-medium text-ink">{emp.emergencyContact?.name || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Relationship</dt>
                <dd className="font-medium text-ink">{emp.emergencyContact?.relation || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Contact Mobile</dt>
                <dd className="font-medium text-ink">{emp.emergencyContact?.mobile || "-"}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Add or Renew Compliance Document</h2>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addDoc.mutate();
              }}
            >
              <Field label="Document Type">
                <SelectInput value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}>
                  <option value="iqama">Iqama / Residency ID</option>
                  <option value="passport">Passport</option>
                  <option value="border_number">Border Number</option>
                  <option value="visa">Work Visa</option>
                  <option value="exit_reentry_permit">Exit / Re-Entry Permit</option>
                  <option value="medical_insurance">Medical Insurance</option>
                  <option value="driving_license">Driving License</option>
                  <option value="professional_certificate">Professional Certificate</option>
                </SelectInput>
              </Field>
              <Field label="Document Number">
                <TextInput
                  value={docForm.number}
                  onChange={(e) => setDocForm({ ...docForm, number: e.target.value })}
                  required
                />
              </Field>
              <Field label="Issue Date">
                <TextInput
                  type="date"
                  value={docForm.issueDate}
                  onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })}
                />
              </Field>
              <Field label="Expiry Date">
                <TextInput
                  type="date"
                  value={docForm.expiryDate}
                  onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })}
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={addDoc.isPending}>
                  {addDoc.isPending ? "Saving..." : "Save Document"}
                </Button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["Document Type", "Number", "Issue Date", "Expiry Date", "Status"]}
            rows={documents.map((doc) => [
              doc.label || doc.docType.replace(/_/g, " ").toUpperCase(),
              doc.number,
              doc.issueDate || "-",
              doc.expiryDate,
              <Badge key={doc.id} code={doc.status?.code} label={doc.status?.label || "Valid"} />,
            ])}
          />
        </div>
      ) : null}

      {tab === "sponsorship" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Sponsorship, Qiwa & Muqeem References</h2>
            {sponsorship ? (
              <div className="grid gap-3 sm:grid-cols-4 text-sm pb-3 border-b border-line">
                <div>
                  <span className="block text-xs text-muted">Current Sponsor</span>
                  <span className="font-medium text-ink">{sponsorship.sponsorName}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted">Sponsor File #</span>
                  <span className="font-medium text-ink">{sponsorship.sponsorFileNumber || "-"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted">Qiwa Reference</span>
                  <span className="font-medium text-ink">{sponsorship.qiwaReference || "-"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted">Muqeem Reference</span>
                  <span className="font-medium text-ink">{sponsorship.muqeemReference || "-"}</span>
                </div>
              </div>
            ) : null}
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                saveSponsor.mutate();
              }}
            >
              <Field label="Sponsor / Establishment Name">
                <TextInput
                  value={sponsorForm.sponsorName}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, sponsorName: e.target.value })}
                  placeholder={sponsorship?.sponsorName || "Company Establishment"}
                />
              </Field>
              <Field label="Sponsor File Number">
                <TextInput
                  value={sponsorForm.sponsorFileNumber}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, sponsorFileNumber: e.target.value })}
                  placeholder={sponsorship?.sponsorFileNumber || "700XXXXXXX"}
                />
              </Field>
              <Field label="Qiwa Reference Number">
                <TextInput
                  value={sponsorForm.qiwaReference}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, qiwaReference: e.target.value })}
                  placeholder={sponsorship?.qiwaReference || "QW-10023"}
                />
              </Field>
              <Field label="Muqeem Reference Number">
                <TextInput
                  value={sponsorForm.muqeemReference}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, muqeemReference: e.target.value })}
                  placeholder={sponsorship?.muqeemReference || "MQ-88310"}
                />
              </Field>
              <Field label="Transfer From Sponsor (optional)">
                <TextInput
                  value={sponsorForm.fromSponsor}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, fromSponsor: e.target.value })}
                />
              </Field>
              <Field label="Transfer To Sponsor (optional)">
                <TextInput
                  value={sponsorForm.toSponsor}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, toSponsor: e.target.value })}
                />
              </Field>
              <Field label="Transfer Date (optional)">
                <TextInput
                  type="date"
                  value={sponsorForm.transferDate}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, transferDate: e.target.value })}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={saveSponsor.isPending}>
                  {saveSponsor.isPending ? "Saving..." : "Update Sponsorship"}
                </Button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["From Sponsor", "To Sponsor", "Transfer Date", "Reference #", "Notes"]}
            rows={(sponsorship?.transferHistory ?? []).map((t, idx) => [
              t.fromSponsor,
              t.toSponsor,
              t.transferDate || "-",
              t.referenceNumber || "-",
              t.notes || `- (${idx + 1})`,
            ])}
          />
        </div>
      ) : null}

      {tab === "contract" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Create New Contract Version</h2>
            <p className="text-xs text-muted">
              Contracts are versioned automatically. Adding a new contract keeps previous versions readable.
            </p>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addContract.mutate();
              }}
            >
              <Field label="Contract Type">
                <SelectInput
                  value={contractForm.contractType}
                  onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value })}
                >
                  <option value="fixed">Fixed-term</option>
                  <option value="unlimited">Unlimited</option>
                </SelectInput>
              </Field>
              <Field label="Position">
                <TextInput
                  value={contractForm.position}
                  onChange={(e) => setContractForm({ ...contractForm, position: e.target.value })}
                  placeholder={emp.jobTitle || "Position"}
                  required
                />
              </Field>
              <Field label="Start Date">
                <TextInput
                  type="date"
                  value={contractForm.startDate}
                  onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                  required
                />
              </Field>
              <Field label="End Date (for Fixed-Term)">
                <TextInput
                  type="date"
                  value={contractForm.endDate}
                  onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                />
              </Field>
              <Field label="Probation (Days)">
                <TextInput
                  type="number"
                  value={contractForm.probationDays}
                  onChange={(e) => setContractForm({ ...contractForm, probationDays: e.target.value })}
                />
              </Field>
              <Field label="Notice Period (Days)">
                <TextInput
                  type="number"
                  value={contractForm.noticePeriodDays}
                  onChange={(e) => setContractForm({ ...contractForm, noticePeriodDays: e.target.value })}
                />
              </Field>
              <Field label="Hours / Week">
                <TextInput
                  type="number"
                  value={contractForm.workingHoursPerWeek}
                  onChange={(e) => setContractForm({ ...contractForm, workingHoursPerWeek: e.target.value })}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={addContract.isPending}>
                  {addContract.isPending ? "Saving..." : "Add Contract Version"}
                </Button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["Version", "Type", "Position", "Start Date", "End Date", "Probation", "Notice", "State"]}
            rows={contracts.map((c) => {
              const typeLabel = typeof c.contractType === "object" ? c.contractType.label : c.contractType;
              return [
                `v${c.version}`,
                typeLabel,
                c.position,
                c.startDate || "-",
                c.endDate || "Open",
                `${c.probationDays}d`,
                `${c.noticePeriodDays}d`,
                c.isCurrent ? <Badge key={c.id} code="valid" label="Current" /> : "Historical",
              ];
            })}
          />
        </div>
      ) : null}

      {tab === "salary" ? (
        salaries === null ? (
          <EmptyState
            title="Salary access restricted"
            detail="Your role does not include the hr.salary.read permission required to view or manage salary structures."
          />
        ) : (
          <div className="space-y-5">
            <Panel className="p-5 space-y-4">
              <h2 className="text-base font-semibold text-ink">Append Effective-Dated Salary Structure</h2>
              <p className="text-xs text-muted">
                Salary structures are never overwritten. Adding a new effective-dated record preserves historical compensation for audit and WPS.
              </p>
              <form
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  addSalary.mutate();
                }}
              >
                <Field label="Effective Date">
                  <TextInput
                    type="date"
                    value={salaryForm.effectiveDate}
                    onChange={(e) => setSalaryForm({ ...salaryForm, effectiveDate: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Basic Salary (SAR)">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={salaryForm.basicSar}
                    onChange={(e) => setSalaryForm({ ...salaryForm, basicSar: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Housing Allowance (SAR)">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={salaryForm.housingSar}
                    onChange={(e) => setSalaryForm({ ...salaryForm, housingSar: e.target.value })}
                  />
                </Field>
                <Field label="Transport Allowance (SAR)">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={salaryForm.transportSar}
                    onChange={(e) => setSalaryForm({ ...salaryForm, transportSar: e.target.value })}
                  />
                </Field>
                <Field label="Other Allowances (SAR)">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={salaryForm.otherAllowancesSar}
                    onChange={(e) => setSalaryForm({ ...salaryForm, otherAllowancesSar: e.target.value })}
                  />
                </Field>
                <Field label="Bank Code">
                  <TextInput
                    value={salaryForm.bankCode}
                    onChange={(e) => setSalaryForm({ ...salaryForm, bankCode: e.target.value })}
                    placeholder="RJHI / NCB / SABB"
                  />
                </Field>
                <Field label="Saudi IBAN (Encrypted)">
                  <TextInput
                    value={salaryForm.iban}
                    onChange={(e) => setSalaryForm({ ...salaryForm, iban: e.target.value })}
                    placeholder="SA00 0000 0000 0000 0000 0000"
                  />
                </Field>
                <Field label="Payment Method">
                  <SelectInput
                    value={salaryForm.paymentMethod}
                    onChange={(e) => setSalaryForm({ ...salaryForm, paymentMethod: e.target.value })}
                  >
                    <option value="wps_bank">WPS Bank Transfer</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </SelectInput>
                </Field>
                <div className="flex items-end">
                  <Button type="submit" disabled={addSalary.isPending}>
                    {addSalary.isPending ? "Saving..." : "Add Salary Record"}
                  </Button>
                </div>
              </form>
            </Panel>

            <DataTable
              columns={["Effective Date", "Basic", "Housing", "Transport", "Other", "Total Package", "Bank / IBAN", "State"]}
              rows={salaries.map((s) => [
                s.effectiveDate || "-",
                formatSar(s.basic),
                formatSar(s.housing),
                formatSar(s.transport),
                formatSar(s.otherAllowances),
                <span key={s.id} className="font-semibold text-ink">
                  {formatSar(s.total)}
                </span>,
                `${s.bankCode || "-"} (${s.ibanMasked || "No IBAN"})`,
                s.isCurrent ? <Badge key={s.id} code="valid" label="Current" /> : "Historical",
              ])}
            />
          </div>
        )
      ) : null}

      {tab === "timeline" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Record Employee Timeline Event</h2>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addEvent.mutate();
              }}
            >
              <Field label="Event Type">
                <SelectInput value={eventForm.type} onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}>
                  <option value="joined">Joined</option>
                  <option value="promoted">Promoted</option>
                  <option value="transferred">Transferred</option>
                  <option value="warning">Warning</option>
                  <option value="leave">Leave</option>
                  <option value="terminated">Terminated</option>
                </SelectInput>
              </Field>
              <Field label="Event Date">
                <TextInput
                  type="date"
                  value={eventForm.eventDate}
                  onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })}
                  required
                />
              </Field>
              <Field label="Title / Summary">
                <TextInput
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  placeholder="Promoted to Senior Crane Operator"
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={addEvent.isPending}>
                  {addEvent.isPending ? "Saving..." : "Add Event"}
                </Button>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="Notes">
                  <TextArea
                    value={eventForm.notes}
                    onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                    placeholder="Optional event details..."
                  />
                </Field>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["Date", "Event Type", "Title", "Notes"]}
            rows={events.map((ev) => [
              ev.eventDate || "-",
              ev.type.toUpperCase(),
              ev.title,
              ev.notes || "-",
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
