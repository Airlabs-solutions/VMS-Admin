import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DateField } from "../components/DateField";
import { Badge, Button, Field, PageHeader, SelectInput, StateMessage, TextArea, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { ListResponse, Status } from "../types";

type Vehicle = {
  id: string;
  name: string;
  plateNumber: string;
  model: string;
  year: number;
  color: string;
  fuelType: Status;
  vin: string;
  type: Status;
  ownership: Status;
  odometerKm: number;
  platePhotoId: string | null;
  vehiclePhotoId: string | null;
  photoIds: string[];
  note: string;
  currentDriverId: string | null;
  currentDriverName?: string | null;
  insurance?: { startDate: string | null; endDate: string | null; status: Status } | null;
  pucExpiry?: string | null;
  fitnessExpiry?: string | null;
};

type DriverOption = { id: string; name: string };

type Draft = {
  id: string | null;
  name: string;
  plateNumber: string;
  model: string;
  color: string;
  fuelType: string;
  driverId: string;
  year: number;
  vin: string;
  type: string;
  ownership: string;
  odometerKm: number;
  platePhotoId: string | null;
  vehiclePhotoId: string | null;
  photoIds: string[];
  note: string;
  insuranceStart: string;
  insuranceEnd: string;
  pucExpiry: string;
  fitnessExpiry: string;
};

const fuels = [
  ["petrol", "Petrol"],
  ["diesel", "Diesel"],
  ["hybrid", "Hybrid"],
  ["electric", "Electric"],
] as const;

function blankDraft(): Draft {
  return {
    id: null,
    name: "",
    plateNumber: "",
    model: "",
    color: "",
    fuelType: "petrol",
    driverId: "",
    year: new Date().getFullYear(),
    vin: "",
    type: "other",
    ownership: "owned",
    odometerKm: 0,
    platePhotoId: null,
    vehiclePhotoId: null,
    photoIds: [],
    note: "",
    insuranceStart: "",
    insuranceEnd: "",
    pucExpiry: "",
    fitnessExpiry: "",
  };
}

function dateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function draftFrom(vehicle: Vehicle): Draft {
  return {
    id: vehicle.id,
    name: vehicle.name,
    plateNumber: vehicle.plateNumber,
    model: vehicle.model,
    color: vehicle.color,
    fuelType: vehicle.fuelType.code,
    driverId: vehicle.currentDriverId ?? "",
    year: vehicle.year,
    vin: vehicle.vin,
    type: vehicle.type.code,
    ownership: vehicle.ownership.code,
    odometerKm: vehicle.odometerKm,
    platePhotoId: vehicle.platePhotoId,
    vehiclePhotoId: vehicle.vehiclePhotoId,
    photoIds: vehicle.photoIds ?? [],
    note: vehicle.note ?? "",
    insuranceStart: dateInput(vehicle.insurance?.startDate),
    insuranceEnd: dateInput(vehicle.insurance?.endDate),
    pucExpiry: dateInput(vehicle.pucExpiry),
    fitnessExpiry: dateInput(vehicle.fitnessExpiry),
  };
}

function usePreview(file: File | null, existingId: string | null) {
  const remote = useQuery({
    queryKey: ["file-url", existingId],
    queryFn: () => api<{ data: { url: string } }>(`/files/${existingId}/url`),
    enabled: Boolean(existingId) && !file,
  });
  const [local, setLocal] = useState("");
  useEffect(() => {
    if (!file) {
      setLocal("");
      return;
    }
    const url = URL.createObjectURL(file);
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return local || remote.data?.data.url || "";
}

function PhotoPicker({
  label,
  file,
  existingId,
  onChange,
}: {
  label: string;
  file: File | null;
  existingId: string | null;
  onChange: (file: File | null) => void;
}) {
  const preview = usePreview(file, existingId);
  return (
    <label className="flex flex-col gap-2 rounded-md border border-dashed border-line bg-canvas p-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex h-36 items-center justify-center overflow-hidden rounded-md border border-line bg-card">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="px-3 text-center text-sm text-muted">Any file, up to 10 MB</span>}
      </span>
      <input
        className="text-sm"
        type="file"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function PhotoThumb({ fileId, label }: { fileId: string | null; label: string }) {
  const photo = useQuery({
    queryKey: ["file-url", fileId],
    queryFn: () => api<{ data: { url: string } }>(`/files/${fileId}/url`),
    enabled: Boolean(fileId),
  });
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas">
        {photo.data?.data.url ? (
          <img src={photo.data.data.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">No photo</span>
        )}
      </div>
    </div>
  );
}

async function uploadPhoto(file: File, moduleName: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("module", moduleName);
  const uploaded = await api<{ data: { id: string } }>("/files", { method: "POST", form: body });
  return uploaded.data.id;
}

export function VehiclesPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [fuel, setFuel] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [insuranceFilter, setInsuranceFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [plateFile, setPlateFile] = useState<File | null>(null);
  const [vehicleFile, setVehicleFile] = useState<File | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const vehicles = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<ListResponse<Vehicle>>("/vehicles?limit=500"),
  });
  const drivers = useQuery({
    queryKey: ["driver-options"],
    queryFn: () => api<ListResponse<DriverOption>>("/drivers?limit=100"),
  });

  function openAdd() {
    setError("");
    setPlateFile(null);
    setVehicleFile(null);
    setExtraFiles([]);
    setDraft(blankDraft());
  }

  function openEdit(vehicle: Vehicle) {
    setError("");
    setPlateFile(null);
    setVehicleFile(null);
    setExtraFiles([]);
    setConfirmId("");
    setDraft(draftFrom(vehicle));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      if ((draft.insuranceStart && !draft.insuranceEnd) || (!draft.insuranceStart && draft.insuranceEnd)) {
        throw new ApiError("Enter both the insurance start and expiry dates", 400);
      }
      const platePhotoId = plateFile ? await uploadPhoto(plateFile, "plates") : undefined;
      const vehiclePhotoId = vehicleFile ? await uploadPhoto(vehicleFile, "vehicles") : undefined;
      const uploadedExtras = await Promise.all(extraFiles.map((file) => uploadPhoto(file, "vehicles")));
      const body = {
        name: draft.name,
        plateNumber: draft.plateNumber,
        make: draft.name,
        model: draft.model,
        year: draft.year,
        color: draft.color,
        fuelType: draft.fuelType,
        vin: draft.vin || `VMS${Date.now().toString(36).toUpperCase()}`,
        type: draft.type || "other",
        ownership: draft.ownership || "owned",
        odometerKm: draft.odometerKm,
        note: draft.note,
        photoIds: [...draft.photoIds, ...uploadedExtras],
        insuranceStart: draft.insuranceStart,
        insuranceEnd: draft.insuranceEnd,
        pucExpiry: draft.pucExpiry,
        fitnessExpiry: draft.fitnessExpiry,
        ...(platePhotoId ? { platePhotoId } : {}),
        ...(vehiclePhotoId ? { vehiclePhotoId } : {}),
      };
      const saved = draft.id
        ? await api<{ data: { id: string } }>(`/vehicles/${draft.id}`, { method: "PATCH", body })
        : await api<{ data: { id: string } }>("/vehicles", { method: "POST", body });
      const vehicleId = saved.data.id;
      const previous = vehicles.data?.data.find((item) => item.id === vehicleId)?.currentDriverId ?? "";
      if (draft.driverId && draft.driverId !== previous) {
        await api(`/drivers/${draft.driverId}/assign`, {
          method: "POST",
          body: { vehicleId, date: new Date().toISOString(), odometerKm: draft.odometerKm },
        });
      } else if (!draft.driverId && previous) {
        await api(`/drivers/${previous}/unassign`, { method: "POST", body: { date: new Date().toISOString() } });
      }
    },
    onSuccess: async () => {
      setDraft(null);
      setPlateFile(null);
      setVehicleFile(null);
      setExtraFiles([]);
      await client.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the vehicle"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmId("");
      await client.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not delete the vehicle"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (vehicles.data?.data ?? []).filter((vehicle) => {
      if (fuel && vehicle.fuelType.code !== fuel) return false;
      if (driverFilter === "none" && vehicle.currentDriverId) return false;
      if (driverFilter && driverFilter !== "none" && vehicle.currentDriverId !== driverFilter) return false;
      if (insuranceFilter === "none" && vehicle.insurance) return false;
      if (insuranceFilter && insuranceFilter !== "none" && vehicle.insurance?.status.code !== insuranceFilter) return false;
      if (!term) return true;
      const haystack = [vehicle.name, vehicle.plateNumber, vehicle.model, vehicle.color, vehicle.currentDriverName, vehicle.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [vehicles.data, search, fuel, driverFilter, insuranceFilter]);

  const filtersOn = Boolean(search || fuel || driverFilter || insuranceFilter);

  function clearFilters() {
    setSearch("");
    setFuel("");
    setDriverFilter("");
    setInsuranceFilter("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    save.mutate();
  }

  return (
    <div>
      <PageHeader title="Vehicles">
        <Button onClick={openAdd}>Add vehicle</Button>
      </PageHeader>
      <div className="mb-4 rounded-md border border-line bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Search">
            <TextInput placeholder="Name, number, model, color, driver" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <Field label="Fuel">
            <SelectInput value={fuel} onChange={(event) => setFuel(event.target.value)}>
              <option value="">All fuels</option>
              {fuels.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Driver">
            <SelectInput value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
              <option value="">All drivers</option>
              <option value="none">Unassigned</option>
              {drivers.data?.data.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Insurance">
            <SelectInput value={insuranceFilter} onChange={(event) => setInsuranceFilter(event.target.value)}>
              <option value="">Any status</option>
              <option value="valid">Valid</option>
              <option value="expiring_soon">Expiring soon</option>
              <option value="expired">Expired</option>
              <option value="none">Not recorded</option>
            </SelectInput>
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-muted">{filtered.length} {filtered.length === 1 ? "vehicle" : "vehicles"}</p>
          {filtersOn ? (
            <button type="button" className="text-accent" onClick={clearFilters}>Clear filters</button>
          ) : null}
        </div>
      </div>

      {draft ? (
        <form onSubmit={onSubmit} className="mb-4 rounded-md border border-line bg-card p-4">
          <h2 className="text-base font-semibold">{draft.id ? "Edit vehicle" : "Add vehicle"}</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <PhotoPicker label="Vehicle photo" file={vehicleFile} existingId={draft.vehiclePhotoId} onChange={setVehicleFile} />
              <PhotoPicker label="Number plate photo" file={plateFile} existingId={draft.platePhotoId} onChange={setPlateFile} />
              {draft.photoIds.map((id) => (
                <div key={id} className="space-y-1">
                  <PhotoThumb fileId={id} label="Extra photo" />
                  <button
                    type="button"
                    className="text-sm text-accent"
                    onClick={() => setDraft({ ...draft, photoIds: draft.photoIds.filter((item) => item !== id) })}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {extraFiles.map((file, index) => (
                <PhotoPicker
                  key={`${file.name}-${index}`}
                  label={`Extra photo ${index + 1}`}
                  file={file}
                  existingId={null}
                  onChange={(next) => {
                    if (!next) {
                      setExtraFiles(extraFiles.filter((_, item) => item !== index));
                      return;
                    }
                    setExtraFiles(extraFiles.map((item, itemIndex) => (itemIndex === index ? next : item)));
                  }}
                />
              ))}
              <label className="flex h-full cursor-pointer items-center justify-center rounded-md border border-line bg-card px-3 py-2 text-sm font-medium">
                Add more images
                <input
                  className="sr-only"
                  type="file"
                  multiple
                  onChange={(event) => {
                    const chosen = Array.from(event.target.files ?? []);
                    if (chosen.length) setExtraFiles([...extraFiles, ...chosen]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vehicle company name">
                <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
              </Field>
              <Field label="Vehicle number">
                <TextInput value={draft.plateNumber} onChange={(event) => setDraft({ ...draft, plateNumber: event.target.value })} required />
              </Field>
              <Field label="Model">
                <TextInput value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} required />
              </Field>
              <Field label="Color">
                <TextInput value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} required />
              </Field>
              <Field label="Fuel type">
                <SelectInput value={draft.fuelType} onChange={(event) => setDraft({ ...draft, fuelType: event.target.value })}>
                  {fuels.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Driver">
                <SelectInput value={draft.driverId} onChange={(event) => setDraft({ ...draft, driverId: event.target.value })}>
                  <option value="">No driver</option>
                  {drivers.data?.data.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Insurance start">
                <DateField value={draft.insuranceStart} onChange={(insuranceStart) => setDraft({ ...draft, insuranceStart })} />
              </Field>
              <Field label="Insurance expiry">
                <DateField value={draft.insuranceEnd} onChange={(insuranceEnd) => setDraft({ ...draft, insuranceEnd })} />
              </Field>
              <Field label="Pollution (PUC) expiry">
                <DateField value={draft.pucExpiry} onChange={(pucExpiry) => setDraft({ ...draft, pucExpiry })} />
              </Field>
              <Field label="Fitness certificate expiry">
                <DateField value={draft.fitnessExpiry} onChange={(fitnessExpiry) => setDraft({ ...draft, fitnessExpiry })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Note">
                  <TextArea value={draft.note} maxLength={2000} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
                </Field>
              </div>
              {error ? <p className="text-sm text-status-danger sm:col-span-2">{error}</p> : null}
              <div className="flex gap-2 sm:col-span-2">
                <Button disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
                <Button type="button" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      {vehicles.isLoading ? <StateMessage>Loading vehicles...</StateMessage> : null}
      {vehicles.isError ? <StateMessage>{vehicles.error instanceof ApiError ? vehicles.error.message : "Could not load vehicles."}</StateMessage> : null}
      {vehicles.data?.data.length === 0 ? <StateMessage>No vehicles yet.</StateMessage> : null}
      {vehicles.data && vehicles.data.data.length > 0 && filtered.length === 0 ? <StateMessage>No vehicles match these filters.</StateMessage> : null}
      {error && !draft ? <p className="mb-3 text-sm text-status-danger">{error}</p> : null}

      <ul className="space-y-3">
        {filtered.map((vehicle) => (
          <li key={vehicle.id} className="rounded-md border border-line bg-card p-4">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                <PhotoThumb fileId={vehicle.vehiclePhotoId} label="Vehicle" />
                <PhotoThumb fileId={vehicle.platePhotoId} label="Number plate" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link className="text-base font-semibold text-accent" to={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>
                    <p className="mt-1 text-sm font-medium">{vehicle.plateNumber}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => openEdit(vehicle)}>Edit</Button>
                    {confirmId === vehicle.id ? (
                      <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(vehicle.id)}>
                        {remove.isPending ? "Deleting..." : "Confirm delete"}
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setConfirmId(vehicle.id)}>Delete</Button>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-muted">Model</dt><dd>{vehicle.model}</dd></div>
                  <div><dt className="text-muted">Color</dt><dd>{vehicle.color}</dd></div>
                  <div><dt className="text-muted">Fuel</dt><dd>{vehicle.fuelType.label}</dd></div>
                  <div><dt className="text-muted">Driver</dt><dd>{vehicle.currentDriverName ?? "Unassigned"}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Insurance</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                      {vehicle.insurance ? (
                        <>
                          <span>{formatDate(vehicle.insurance.startDate)} to {formatDate(vehicle.insurance.endDate)}</span>
                          <Badge code={vehicle.insurance.status.code} label={vehicle.insurance.status.label} />
                        </>
                      ) : "Not recorded"}
                    </dd>
                  </div>
                </dl>
                {vehicle.note ? <p className="mt-3 line-clamp-2 text-sm text-muted">{vehicle.note}</p> : null}
                {(vehicle.photoIds ?? []).length > 0 ? (
                  <p className="mt-2 text-xs text-muted">{vehicle.photoIds.length} extra {vehicle.photoIds.length === 1 ? "photo" : "photos"}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
