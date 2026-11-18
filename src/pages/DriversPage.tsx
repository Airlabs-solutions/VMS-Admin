import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DateField } from "../components/DateField";
import { DocumentCapture } from "../components/DocumentCapture";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, PhoneInput, SelectInput, StateMessage, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDate } from "../lib/format";
import type { ListResponse, Status } from "../types";

type Driver = {
  id: string;
  name: string;
  mobileMasked: string;
  employeeId: string;
  iqamaStatus: Status;
  licenseStatus: Status;
  licenseType: Status;
  iqamaExpiry: string | null;
  licenseExpiry: string | null;
  status: Status;
  fileIds: string[];
  photoUrl?: string | null;
  assignedVehicle?: { id: string; plateNumber: string; name: string } | null;
};

type DriverDetail = Driver & {
  mobile: string | null;
  iqamaNumber: string | null;
  licenseNumber: string | null;
  currentVehicle: { id: string; plateNumber: string; make: string; model: string } | null;
  portalAccess?: boolean;
};

const licenseTypes = [
  ["private", "Private"],
  ["light_transport", "Light transport"],
  ["heavy", "Heavy"],
  ["motorcycle", "Motorcycle"],
  ["other", "Other"],
] as const;

const empty = {
  name: "",
  mobile: "",
  employeeId: "",
  iqamaNumber: "",
  iqamaExpiry: "",
  licenseNumber: "",
  licenseType: "private",
  licenseExpiry: "",
  status: "active",
  vehicleId: "",
  odometerKm: "",
  fileIds: [] as string[],
};

function dayValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

async function uploadDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("module", "drivers");
  const uploaded = await api<{ data: { id: string } }>("/files", { method: "POST", form: body });
  return uploaded.data.id;
}

