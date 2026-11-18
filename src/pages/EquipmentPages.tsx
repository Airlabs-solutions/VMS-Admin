import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardHat } from "lucide-react";
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
  TextInput,
  linkClass,
} from "../components/ui";
import { ApiError, api, download } from "../lib/api";

type StatusObj = { code: string; label: string };
type MoneyObj = { halalas: number; sar: number };

type EquipmentCategoryRow = {
  id: string;
  name: string;
  meterType: "hours" | "km" | "both";
  requiredDocTypes: string[];
  defaultChecklist: Array<{ label: string; critical: boolean }>;
};

type EquipmentAssetDto = {
  id: string;
  assetCode: string;
  name: string;
  categoryName: string;
  make: string;
  model: string;
  serialNumber: string;
  year: number;
  capacity: string;
  ownership: StatusObj | string;
  supplierOrLessor: string;
  purchaseOrRentalCost: MoneyObj;
  status: StatusObj | string;
  meterHours: number;
  odometerKm: number;
  currentLocation: string;
};

type MobilizationRow = {
  id: string;
  equipmentId: string;
  assetCode?: string;
  equipmentName?: string;
  categoryName?: string;
  clientName: string;
  projectName: string;
  siteLocation: string;
  mobilizationDate: string | null;
  demobilizationDate: string | null;
  rateType: string;
  rate: MoneyObj;
  operatorName: string;
  status: StatusObj | string;
  notes: string;
};

type EquipmentDashboardData = {
  summary: {
    totalAssets: number;
    available: number;
    mobilized: number;
    inMaintenance: number;
    utilizationPercent: number;
    inspectionsDue: number;
    inspectionsOverdue: number;
    docsExpiringSoon: number;
    docsExpired: number;
  };
  idleEquipment: EquipmentAssetDto[];
  activeMobilizations: MobilizationRow[];
  costPerEquipment: Array<{
    id: string;
    assetCode: string;
    name: string;
    categoryName: string;
    status: StatusObj;
    maintenanceCost: MoneyObj;
    expenseCost: MoneyObj;
    totalOperatingCost: MoneyObj;
    acquisitionOrRentalCost: MoneyObj;
  }>;
};