export function DriversPage() {
  const client = useQueryClient();
  const hydrated = useRef("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [iqamaFilter, setIqamaFilter] = useState("");
  const [licenseFilter, setLicenseFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [mode, setMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState("");
  const [originalVehicleId, setOriginalVehicleId] = useState("");
  const [form, setForm] = useState(empty);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [accessOpen, setAccessOpen] = useState(false);
  const [portalAccess, setPortalAccess] = useState(false);
  const [accessTouched, setAccessTouched] = useState(false);

  const detail = useQuery({
    queryKey: ["driver", selectedId],
    queryFn: () => api<{ data: DriverDetail }>(`/drivers/${selectedId}`),
    enabled: Boolean(selectedId) && mode !== "edit",
  });
  const editor = useQuery({
    queryKey: ["driver", editingId],
    queryFn: () => api<{ data: DriverDetail }>(`/drivers/${editingId}`),
    enabled: mode === "edit" && Boolean(editingId),
  });
  const drivers = useQuery({
    queryKey: ["drivers"],
    queryFn: () => api<ListResponse<Driver>>("/drivers?limit=500"),
  });
  const vehicles = useQuery({
    queryKey: ["vehicle-options"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; name?: string }>>("/vehicles?limit=500"),
  });

  useEffect(() => {
    if (mode !== "edit" || !editor.data) return;
    const driver = editor.data.data;
    if (hydrated.current === driver.id) return;
    hydrated.current = driver.id;
    const vehicleId = driver.currentVehicle?.id ?? "";
    setOriginalVehicleId(vehicleId);
    setForm({
      name: driver.name,
      mobile: driver.mobile ?? "",
      employeeId: driver.employeeId ?? "",
      iqamaNumber: driver.iqamaNumber ?? "",
      iqamaExpiry: dayValue(driver.iqamaExpiry),
      licenseNumber: driver.licenseNumber ?? "",
      licenseType: driver.licenseType.code,
      licenseExpiry: dayValue(driver.licenseExpiry),
      status: driver.status.code,
      vehicleId,
      odometerKm: "",
      fileIds: driver.fileIds ?? [],
    });
    setNewFiles([]);
    setPortalAccess(Boolean(driver.portalAccess));
    setAccessOpen(false);
    setAccessTouched(false);
  }, [mode, editor.data]);

  const save = useMutation({
    mutationFn: async () => {
      const uploaded = await Promise.all(newFiles.map((file) => uploadDocument(file)));
      const body = {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        employeeId: form.employeeId.trim() || "",
        iqamaNumber: form.iqamaNumber.replace(/\D/g, ""),
        iqamaExpiry: form.iqamaExpiry,
        licenseNumber: form.licenseNumber.trim(),
        licenseType: form.licenseType,
        licenseExpiry: form.licenseExpiry,
        status: form.status,
        fileIds: [...form.fileIds, ...uploaded],
        ...(accessTouched ? { portalAccess } : {}),
      };
      const id = mode === "edit" ? editingId : (await api<{ data: { id: string } }>("/drivers", { method: "POST", body })).data.id;
      if (mode === "edit") await api(`/drivers/${editingId}`, { method: "PATCH", body });
      if (mode === "edit" && originalVehicleId && form.vehicleId !== originalVehicleId) {
        await api(`/drivers/${id}/unassign`, { method: "POST", body: { date: new Date().toISOString() } });
      }
      if (form.vehicleId && form.vehicleId !== originalVehicleId) {
        await api(`/drivers/${id}/assign`, {
          method: "POST",
          body: { vehicleId: form.vehicleId, date: new Date().toISOString(), odometerKm: Number(form.odometerKm || 0), fuelLevel: "Full" },
        });
      }
    },
    onSuccess: async () => {
      closeForm();
      await client.invalidateQueries({ queryKey: ["drivers"] });
      await client.invalidateQueries({ queryKey: ["driver"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details.length > 0) {
        const next: Record<string, string> = {};
        for (const item of err.details) next[item.path] = item.message;
        setFieldErrors(next);
        setError("Check the highlighted fields");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not save the driver");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/drivers/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmId("");
      setSelectedId("");
      await client.invalidateQueries({ queryKey: ["drivers"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not delete the driver"),
  });

  function closeForm() {
    setMode(null);
    setEditingId("");
    setOriginalVehicleId("");
    setForm(empty);
    setNewFiles([]);
    setFieldErrors({});
    setError("");
    setAccessOpen(false);
    setPortalAccess(false);
    setAccessTouched(false);
    hydrated.current = "";
  }

  function openAdd() {
    closeForm();
    setMode("add");
  }

  function openEdit(id: string) {
    setError("");
    setFieldErrors({});
    setNewFiles([]);
    hydrated.current = "";
    setAccessOpen(false);
    setAccessTouched(false);
    setEditingId(id);
    setMode("edit");
    setSelectedId("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Enter the driver name";
    if (form.mobile.trim().length < 7) next.mobile = "Enter a mobile number";
    if (!/^\d{10}$/.test(form.iqamaNumber.replace(/\D/g, ""))) next.iqamaNumber = "Iqama number must be 10 digits";
    if (!form.iqamaExpiry) next.iqamaExpiry = "Choose the iqama expiry date";
    if (form.licenseNumber.trim().length < 3) next.licenseNumber = "Enter the license number";
    if (!form.licenseExpiry) next.licenseExpiry = "Choose the license expiry date";
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      setError("Check the highlighted fields");
      return;
    }
    setError("");
    save.mutate();
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (drivers.data?.data ?? []).filter((driver) => {
      if (statusFilter && driver.status.code !== statusFilter) return false;
      if (iqamaFilter && driver.iqamaStatus.code !== iqamaFilter) return false;
      if (licenseFilter && driver.licenseStatus.code !== licenseFilter) return false;
      if (vehicleFilter === "none" && driver.assignedVehicle) return false;
      if (vehicleFilter && vehicleFilter !== "none" && driver.assignedVehicle?.id !== vehicleFilter) return false;
      if (!term) return true;
      const haystack = [driver.name, driver.mobileMasked, driver.employeeId, driver.assignedVehicle?.plateNumber, driver.assignedVehicle?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [drivers.data, search, statusFilter, iqamaFilter, licenseFilter, vehicleFilter]);

  const filtersOn = Boolean(search || statusFilter || iqamaFilter || licenseFilter || vehicleFilter);

  const driverForm = mode ? (
    <form onSubmit={onSubmit}>
      {mode === "edit" && editor.isLoading ? <StateMessage>Loading driver...</StateMessage> : null}
      {mode === "edit" ? (
        <DriverAvatar name={form.name || editor.data?.data.name || "Driver"} photoUrl={editor.data?.data.photoUrl} />
      ) : null}
      <div className={mode === "edit" ? "mt-4" : ""}>
        <DocumentCapture
          kind="driver_license"
          title="Upload Driver License / Iqama (Auto-Fill)"
          onRead={(fileId, fields) => {
            setForm((current) => ({
              ...current,
              name: fields.name || current.name,
              mobile: fields.mobile || current.mobile,
              iqamaNumber: fields.iqamaNumber || current.iqamaNumber,
              iqamaExpiry: fields.iqamaExpiry || current.iqamaExpiry,
              licenseNumber: fields.licenseNumber || current.licenseNumber,
              licenseType: fields.licenseType || current.licenseType,
              licenseExpiry: fields.licenseExpiry || current.licenseExpiry,
              fileIds: fileId && !current.fileIds.includes(fileId) ? [...current.fileIds, fileId] : current.fileIds,
            }));
          }}
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <TextInput className={cn(fieldErrors.name && "border-status-danger")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <FieldHint message={fieldErrors.name} />
            </Field>
            <Field label="Mobile">
              <PhoneInput className={cn(fieldErrors.mobile && "border-status-danger")} value={form.mobile} onChange={(mobile) => setForm({ ...form, mobile })} />
              <FieldHint message={fieldErrors.mobile} />
            </Field>
            <Field label="Employee ID">
              <TextInput value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} />
            </Field>
            <Field label="Status">
              <SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </SelectInput>
            </Field>
            <Field label="Iqama number">
              <TextInput className={cn(fieldErrors.iqamaNumber && "border-status-danger")} inputMode="numeric" value={form.iqamaNumber} placeholder="10 digits" onChange={(event) => setForm({ ...form, iqamaNumber: event.target.value })} />
              <FieldHint message={fieldErrors.iqamaNumber} />
            </Field>
            <Field label="Iqama expiry">
              <DateField invalid={Boolean(fieldErrors.iqamaExpiry)} value={form.iqamaExpiry} onChange={(iqamaExpiry) => setForm({ ...form, iqamaExpiry })} />
              <FieldHint message={fieldErrors.iqamaExpiry} />
            </Field>
            <Field label="License number">
              <TextInput className={cn(fieldErrors.licenseNumber && "border-status-danger")} value={form.licenseNumber} onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })} />
              <FieldHint message={fieldErrors.licenseNumber} />
            </Field>
            <Field label="License type">
              <SelectInput value={form.licenseType} onChange={(event) => setForm({ ...form, licenseType: event.target.value })}>
                {licenseTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectInput>
            </Field>
            <Field label="License expiry">
              <DateField invalid={Boolean(fieldErrors.licenseExpiry)} value={form.licenseExpiry} onChange={(licenseExpiry) => setForm({ ...form, licenseExpiry })} />
              <FieldHint message={fieldErrors.licenseExpiry} />
            </Field>
            <Field label="Assign vehicle">
              <SelectInput value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })}>
                <option value="">Unassigned</option>
                {vehicles.data?.data.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
              </SelectInput>
            </Field>
            {form.vehicleId && form.vehicleId !== originalVehicleId ? (
              <Field label="Handover odometer (km)">
                <TextInput value={form.odometerKm} onChange={(event) => setForm({ ...form, odometerKm: event.target.value })} />
              </Field>
            ) : null}
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="text-sm font-medium text-brand-deep transition-colors duration-150 hover:text-ink"
              aria-expanded={accessOpen}
              onClick={() => setAccessOpen((open) => !open)}
            >
              {accessOpen ? "Hide driver access" : "Driver access"}
            </button>
            {accessOpen ? (
              <label className="mt-3 flex items-start gap-3 rounded-lg border border-line bg-canvas p-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-brand"
                  checked={portalAccess}
                  onChange={(event) => {
                    setPortalAccess(event.target.checked);
                    setAccessTouched(true);
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">Allow sign-in</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">The driver can sign in with their mobile number and a code. Leave this off unless they need the portal.</span>
                </span>
              </label>
            ) : null}
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium">Documents</p>
            <p className="mt-1 text-xs text-muted">Iqama, license, or other files. PDF, images, and common documents, up to 10 MB each.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {form.fileIds.map((id) => (
                <DocThumb
                  key={id}
                  fileId={id}
                  onRemove={() => setForm({ ...form, fileIds: form.fileIds.filter((item) => item !== id) })}
                />
              ))}
              {newFiles.map((file, index) => (
                <LocalDoc key={`${file.name}-${file.size}-${index}`} file={file} onRemove={() => setNewFiles(newFiles.filter((_, item) => item !== index))} />
              ))}
            </div>
            <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-line bg-card px-3 py-2 text-sm">
              Add documents
              <input
                className="sr-only"
                type="file"
                multiple
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  setNewFiles((current) => [...current, ...picked]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {error ? <p className="mt-3 text-sm text-status-danger">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            <Button disabled={save.isPending}>{save.isPending ? "Saving..." : "Save driver"}</Button>
            <Button type="button" variant="secondary" onClick={closeForm}>Cancel</Button>
          </div>
        </form>
  ) : null;

  return (
    <div>
      <PageHeader title="Drivers">
        <Button onClick={mode === "add" ? closeForm : openAdd}>{mode === "add" ? "Close Form" : "Add driver"}</Button>
      </PageHeader>

      {mode === "add" ? (
        <Panel className="mb-4 p-4 sm:p-5">
          <h2 className="mb-4 text-base font-semibold text-brand-deep">Add driver</h2>
          {driverForm}
        </Panel>
      ) : null}

      {mode === "edit" ? (
        <Dialog title="Edit driver" onClose={closeForm}>
          {driverForm}
        </Dialog>
      ) : null}

      {drivers.data && drivers.data.data.length > 0 ? (
      <div className="mb-4 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Search">
            <TextInput placeholder="Name, mobile, vehicle" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <Field label="Status">
            <SelectInput value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectInput>
          </Field>
          <Field label="Iqama">
            <SelectInput value={iqamaFilter} onChange={(event) => setIqamaFilter(event.target.value)}>
              <option value="">Any</option>
              <option value="valid">Valid</option>
              <option value="expiring_soon">Expiring soon</option>
              <option value="expired">Expired</option>
            </SelectInput>
          </Field>
          <Field label="License">
            <SelectInput value={licenseFilter} onChange={(event) => setLicenseFilter(event.target.value)}>
              <option value="">Any</option>
              <option value="valid">Valid</option>
              <option value="expiring_soon">Expiring soon</option>
              <option value="expired">Expired</option>
            </SelectInput>
          </Field>
          <Field label="Vehicle">
            <SelectInput value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}>
              <option value="">All</option>
              <option value="none">Unassigned</option>
              {vehicles.data?.data.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-muted">{filtered.length} {filtered.length === 1 ? "driver" : "drivers"}</p>
          {filtersOn ? (
            <button type="button" className="text-brand-deep hover:text-ink" onClick={() => { setSearch(""); setStatusFilter(""); setIqamaFilter(""); setLicenseFilter(""); setVehicleFilter(""); }}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      ) : null}

      {drivers.isLoading ? <StateMessage>Loading drivers...</StateMessage> : null}
      {drivers.isError ? <StateMessage>Could not load drivers.</StateMessage> : null}
      {drivers.data && drivers.data.data.length === 0 && !mode ? (
        <EmptyState
          icon={<Users className="h-6 w-6" aria-hidden="true" />}
          title="Add drivers and manage their records"
          detail="Register drivers to track iqamas, licenses, vehicle assignments, and portal access."
          action={<Button onClick={openAdd}>Add driver</Button>}
        />
      ) : null}
      {drivers.data && drivers.data.data.length > 0 && filtered.length === 0 ? (
        <EmptyState
          title="No drivers match these filters"
          detail="Try clearing or adjusting your search filters."
        />
      ) : null}
      <ul className="space-y-3">
        {filtered.map((driver) => (
          <li key={driver.id} className="rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <DriverAvatar name={driver.name} photoUrl={driver.photoUrl} />
                <div className="min-w-0">
                  <p className="font-semibold">{driver.name}</p>
                  <p className="mt-1 text-sm text-muted">{driver.mobileMasked}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge code={driver.status.code} label={driver.status.label} />
                <Button variant="secondary" onClick={() => { setConfirmId(""); setMode(null); setEditingId(""); setSelectedId(driver.id); }}>
                  Full info
                </Button>
                <Button variant="secondary" onClick={() => openEdit(driver.id)}>Edit</Button>
                <Button variant="secondary" onClick={() => setConfirmId(driver.id)}>Delete</Button>
              </div>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Vehicle</dt>
                <dd>{driver.assignedVehicle ? driver.assignedVehicle.plateNumber : "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-muted">Iqama expiry</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2">{formatDate(driver.iqamaExpiry)} <Badge code={driver.iqamaStatus.code} label={driver.iqamaStatus.label} /></dd>
              </div>
              <div>
                <dt className="text-muted">License expiry</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2">{formatDate(driver.licenseExpiry)} <Badge code={driver.licenseStatus.code} label={driver.licenseStatus.label} /></dd>
              </div>
            </dl>
            {(driver.fileIds ?? []).length > 0 ? (
              <p className="mt-2 text-xs text-muted">{driver.fileIds.length} {driver.fileIds.length === 1 ? "document" : "documents"}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {selectedId && mode !== "edit" ? (
        <Dialog title="Driver details" onClose={() => setSelectedId("")}>
          {detail.isLoading ? <StateMessage>Loading driver...</StateMessage> : null}
          {detail.isError ? <StateMessage>Could not load this driver.</StateMessage> : null}
          {detail.data ? (
            <div className="text-sm">
              <div className="flex items-center gap-3">
                <DriverAvatar name={detail.data.data.name} photoUrl={detail.data.data.photoUrl} size="h-20 w-20" />
                <div>
                  <p className="text-base font-semibold text-ink">{detail.data.data.name}</p>
                  <div className="mt-1"><Badge code={detail.data.data.status.code} label={detail.data.data.status.label} /></div>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><dt className="text-muted">Mobile</dt><dd className="mt-0.5 font-medium">{detail.data.data.mobile || "Not recorded"}</dd></div>
                <div><dt className="text-muted">Employee ID</dt><dd className="mt-0.5 font-medium">{detail.data.data.employeeId || "Not set"}</dd></div>
                <div><dt className="text-muted">Iqama number</dt><dd className="mt-0.5 font-medium">{detail.data.data.iqamaNumber || "Not recorded"}</dd></div>
                <div><dt className="text-muted">Iqama expiry</dt><dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium">{formatDate(detail.data.data.iqamaExpiry)} <Badge code={detail.data.data.iqamaStatus.code} label={detail.data.data.iqamaStatus.label} /></dd></div>
                <div><dt className="text-muted">License number</dt><dd className="mt-0.5 font-medium">{detail.data.data.licenseNumber || "Not recorded"}</dd></div>
                <div><dt className="text-muted">License type</dt><dd className="mt-0.5 font-medium">{detail.data.data.licenseType.label}</dd></div>
                <div><dt className="text-muted">License expiry</dt><dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium">{formatDate(detail.data.data.licenseExpiry)} <Badge code={detail.data.data.licenseStatus.code} label={detail.data.data.licenseStatus.label} /></dd></div>
                <div><dt className="text-muted">Assigned vehicle</dt><dd className="mt-0.5 font-medium">{detail.data.data.currentVehicle ? `${detail.data.data.currentVehicle.plateNumber}, ${detail.data.data.currentVehicle.make} ${detail.data.data.currentVehicle.model}` : "Unassigned"}</dd></div>
                <div><dt className="text-muted">Portal access</dt><dd className="mt-0.5 font-medium">{detail.data.data.portalAccess ? "Allowed" : "Off"}</dd></div>
              </dl>
              {(detail.data.data.fileIds ?? []).length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  {detail.data.data.fileIds.map((id) => <DocThumb key={id} fileId={id} />)}
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" onClick={() => openEdit(detail.data.data.id)}>Edit</Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmId(detail.data.data.id)}>Delete</Button>
              </div>
            </div>
          ) : null}
        </Dialog>
      ) : null}
      {confirmId ? (
        <Dialog title="Confirm delete" onClose={() => { if (!remove.isPending) setConfirmId(""); }}>
          <p className="text-sm leading-6 text-ink">
            Delete {drivers.data?.data.find((driver) => driver.id === confirmId)?.name || "this driver"}? The driver record will be removed.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(confirmId)}>
              {remove.isPending ? "Deleting..." : "Confirm delete"}
            </Button>
            <Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => setConfirmId("")}>Cancel</Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function LocalDoc({ file, onRemove }: { file: File; onRemove: () => void }) {
  const preview = useMemo(() => (file.type.startsWith("image/") ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <div className="w-28">
      <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas p-2 text-center text-xs">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : file.name}
      </div>
      <button type="button" className="mt-1 text-xs text-status-danger" onClick={onRemove}>Remove</button>
    </div>
  );
}

function DocThumb({ fileId, onRemove }: { fileId: string; onRemove?: () => void }) {
  const file = useQuery({
    queryKey: ["file-url", fileId],
    queryFn: () => api<{ data: { url: string } }>(`/files/${fileId}/url`),
  });
  const url = file.data?.data.url;
  return (
    <div className="w-28">
      <a href={url ?? "#"} target="_blank" rel="noreferrer" className="block h-24 overflow-hidden rounded-md border border-line bg-canvas">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-muted">Open</span>}
      </a>
      {onRemove ? <button type="button" className="mt-1 text-xs text-status-danger" onClick={onRemove}>Remove</button> : null}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[min(92vh,860px)] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-card p-4 shadow-[0_16px_40px_rgba(17,22,16,0.16)] sm:p-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" className="h-9 shrink-0 rounded-md px-3 text-sm font-medium text-brand-deep hover:bg-brand-soft hover:text-ink" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function DriverAvatar({ name, photoUrl, size = "h-14 w-14" }: { name: string; photoUrl?: string | null; size?: string }) {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "DR";
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={`${size} shrink-0 rounded-md object-cover`} />;
  }
  return <span className={`grid ${size} shrink-0 place-items-center rounded-md bg-brand-deep text-sm font-semibold text-white`}>{letters}</span>;
}

function FieldHint({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="text-xs text-status-danger">{message}</span>;
}