function formatSar(amount: number | MoneyObj | undefined | null) {
  const val = typeof amount === "object" && amount !== null ? amount.sar : Number(amount ?? 0);
  return `SAR ${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeStatus(status: StatusObj | string | undefined | null): StatusObj {
  if (!status) return { code: "valid", label: "Available" };
  if (typeof status === "object") return status;
  if (status === "available") return { code: "valid", label: "Available" };
  if (status === "mobilized" || status === "active") return { code: "ok", label: status.toUpperCase() };
  if (status === "in_maintenance" || status === "planned") return { code: "expiring", label: status.replace("_", " ").toUpperCase() };
  return { code: "expired", label: status.toUpperCase() };
}

function statusCode(status: StatusObj | string | undefined | null): string {
  if (!status) return "";
  return typeof status === "object" ? status.code : status;
}

export function EquipmentDashboardPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const dashboard = useQuery({
    queryKey: ["equipment-dashboard"],
    queryFn: () => api<{ data: EquipmentDashboardData }>("/equipment/dashboard"),
  });
  const categories = useQuery({
    queryKey: ["equipment-categories"],
    queryFn: () => api<{ data: EquipmentCategoryRow[] }>("/equipment/categories"),
  });

  const [showCategories, setShowCategories] = useState(() => searchParams.get("categories") === "open");
  useEffect(() => {
    setShowCategories(searchParams.get("categories") === "open");
  }, [searchParams]);
  const [catName, setCatName] = useState("");
  const [catMeter, setCatMeter] = useState<"hours" | "km" | "both">("hours");
  const [catChecklistText, setCatChecklistText] = useState("Hydraulic system free of leaks\nEmergency stop button functional");

  const createCategory = useMutation({
    mutationFn: () =>
      api("/equipment/categories", {
        method: "POST",
        body: {
          name: catName.trim(),
          meterType: catMeter,
          requiredDocTypes: ["tuv_card", "inspection_certificate"],
          defaultChecklist: catChecklistText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((label) => ({ label, critical: true })),
        },
      }),
    onSuccess: () => {
      setCatName("");
      void qc.invalidateQueries({ queryKey: ["equipment-categories"] });
    },
  });

  if (dashboard.isLoading) return <StateMessage>Loading Equipment dashboard...</StateMessage>;
  if (dashboard.isError || !dashboard.data?.data) {
    return (
      <ErrorState
        title="Could not load Equipment dashboard"
        detail={dashboard.error instanceof ApiError ? dashboard.error.message : "Check that the Equipment module is enabled."}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const d = dashboard.data.data;
  const s = d.summary ?? {
    totalAssets: 0,
    available: 0,
    mobilized: 0,
    inMaintenance: 0,
    utilizationPercent: 0,
    inspectionsDue: 0,
    inspectionsOverdue: 0,
    docsExpiringSoon: 0,
    docsExpired: 0,
  };
  const idleEquipment = d.idleEquipment ?? [];
  const activeMobilizations = d.activeMobilizations ?? [];
  const costPerEquipment = d.costPerEquipment ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipment Dashboard"
        description="Heavy equipment utilization, site mobilization, TUV & calibration compliance, and operating cost analysis."
      >
        <Button variant="secondary" type="button" onClick={() => setShowCategories((v) => !v)}>
          {showCategories ? "Hide Categories" : "Equipment Categories"}
        </Button>
        <Link
          to="/equipment/mobilizations"
          className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-card px-3.5 text-sm font-medium text-ink hover:border-brand"
        >
          Mobilization Board
        </Link>
        <Link
          to="/equipment/assets"
          className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong"
        >
          View Equipment
        </Link>
      </PageHeader>

      {showCategories ? (
        <Panel className="p-4 space-y-4">
          <h2 className="text-base font-semibold text-ink">Equipment Categories & Inspection Checklists</h2>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!catName.trim()) return;
              createCategory.mutate();
            }}
          >
            <Field label="Category Name">
              <TextInput value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Telehandler" required />
            </Field>
            <Field label="Meter Type">
              <SelectInput value={catMeter} onChange={(e) => setCatMeter(e.target.value as any)}>
                <option value="hours">Operating Hours</option>
                <option value="km">Kilometers (km)</option>
                <option value="both">Both Hours & km</option>
              </SelectInput>
            </Field>
            <Field label="Checklist Items (one per line)">
              <TextInput
                value={catChecklistText}
                onChange={(e) => setCatChecklistText(e.target.value)}
                placeholder="Hydraulic check"
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={createCategory.isPending}>
                {createCategory.isPending ? "Saving..." : "Add Category"}
              </Button>
            </div>
          </form>
          <DataTable
            columns={["Category", "Meter Type", "Checklist Items"]}
            rows={(categories.data?.data ?? []).map((c) => [
              c.name,
              c.meterType.toUpperCase(),
              (c.defaultChecklist ?? []).map((item) => item.label).join(", ") || "-",
            ])}
          />
        </Panel>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Total Equipment</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{s.totalAssets}</p>
          <p className="mt-1 text-xs text-muted">
            Mobilized: {s.mobilized} | Available: {s.available}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Utilization Rate</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{s.utilizationPercent}%</p>
          <p className="mt-1 text-xs text-muted">In maintenance: {s.inMaintenance}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Inspections Due / Overdue</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{s.inspectionsDue + s.inspectionsOverdue}</p>
          <p className="mt-1 text-xs text-muted">
            Due soon: {s.inspectionsDue} | Overdue: {s.inspectionsOverdue}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Expiring Permits / TUV</p>
          <p className="mt-2 text-2xl font-semibold text-status-danger">{s.docsExpiringSoon + s.docsExpired}</p>
          <p className="mt-1 text-xs text-muted">
            Expired: {s.docsExpired} | Expiring soon: {s.docsExpiringSoon}
          </p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Idle / Available Equipment Ready for Mobilization</h2>
          <DataTable
            columns={["Asset Code", "Equipment", "Category", "Location", "Meter (Hours)"]}
            rows={idleEquipment.map((eq) => [
              <Link key={eq.id} to={`/equipment/assets/${eq.id}`} className={linkClass}>
                {eq.assetCode}
              </Link>,
              eq.name,
              eq.categoryName,
              eq.currentLocation || "-",
              `${(eq.meterHours ?? 0).toLocaleString()} hrs`,
            ])}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Cost per Equipment (Operating Spend)</h2>
          <DataTable
            columns={["Asset Code", "Equipment", "Maintenance", "Expenses", "Total Operating"]}
            rows={costPerEquipment.map((c) => [
              <Link key={c.id} to={`/equipment/assets/${c.id}`} className={linkClass}>
                {c.assetCode}
              </Link>,
              c.name,
              formatSar(c.maintenanceCost),
              formatSar(c.expenseCost),
              <span key={c.id} className="font-semibold text-ink">
                {formatSar(c.totalOperatingCost)}
              </span>,
            ])}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Active & Planned Site Mobilizations</h2>
        <DataTable
          columns={["Client", "Project", "Site Location", "Mobilized", "Demobilization", "Rate", "Status"]}
          rows={activeMobilizations.map((m) => {
            const st = normalizeStatus(m.status);
            return [
              m.clientName,
              m.projectName || "-",
              m.siteLocation,
              m.mobilizationDate || "-",
              m.demobilizationDate || "Ongoing",
              `${formatSar(m.rate)} / ${m.rateType}`,
              <Badge key={m.id} code={st.code} label={st.label} />,
            ];
          })}
        />
      </div>
    </div>
  );
}

export function EquipmentListPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");

  const [showCreate, setShowCreate] = useState(() => searchParams.get("action") === "new");
  const [showImport, setShowImport] = useState(() => searchParams.get("action") === "import");

  useEffect(() => {
    setShowCreate(searchParams.get("action") === "new");
    setShowImport(searchParams.get("action") === "import");
  }, [searchParams]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    assetCode: "",
    name: "",
    categoryName: "Mobile Crane",
    make: "Caterpillar",
    model: "",
    serialNumber: "",
    year: "2024",
    capacity: "50 Ton",
    ownership: "owned",
    supplierOrLessor: "",
    purchaseOrRentalCostSar: "0",
    status: "available",
    meterHours: "0",
    odometerKm: "0",
    currentLocation: "Riyadh Main Yard",
  });

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  if (category) params.set("category", category);

  const assets = useQuery({
    queryKey: ["equipment-assets", params.toString()],
    queryFn: () => api<{ data: EquipmentAssetDto[]; meta: { total: number } }>(`/equipment/assets?${params.toString()}`),
  });

  const categories = useQuery({
    queryKey: ["equipment-categories"],
    queryFn: () => api<{ data: EquipmentCategoryRow[] }>("/equipment/categories"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api("/equipment/assets", {
        method: "POST",
        body: {
          ...form,
          year: Number(form.year),
          purchaseOrRentalCostSar: Number(form.purchaseOrRentalCostSar),
          meterHours: Number(form.meterHours),
          odometerKm: Number(form.odometerKm),
        },
      }),
    onSuccess: () => {
      setShowCreate(false);
      setFormError("");
      void qc.invalidateQueries({ queryKey: ["equipment-assets"] });
      void qc.invalidateQueries({ queryKey: ["equipment-dashboard"] });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof ApiError ? err.message : "Failed to create equipment");
    },
  });

  const importMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!importFile) throw new Error("Choose an Excel file first");
      const fd = new FormData();
      fd.append("file", importFile);
      return api<{ data: any }>(`/equipment/assets/import?dryRun=${dryRun ? "true" : "false"}`, {
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
        void qc.invalidateQueries({ queryKey: ["equipment-assets"] });
        void qc.invalidateQueries({ queryKey: ["equipment-dashboard"] });
      }
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipment Assets"
        description="Manage heavy machinery, cranes, generators, forklifts, operating hours, and site readiness."
      >
        <Button
          variant="secondary"
          type="button"
          onClick={() => void download(`/equipment/assets/export.xlsx?${params.toString()}`, "equipment.xlsx")}
        >
          Export Excel
        </Button>
        <Button variant="secondary" type="button" onClick={() => setShowImport((v) => !v)}>
          Bulk Import
        </Button>
        <Button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Close Form" : "Add Equipment"}
        </Button>
      </PageHeader>

      {showImport ? (
        <Panel className="p-4 space-y-4">
          <h2 className="text-base font-semibold text-ink">Bulk Import Equipment from Excel (.xlsx)</h2>
          <p className="text-xs text-muted">
            Expected columns: Asset Code, Name, Category, Make, Model, Serial Number, Year, Capacity, Ownership, Meter Hours, Odometer (km), Location.
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
              disabled={!importFile || importMutation.isPending}
              onClick={() => importMutation.mutate(true)}
            >
              Validate & Preview
            </Button>
            {importPreview && importPreview.validCount > 0 ? (
              <Button
                type="button"
                disabled={importMutation.isPending}
                onClick={() => importMutation.mutate(false)}
              >
                Import {importPreview.validCount} Valid Rows
              </Button>
            ) : null}
          </div>
          {importPreview ? (
            <p className="text-sm font-medium text-ink">
              Total rows: {importPreview.totalRows} | Valid: {importPreview.validCount} | Errors: {importPreview.invalidCount ?? 0}
            </p>
          ) : null}
        </Panel>
      ) : null}

      {showCreate ? (
        <Panel className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-ink">Register New Equipment Asset</h2>
          {formError ? <p className="text-sm text-status-danger">{formError}</p> : null}
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <Field label="Asset Code">
              <TextInput
                value={form.assetCode}
                onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
                placeholder="EQ-CRN-001"
                required
              />
            </Field>
            <Field label="Equipment Name">
              <TextInput
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tadano 50T Rough Terrain Crane"
                required
              />
            </Field>
            <Field label="Category">
              <SelectInput value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}>
                {(categories.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="Mobile Crane">Mobile Crane</option>
                <option value="Excavator">Excavator</option>
                <option value="Forklift">Forklift</option>
                <option value="Diesel Generator">Diesel Generator</option>
              </SelectInput>
            </Field>
            <Field label="Make">
              <TextInput value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required />
            </Field>
            <Field label="Model">
              <TextInput
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="GR-500EX"
                required
              />
            </Field>
            <Field label="Serial Number">
              <TextInput
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                placeholder="SN-8849201"
                required
              />
            </Field>
            <Field label="Manufacture Year">
              <TextInput
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                required
              />
            </Field>
            <Field label="Capacity / Rating">
              <TextInput
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                placeholder="50 Ton / 250 kVA"
              />
            </Field>
            <Field label="Ownership">
              <SelectInput value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })}>
                <option value="owned">Owned</option>
                <option value="rented_in">Rented-in (Hired)</option>
                <option value="rented_out">Rented-out</option>
              </SelectInput>
            </Field>
            <Field label="Purchase / Monthly Rental (SAR)">
              <TextInput
                type="number"
                step="0.01"
                value={form.purchaseOrRentalCostSar}
                onChange={(e) => setForm({ ...form, purchaseOrRentalCostSar: e.target.value })}
              />
            </Field>
            <Field label="Operating Hours">
              <TextInput
                type="number"
                value={form.meterHours}
                onChange={(e) => setForm({ ...form, meterHours: e.target.value })}
              />
            </Field>
            <Field label="Current Location / Site">
              <TextInput
                value={form.currentLocation}
                onChange={(e) => setForm({ ...form, currentLocation: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save Equipment"}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {assets.data && ((assets.data.data ?? []).length > 0 || Boolean(q || category || status)) ? (
      <Panel className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search asset code, name, serial, location..."
          />
          <SelectInput value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(categories.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="mobilized">Mobilized</option>
            <option value="in_maintenance">In maintenance</option>
            <option value="inactive">Inactive</option>
            <option value="sold">Sold</option>
          </SelectInput>
        </div>
      </Panel>
      ) : null}

      {assets.isLoading ? (
        <StateMessage>Loading equipment...</StateMessage>
      ) : assets.isError ? (
        <ErrorState
          title="Could not load equipment"
          detail={assets.error instanceof ApiError ? assets.error.message : "Failed to load equipment list"}
          onRetry={() => void assets.refetch()}
        />
      ) : (assets.data?.data ?? []).length === 0 ? (
        q || category || status ? (
          <EmptyState
            title="No equipment matches these filters"
            detail="Try clearing or adjusting your search filters."
          />
        ) : (
          <EmptyState
            icon={<HardHat className="h-6 w-6" aria-hidden="true" />}
            title="Add equipment and track deployments"
            detail="Register heavy machinery and assets to monitor operating hours, maintenance, and site mobilizations."
            action={<Button onClick={() => setShowCreate(true)}>Add Equipment</Button>}
          />
        )
      ) : (
        <DataTable
          columns={["Asset Code", "Name", "Category", "Make / Model", "Serial #", "Hours / km", "Location", "Ownership", "Status"]}
          rows={(assets.data?.data ?? []).map((eq) => {
            const st = normalizeStatus(eq.status);
            const own = normalizeStatus(eq.ownership);
            return [
              <Link key={eq.id} to={`/equipment/assets/${eq.id}`} className={linkClass}>
                {eq.assetCode}
              </Link>,
              <Link key={`${eq.id}-n`} to={`/equipment/assets/${eq.id}`} className="font-medium text-ink hover:text-brand-deep">
                {eq.name}
              </Link>,
              eq.categoryName,
              `${eq.make} ${eq.model} (${eq.year})`,
              eq.serialNumber,
              `${(eq.meterHours ?? 0).toLocaleString()} hrs / ${(eq.odometerKm ?? 0).toLocaleString()} km`,
              eq.currentLocation || "-",
              own.label,
              <Badge key={`${eq.id}-s`} code={st.code} label={st.label} />,
            ];
          })}
        />
      )}
    </div>
  );
}

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState("details");

  const detail = useQuery({
    queryKey: ["equipment-asset", id],
    queryFn: () =>
      api<{
        data: {
          asset: EquipmentAssetDto;
          documents: Array<{
            id: string;
            docType: string;
            label?: string;
            number: string;
            issueDate: string | null;
            expiryDate: string;
            status: StatusObj;
          }>;
          inspections: Array<{
            id: string;
            inspectorName: string;
            inspectionDate: string | null;
            nextDueDate: string | null;
            meterHours: number;
            odometerKm: number;
            overallResult: StatusObj | string;
            autoMaintenanceTriggered?: boolean;
            items: Array<{ label: string; critical: boolean; result: string; notes: string }>;
            notes: string;
          }>;
          maintenanceSchedules: Array<{
            id: string;
            serviceType: string;
            intervalMonths: number;
            intervalKm: number;
            intervalHours: number;
            nextDueDate: string | null;
            nextDueKm: number;
            nextDueHours: number | null;
            status: StatusObj;
          }>;
          maintenanceLogs: Array<{
            id: string;
            date: string | null;
            serviceType: string;
            workshop: string;
            odometerKm: number;
            meterHours: number | null;
            cost: MoneyObj;
            notes: string;
          }>;
          mobilizations: MobilizationRow[];
          operators: Array<{
            id: string;
            employeeId: string | null;
            operatorName: string;
            operatorMobile: string;
            licenseOrCertNumber: string;
            startDate: string | null;
            endDate: string | null;
            status: StatusObj;
            complianceVerified: boolean;
            notes: string;
          }>;
          expenses: Array<{
            id: string;
            date: string | null;
            category: StatusObj | string;
            amount: MoneyObj;
            notes: string;
          }>;
        };
      }>(`/equipment/assets/${id}`),
    enabled: Boolean(id),
  });

  // Document Form
  const [docForm, setDocForm] = useState({
    docType: "tuv_card",
    number: "",
    issueDate: "",
    expiryDate: "",
  });
  const addDoc = useMutation({
    mutationFn: () =>
      api(`/equipment/assets/${id}/documents`, {
        method: "POST",
        body: { ...docForm, issueDate: docForm.issueDate || undefined },
      }),
    onSuccess: () => {
      setDocForm({ docType: "tuv_card", number: "", issueDate: "", expiryDate: "" });
      void qc.invalidateQueries({ queryKey: ["equipment-asset", id] });
    },
  });

  // Inspection Form
  const [inspForm, setInspForm] = useState({
    inspectorName: "Safety Inspector",
    inspectionDate: new Date().toISOString().slice(0, 10),
    nextDueDate: "",
    meterHours: "0",
    notes: "",
    items: [
      { label: "Hydraulic cylinders & hoses free of leaks", critical: true, result: "pass" as "pass" | "fail" | "na", notes: "" },
      { label: "Load moment indicator & safety limiters", critical: true, result: "pass" as "pass" | "fail" | "na", notes: "" },
      { label: "Fire extinguisher & cabin emergency stop", critical: true, result: "pass" as "pass" | "fail" | "na", notes: "" },
    ],
  });
  const addInspection = useMutation({
    mutationFn: () =>
      api(`/equipment/assets/${id}/inspections`, {
        method: "POST",
        body: {
          inspectorName: inspForm.inspectorName,
          inspectionDate: inspForm.inspectionDate,
          nextDueDate: inspForm.nextDueDate || undefined,
          meterHours: Number(inspForm.meterHours) || detail.data?.data.asset?.meterHours || 0,
          odometerKm: detail.data?.data.asset?.odometerKm || 0,
          items: inspForm.items,
          notes: inspForm.notes,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["equipment-asset", id] }),
  });

  // Maintenance Schedule Form
  const [schedForm, setSchedForm] = useState({
    serviceType: "250-Hour Preventive Service",
    intervalMonths: "3",
    intervalHours: "250",
    nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    nextDueHours: "250",
  });
  const addSchedule = useMutation({
    mutationFn: () =>
      api(`/equipment/assets/${id}/maintenance/schedules`, {
        method: "POST",
        body: {
          serviceType: schedForm.serviceType,
          intervalMonths: Number(schedForm.intervalMonths),
          intervalHours: Number(schedForm.intervalHours),
          nextDueDate: schedForm.nextDueDate,
          nextDueHours: Number(schedForm.nextDueHours),
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["equipment-asset", id] }),
  });

  // Maintenance Log Form
  const [logForm, setLogForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    serviceType: "Hydraulic Oil & Filter Service",
    workshop: "Al-Riyadh Heavy Workshop",
    meterHours: "0",
    costSar: "1250",
    notes: "",
  });
  const addMaintLog = useMutation({
    mutationFn: () =>
      api(`/equipment/assets/${id}/maintenance/logs`, {
        method: "POST",
        body: {
          date: logForm.date,
          serviceType: logForm.serviceType,
          workshop: logForm.workshop,
          meterHours: Number(logForm.meterHours) || detail.data?.data.asset?.meterHours || 0,
          costSar: Number(logForm.costSar),
          notes: logForm.notes,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["equipment-asset", id] }),
  });

  // Mobilization Form
  const [mobForm, setMobForm] = useState({
    clientName: "",
    projectName: "",
    siteLocation: "",
    mobilizationDate: new Date().toISOString().slice(0, 10),
    demobilizationDate: "",
    rateType: "monthly",
    rateSar: "18000",
    operatorName: "",
    status: "active",
    notes: "",
  });
  const addMob = useMutation({
    mutationFn: () =>
      api(`/equipment/assets/${id}/mobilizations`, {
        method: "POST",
        body: {
          ...mobForm,
          demobilizationDate: mobForm.demobilizationDate || undefined,
          rateSar: Number(mobForm.rateSar),
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["equipment-asset", id] }),
  });

  // Operator Form
  const [opForm, setOpForm] = useState({
    operatorName: "",
    operatorMobile: "+9665",
    licenseOrCertNumber: "",
    startDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const addOp = useMutation({
    mutationFn: () =>
      api(`/equipment/assets/${id}/operators`, {
        method: "POST",
        body: opForm,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["equipment-asset", id] }),
  });

  // Expense Form
  const [expForm, setExpForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: "spare_parts",
    amountSar: "450",
    notes: "",
  });
  const addExpense = useMutation({
    mutationFn: () =>
      api(`/equipment/assets/${id}/expenses`, {
        method: "POST",
        body: {
          date: expForm.date,
          category: expForm.category,
          amountSar: Number(expForm.amountSar),
          notes: expForm.notes,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["equipment-asset", id] }),
  });

  if (detail.isLoading) return <StateMessage>Loading equipment details...</StateMessage>;
  if (detail.isError || !detail.data?.data?.asset) {
    return (
      <ErrorState
        title="Could not load equipment details"
        detail={detail.error instanceof ApiError ? detail.error.message : "Equipment not found"}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const payload = detail.data.data;
  const eq = payload.asset;
  const documents = payload.documents ?? [];
  const inspections = payload.inspections ?? [];
  const maintenanceSchedules = payload.maintenanceSchedules ?? [];
  const maintenanceLogs = payload.maintenanceLogs ?? [];
  const mobilizations = payload.mobilizations ?? [];
  const operators = payload.operators ?? [];
  const expenses = payload.expenses ?? [];
  const st = normalizeStatus(eq.status);
  const own = normalizeStatus(eq.ownership);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${eq.assetCode}: ${eq.name}`}
        description={`${eq.categoryName} | ${eq.make} ${eq.model} (${eq.year}) | ${(eq.meterHours ?? 0).toLocaleString()} hrs | ${eq.currentLocation || "Main Yard"}`}
      >
        <Badge code={st.code} label={st.label} />
        <Link
          to="/equipment/assets"
          className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-card px-3.5 text-sm font-medium text-ink hover:border-brand"
        >
          Back to Equipment
        </Link>
      </PageHeader>

      <Tabs
        label="Equipment sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "details", label: "Details" },
          { id: "documents", label: `Documents (${documents.length})` },
          { id: "inspections", label: `Inspections (${inspections.length})` },
          { id: "maintenance", label: `Maintenance (${maintenanceLogs.length})` },
          { id: "mobilization", label: `Mobilization (${mobilizations.length})` },
          { id: "operators", label: `Operators (${operators.length})` },
          { id: "costs", label: `Costs (${expenses.length})` },
        ]}
      />

      {tab === "details" ? (
        <Panel className="p-5">
          <h2 className="text-base font-semibold text-ink mb-4">Technical & Ownership Specifications</h2>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Asset Code</dt>
              <dd className="font-medium text-ink">{eq.assetCode}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Category</dt>
              <dd className="font-medium text-ink">{eq.categoryName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Serial Number</dt>
              <dd className="font-medium text-ink">{eq.serialNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Capacity / Rating</dt>
              <dd className="font-medium text-ink">{eq.capacity || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Ownership</dt>
              <dd className="font-medium text-ink">{own.label}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Purchase / Rental Cost</dt>
              <dd className="font-medium text-ink">{formatSar(eq.purchaseOrRentalCost)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Operating Hours</dt>
              <dd className="font-medium text-ink">{(eq.meterHours ?? 0).toLocaleString()} hrs</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Current Location</dt>
              <dd className="font-medium text-ink">{eq.currentLocation || "-"}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Add TUV / Calibration / Operating Permit</h2>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addDoc.mutate();
              }}
            >
              <Field label="Certificate Type">
                <SelectInput value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}>
                  <option value="tuv_card">TUV Third-Party Safety Card</option>
                  <option value="inspection_certificate">Periodic Inspection Certificate</option>
                  <option value="calibration_certificate">Calibration Certificate</option>
                  <option value="operating_permit">Site Operating Permit</option>
                  <option value="equipment_istimara">Equipment Istimara</option>
                  <option value="equipment_insurance">Equipment Insurance Policy</option>
                </SelectInput>
              </Field>
              <Field label="Certificate Number">
                <TextInput value={docForm.number} onChange={(e) => setDocForm({ ...docForm, number: e.target.value })} required />
              </Field>
              <Field label="Issue Date">
                <TextInput type="date" value={docForm.issueDate} onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })} />
              </Field>
              <Field label="Expiry Date">
                <TextInput type="date" value={docForm.expiryDate} onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })} required />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={addDoc.isPending}>
                  {addDoc.isPending ? "Saving..." : "Save Certificate"}
                </Button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["Certificate Type", "Number", "Issue Date", "Expiry Date", "Status"]}
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

      {tab === "inspections" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Run Checklist Safety Inspection</h2>
            <p className="text-xs text-muted">
              Note: Marking any critical checklist item as FAIL automatically sets this equipment to In Maintenance and creates a corrective maintenance entry.
            </p>
            <form
              className="space-y-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addInspection.mutate();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Inspector Name">
                  <TextInput
                    value={inspForm.inspectorName}
                    onChange={(e) => setInspForm({ ...inspForm, inspectorName: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Inspection Date">
                  <TextInput
                    type="date"
                    value={inspForm.inspectionDate}
                    onChange={(e) => setInspForm({ ...inspForm, inspectionDate: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Next Due Date">
                  <TextInput
                    type="date"
                    value={inspForm.nextDueDate}
                    onChange={(e) => setInspForm({ ...inspForm, nextDueDate: e.target.value })}
                  />
                </Field>
                <Field label="Operating Hours at Inspection">
                  <TextInput
                    type="number"
                    value={inspForm.meterHours}
                    onChange={(e) => setInspForm({ ...inspForm, meterHours: e.target.value })}
                  />
                </Field>
              </div>

              <div className="space-y-2">
                {inspForm.items.map((item, idx) => (
                  <div key={idx} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3 text-sm">
                    <span className="font-medium text-ink">
                      {item.label} {item.critical ? <span className="text-xs text-status-danger">(Critical)</span> : null}
                    </span>
                    <div className="flex items-center gap-2">
                      {(["pass", "fail", "na"] as const).map((res) => (
                        <button
                          key={res}
                          type="button"
                          onClick={() => {
                            const next = [...inspForm.items];
                            next[idx] = { ...next[idx], result: res };
                            setInspForm({ ...inspForm, items: next });
                          }}
                          className={`h-8 rounded-md px-3 text-xs font-medium uppercase ${
                            item.result === res
                              ? res === "fail"
                                ? "bg-status-danger text-white"
                                : "bg-brand text-white"
                              : "border border-line bg-card text-muted"
                          }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Button type="submit" disabled={addInspection.isPending}>
                {addInspection.isPending ? "Recording..." : "Submit Inspection Report"}
              </Button>
            </form>
          </Panel>

          <DataTable
            columns={["Date", "Inspector", "Hours", "Overall Result", "Next Due"]}
            rows={inspections.map((i) => {
              const resObj = normalizeStatus(i.overallResult);
              return [
                i.inspectionDate || "-",
                i.inspectorName,
                `${i.meterHours} hrs`,
                <Badge key={i.id} code={resObj.code} label={resObj.label} />,
                i.nextDueDate || "-",
              ];
            })}
          />
        </div>
      ) : null}

      {tab === "maintenance" ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel className="p-5 space-y-4">
              <h2 className="text-base font-semibold text-ink">Add Preventive Schedule (Hours / Date)</h2>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  addSchedule.mutate();
                }}
              >
                <Field label="Service Type">
                  <TextInput
                    value={schedForm.serviceType}
                    onChange={(e) => setSchedForm({ ...schedForm, serviceType: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Interval (Hours)">
                  <TextInput
                    type="number"
                    value={schedForm.intervalHours}
                    onChange={(e) => setSchedForm({ ...schedForm, intervalHours: e.target.value })}
                  />
                </Field>
                <Field label="Next Due Date">
                  <TextInput
                    type="date"
                    value={schedForm.nextDueDate}
                    onChange={(e) => setSchedForm({ ...schedForm, nextDueDate: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Next Due Hours">
                  <TextInput
                    type="number"
                    value={schedForm.nextDueHours}
                    onChange={(e) => setSchedForm({ ...schedForm, nextDueHours: e.target.value })}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={addSchedule.isPending}>
                    Save Schedule
                  </Button>
                </div>
              </form>
            </Panel>

            <Panel className="p-5 space-y-4">
              <h2 className="text-base font-semibold text-ink">Log Completed Maintenance Service</h2>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  addMaintLog.mutate();
                }}
              >
                <Field label="Service Date">
                  <TextInput type="date" value={logForm.date} onChange={(e) => setLogForm({ ...logForm, date: e.target.value })} required />
                </Field>
                <Field label="Service Performed">
                  <TextInput
                    value={logForm.serviceType}
                    onChange={(e) => setLogForm({ ...logForm, serviceType: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Operating Hours">
                  <TextInput
                    type="number"
                    value={logForm.meterHours}
                    onChange={(e) => setLogForm({ ...logForm, meterHours: e.target.value })}
                  />
                </Field>
                <Field label="Cost (SAR)">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={logForm.costSar}
                    onChange={(e) => setLogForm({ ...logForm, costSar: e.target.value })}
                    required
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={addMaintLog.isPending}>
                    Log Service
                  </Button>
                </div>
              </form>
            </Panel>
          </div>

          <h3 className="text-sm font-semibold text-ink">Preventive Schedules</h3>
          <DataTable
            columns={["Service Type", "Interval Hours", "Next Due Date", "Next Due Hours", "Status"]}
            rows={maintenanceSchedules.map((s) => [
              s.serviceType,
              s.intervalHours ? `${s.intervalHours} hrs` : "-",
              s.nextDueDate || "-",
              s.nextDueHours ? `${s.nextDueHours} hrs` : "-",
              <Badge key={s.id} code={s.status?.code} label={s.status?.label || "OK"} />,
            ])}
          />

          <h3 className="text-sm font-semibold text-ink">Service History</h3>
          <DataTable
            columns={["Date", "Service Type", "Workshop", "Meter Hours", "Cost"]}
            rows={maintenanceLogs.map((l) => [
              l.date || "-",
              l.serviceType,
              l.workshop || "-",
              l.meterHours != null ? `${l.meterHours} hrs` : "-",
              formatSar(l.cost),
            ])}
          />
        </div>
      ) : null}

      {tab === "mobilization" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Mobilize Equipment to Client Site / Project</h2>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addMob.mutate();
              }}
            >
              <Field label="Client Name">
                <TextInput
                  value={mobForm.clientName}
                  onChange={(e) => setMobForm({ ...mobForm, clientName: e.target.value })}
                  placeholder="Saudi Binladin / NEOM Contractor"
                  required
                />
              </Field>
              <Field label="Project Name">
                <TextInput
                  value={mobForm.projectName}
                  onChange={(e) => setMobForm({ ...mobForm, projectName: e.target.value })}
                  placeholder="Riyadh Metro Package 3"
                />
              </Field>
              <Field label="Site Location">
                <TextInput
                  value={mobForm.siteLocation}
                  onChange={(e) => setMobForm({ ...mobForm, siteLocation: e.target.value })}
                  placeholder="North Riyadh Sector B"
                  required
                />
              </Field>
              <Field label="Mobilization Date">
                <TextInput
                  type="date"
                  value={mobForm.mobilizationDate}
                  onChange={(e) => setMobForm({ ...mobForm, mobilizationDate: e.target.value })}
                  required
                />
              </Field>
              <Field label="Expected Demobilization Date">
                <TextInput
                  type="date"
                  value={mobForm.demobilizationDate}
                  onChange={(e) => setMobForm({ ...mobForm, demobilizationDate: e.target.value })}
                />
              </Field>
              <Field label="Billing Rate Type">
                <SelectInput value={mobForm.rateType} onChange={(e) => setMobForm({ ...mobForm, rateType: e.target.value })}>
                  <option value="monthly">Monthly</option>
                  <option value="daily">Daily</option>
                  <option value="hourly">Hourly</option>
                </SelectInput>
              </Field>
              <Field label="Billing Rate (SAR)">
                <TextInput
                  type="number"
                  step="0.01"
                  value={mobForm.rateSar}
                  onChange={(e) => setMobForm({ ...mobForm, rateSar: e.target.value })}
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={addMob.isPending}>
                  {addMob.isPending ? "Mobilizing..." : "Create Mobilization"}
                </Button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["Client", "Project", "Site Location", "Start Date", "End Date", "Billing Rate", "Status"]}
            rows={mobilizations.map((m) => {
              const mSt = normalizeStatus(m.status);
              return [
                m.clientName,
                m.projectName || "-",
                m.siteLocation,
                m.mobilizationDate || "-",
                m.demobilizationDate || "Ongoing",
                `${formatSar(m.rate)} / ${m.rateType}`,
                <Badge key={m.id} code={mSt.code} label={mSt.label} />,
              ];
            })}
          />
        </div>
      ) : null}

      {tab === "operators" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Assign Certified Equipment Operator</h2>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addOp.mutate();
              }}
            >
              <Field label="Operator Name">
                <TextInput
                  value={opForm.operatorName}
                  onChange={(e) => setOpForm({ ...opForm, operatorName: e.target.value })}
                  required
                />
              </Field>
              <Field label="Operator Mobile">
                <PhoneInput
                  value={opForm.operatorMobile}
                  onChange={(operatorMobile) => setOpForm({ ...opForm, operatorMobile })}
                />
              </Field>
              <Field label="TUV / Crane License #">
                <TextInput
                  value={opForm.licenseOrCertNumber}
                  onChange={(e) => setOpForm({ ...opForm, licenseOrCertNumber: e.target.value })}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={addOp.isPending}>
                  Assign Operator
                </Button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["Operator Name", "Mobile", "Certificate / License", "Start Date", "End Date", "Compliance"]}
            rows={operators.map((op) => [
              op.operatorName,
              op.operatorMobile || "-",
              op.licenseOrCertNumber || "-",
              op.startDate || "-",
              op.endDate || "Current",
              <Badge
                key={op.id}
                code={op.complianceVerified ? "valid" : "expiring"}
                label={op.complianceVerified ? "Verified" : "Manual"}
              />,
            ])}
          />
        </div>
      ) : null}

      {tab === "costs" ? (
        <div className="space-y-5">
          <Panel className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-ink">Record Equipment Expense</h2>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addExpense.mutate();
              }}
            >
              <Field label="Expense Date">
                <TextInput type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} required />
              </Field>
              <Field label="Category">
                <SelectInput value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}>
                  <option value="spare_parts">Spare Parts</option>
                  <option value="tires">Tires / Tracks</option>
                  <option value="tolls">Lowbed Transport / Tolls</option>
                  <option value="washing">Washing & Cleaning</option>
                  <option value="other">Other</option>
                </SelectInput>
              </Field>
              <Field label="Amount (SAR)">
                <TextInput
                  type="number"
                  step="0.01"
                  value={expForm.amountSar}
                  onChange={(e) => setExpForm({ ...expForm, amountSar: e.target.value })}
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={addExpense.isPending}>
                  Add Expense
                </Button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={["Date", "Category", "Amount", "Notes"]}
            rows={expenses.map((ex) => {
              const catLabel = typeof ex.category === "object" ? ex.category.label : ex.category;
              return [
                ex.date || "-",
                catLabel,
                formatSar(ex.amount),
                ex.notes || "-",
              ];
            })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function MobilizationBoardPage() {
  const qc = useQueryClient();
  const mobs = useQuery({
    queryKey: ["equipment-mobilizations"],
    queryFn: () => api<{ data: MobilizationRow[] }>("/equipment/mobilizations"),
  });

  const completeMob = useMutation({
    mutationFn: (id: string) =>
      api(`/equipment/mobilizations/${id}`, {
        method: "PATCH",
        body: { status: "completed", demobilizationDate: new Date().toISOString().slice(0, 10) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipment-mobilizations"] });
      void qc.invalidateQueries({ queryKey: ["equipment-dashboard"] });
      void qc.invalidateQueries({ queryKey: ["equipment-assets"] });
    },
  });

  if (mobs.isLoading) return <StateMessage>Loading mobilization board...</StateMessage>;
  if (mobs.isError || !mobs.data) {
    return (
      <ErrorState
        title="Could not load mobilizations"
        detail={mobs.error instanceof ApiError ? mobs.error.message : "Failed to load mobilization board"}
        onRetry={() => void mobs.refetch()}
      />
    );
  }

  const all = mobs.data.data ?? [];
  const planned = all.filter((m) => statusCode(m.status) === "planned");
  const active = all.filter((m) => statusCode(m.status) === "active");
  const completed = all.filter((m) => statusCode(m.status) === "completed");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipment Mobilization Board"
        description="Track planned deployments, active site assignments, billing rates, and demobilizations."
      >
        <Link
          to="/equipment/assets"
          className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong"
        >
          Mobilize from Equipment List
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { title: `Planned (${planned.length})`, items: planned },
          { title: `Active on Site (${active.length})`, items: active },
          { title: `Completed (${completed.length})`, items: completed.slice(0, 8) },
        ].map((col) => (
          <Panel key={col.title} className="p-4 space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">{col.title}</h2>
            {col.items.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">No records in this column.</p>
            ) : (
              col.items.map((item) => {
                const code = statusCode(item.status);
                return (
                  <div key={item.id} className="rounded-md border border-line bg-canvas p-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/equipment/assets/${item.equipmentId}`} className={linkClass}>
                        {item.assetCode} - {item.equipmentName}
                      </Link>
                      <span className="text-xs font-semibold text-ink">
                        {formatSar(item.rate)}/{item.rateType}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-ink">
                      {item.clientName} {item.projectName ? `(${item.projectName})` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      Site: {item.siteLocation} | From: {item.mobilizationDate}
                    </p>
                    {code !== "completed" ? (
                      <div className="pt-1">
                        <Button
                          variant="secondary"
                          className="h-7 px-2.5 text-xs"
                          disabled={completeMob.isPending}
                          onClick={() => completeMob.mutate(item.id)}
                        >
                          Demobilize & Complete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </Panel>
        ))}
      </div>

      <h2 className="text-base font-semibold text-ink">All Mobilization Schedule Records</h2>
      <DataTable
        columns={["Asset", "Client / Project", "Site", "Mobilized", "Demobilized", "Rate", "Status", "Action"]}
        rows={all.map((m) => {
          const st = normalizeStatus(m.status);
          const code = statusCode(m.status);
          return [
            <Link key={m.id} to={`/equipment/assets/${m.equipmentId}`} className={linkClass}>
              {m.assetCode} ({m.equipmentName})
            </Link>,
            `${m.clientName}${m.projectName ? ` / ${m.projectName}` : ""}`,
            m.siteLocation,
            m.mobilizationDate || "-",
            m.demobilizationDate || "Active",
            `${formatSar(m.rate)} / ${m.rateType}`,
            <Badge key={m.id} code={st.code} label={st.label} />,
            code !== "completed" ? (
              <Button
                key={`${m.id}-btn`}
                variant="secondary"
                className="h-8 px-2.5 text-xs"
                onClick={() => completeMob.mutate(m.id)}
              >
                Demobilize
              </Button>
            ) : (
              "Done"
            ),
          ];
        })}
      />
    </div>
  );
}
