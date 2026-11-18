import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CarFront } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DateField } from "../components/DateField";
import { DocumentCapture } from "../components/DocumentCapture";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, PhoneInput, SelectInput, StateMessage, TextArea, TextInput, linkClass } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { emiSchedule, monthsRemaining } from "../lib/emi";
import { formatDate, formatSar } from "../lib/format";
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
  fahasExpiry?: string | null;
};

type DriverOption = { id: string; name: string; mobileMasked: string };

type LinkedDriver = {
  name: string;
  mobile: string | null;
  employeeId: string;
  status: Status;
  iqamaNumber: string | null;
  iqamaExpiry: string | null;
  licenseNumber: string | null;
  licenseType: Status;
  licenseExpiry: string | null;
};

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
  insurancePolicyNumber: string;
  insuranceInsurer: string;
  insuranceFileId: string;
  fahasExpiry: string;
};

type EmiDraft = {
  bank: string;
  emiAmount: string;
  balloonAmount: string;
  interestRate: string;
  tenureMonths: string;
  startDate: string;
  dueDay: string;
};

const ADD_DRIVER = "__add__";

const licenseTypes = [
  ["private", "Private"],
  ["light_transport", "Light transport"],
  ["heavy", "Heavy"],
  ["motorcycle", "Motorcycle"],
  ["other", "Other"],
] as const;

type NewDriver = {
  name: string;
  mobile: string;
  employeeId: string;
  status: string;
  iqamaNumber: string;
  iqamaExpiry: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  portalAccess: boolean;
  ocrFileIds?: string[];
};

function blankDriver(): NewDriver {
  return {
    name: "",
    mobile: "",
    employeeId: "",
    status: "active",
    iqamaNumber: "",
    iqamaExpiry: "",
    licenseNumber: "",
    licenseType: "private",
    licenseExpiry: "",
    portalAccess: false,
    ocrFileIds: [],
  };
}

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
    insurancePolicyNumber: "",
    insuranceInsurer: "",
    insuranceFileId: "",
    fahasExpiry: "",
  };
}

function EmiSummary({ emi }: { emi: EmiDraft }) {
  const tenure = Number(emi.tenureMonths);
  const preview = emiSchedule(Number(emi.emiAmount), Number(emi.balloonAmount || 0), tenure);
  if (!preview) return null;
  const remaining = monthsRemaining(emi.startDate, tenure);
  const paidMonths = remaining == null ? 0 : Math.max(0, tenure - remaining);
  const balloon = preview.balloonHalalas > 0 ? ` Balloon ${formatSar({ halalas: preview.balloonHalalas })} after the monthly payments.` : "";
  return (
    <p className="text-sm text-muted sm:col-span-2">
      EMI {formatSar({ halalas: preview.monthlyHalalas })} for {tenure} months.{balloon}
      {remaining == null ? "" : ` ${paidMonths} installment(s) up to today will be marked as paid automatically (${remaining} months remaining).`}{" "}
      <span className="font-semibold text-ink">Total {formatSar({ halalas: preview.totalHalalas })}.</span>
    </p>
  );
}

function blankEmi(): EmiDraft {
  return {
    bank: "",
    emiAmount: "",
    balloonAmount: "0",
    interestRate: "0",
    tenureMonths: "36",
    startDate: "",
    dueDay: "1",
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
    insurancePolicyNumber: "",
    insuranceInsurer: "",
    insuranceFileId: "",
    fahasExpiry: dateInput(vehicle.fahasExpiry || vehicle.pucExpiry || vehicle.fitnessExpiry),
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
  const [emi, setEmi] = useState<EmiDraft>(blankEmi());
  const [emiLocked, setEmiLocked] = useState(false);
  const [plateFile, setPlateFile] = useState<File | null>(null);
  const [vehicleFile, setVehicleFile] = useState<File | null>(null);
  const [istimaraFile, setIstimaraFile] = useState<File | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [newDriver, setNewDriver] = useState<NewDriver>(blankDriver());
  const [driverFiles, setDriverFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const vehicles = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<ListResponse<Vehicle>>("/vehicles?limit=500"),
  });
  const drivers = useQuery({
    queryKey: ["driver-options"],
    queryFn: () => api<ListResponse<DriverOption>>("/drivers?limit=500"),
  });
  const linkedDriver = useQuery({
    queryKey: ["driver", draft?.driverId],
    queryFn: () => api<{ data: LinkedDriver }>(`/drivers/${draft?.driverId}`),
    enabled: Boolean(draft?.driverId) && draft?.driverId !== ADD_DRIVER,
  });

  function openAdd() {
    setError("");
    setPlateFile(null);
    setVehicleFile(null);
    setIstimaraFile(null);
    setExtraFiles([]);
    setNewDriver(blankDriver());
    setDriverFiles([]);
    setEmi(blankEmi());
    setEmiLocked(false);
    setDraft(blankDraft());
  }

  function openEdit(vehicle: Vehicle) {
    setError("");
    setPlateFile(null);
    setVehicleFile(null);
    setIstimaraFile(null);
    setExtraFiles([]);
    setNewDriver(blankDriver());
    setDriverFiles([]);
    setEmi(blankEmi());
    setEmiLocked(false);
    setConfirmId("");
    setDraft(draftFrom(vehicle));
    void api<ListResponse<{
      bank: string;
      monthlyAmount: { sar: number };
      balloonAmount: { sar: number };
      interestRate: number;
      tenureMonths: number;
      installmentCount: number;
      startDate: string | null;
      dueDay: number;
      installmentsLeft: number;
    }>>(`/emi/plans?vehicleId=${vehicle.id}&limit=1`).then((result) => {
      const plan = result.data[0];
      if (!plan) return;
      setEmi({
        bank: plan.bank,
        emiAmount: String(plan.monthlyAmount.sar),
        balloonAmount: String(plan.balloonAmount.sar),
        interestRate: String(plan.interestRate ?? 0),
        tenureMonths: String(plan.tenureMonths),
        startDate: dateInput(plan.startDate),
        dueDay: String(plan.dueDay),
      });
      setEmiLocked(false);
    }).catch(() => undefined);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      if ((draft.insuranceStart && !draft.insuranceEnd) || (!draft.insuranceStart && draft.insuranceEnd)) {
        throw new ApiError("Enter both the insurance start and expiry dates", 400);
      }
      let driverId = draft.driverId;
      if (driverId === ADD_DRIVER) {
        if (!newDriver.name.trim()) throw new ApiError("Enter the driver name", 400);
        if (newDriver.mobile.trim().length < 7) throw new ApiError("Enter a mobile number", 400);
        if (!/^\d{10}$/.test(newDriver.iqamaNumber.replace(/\D/g, ""))) throw new ApiError("Iqama number must be 10 digits", 400);
        if (!newDriver.iqamaExpiry) throw new ApiError("Choose the iqama expiry date", 400);
        if (newDriver.licenseNumber.trim().length < 3) throw new ApiError("Enter the license number", 400);
        if (!newDriver.licenseExpiry) throw new ApiError("Choose the license expiry date", 400);
        const uploaded = await Promise.all(driverFiles.map((file) => uploadPhoto(file, "drivers")));
        const created = await api<{ data: { id: string } }>("/drivers", {
          method: "POST",
          body: {
            name: newDriver.name.trim(),
            mobile: newDriver.mobile.trim(),
            employeeId: newDriver.employeeId.trim(),
            iqamaNumber: newDriver.iqamaNumber.replace(/\D/g, ""),
            iqamaExpiry: newDriver.iqamaExpiry,
            licenseNumber: newDriver.licenseNumber.trim(),
            licenseType: newDriver.licenseType,
            licenseExpiry: newDriver.licenseExpiry,
            status: newDriver.status,
            portalAccess: newDriver.portalAccess,
            fileIds: [...(newDriver.ocrFileIds ?? []), ...uploaded],
          },
        });
        driverId = created.data.id;
      }
      const wantsEmi = !emiLocked && Boolean(emi.bank.trim() || emi.emiAmount.trim() || emi.startDate);
      const emiAmount = Number(emi.emiAmount);
      const balloonAmount = Number(emi.balloonAmount || 0);
      const interest = Number(emi.interestRate || 0);
      const tenure = Number(emi.tenureMonths || 36);
      const dueDay = Number(emi.dueDay || 1);
      if (wantsEmi && (!emi.bank.trim() || !emi.emiAmount.trim() || !emi.startDate)) {
        throw new ApiError("Complete the EMI section, or leave bank, EMI amount, and start date empty", 400);
      }
      if (wantsEmi && (!emiSchedule(emiAmount, balloonAmount, tenure) || interest < 0 || interest > 100 || dueDay < 1 || dueDay > 28)) {
        throw new ApiError("Check the EMI amount, balloon amount, interest, tenure, and due day", 400);
      }
      const [platePhotoId, vehiclePhotoId, istimaraFileId, uploadedExtras] = await Promise.all([
        plateFile ? uploadPhoto(plateFile, "plates") : Promise.resolve(undefined),
        vehicleFile ? uploadPhoto(vehicleFile, "vehicles") : Promise.resolve(undefined),
        istimaraFile ? uploadPhoto(istimaraFile, "istimara") : Promise.resolve(undefined),
        Promise.all(extraFiles.map((file) => uploadPhoto(file, "vehicles"))),
      ]);
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
        ...(draft.insurancePolicyNumber ? { insurancePolicyNumber: draft.insurancePolicyNumber } : {}),
        ...(draft.insuranceInsurer ? { insuranceInsurer: draft.insuranceInsurer } : {}),
        ...(draft.insuranceFileId ? { insuranceFileId: draft.insuranceFileId } : {}),
        ...(istimaraFileId ? { istimaraFileIds: [istimaraFileId] } : {}),
        ...(driverId === draft.driverId && newDriver.ocrFileIds?.length ? { driverLicenseFileIds: newDriver.ocrFileIds } : {}),
        fahasExpiry: draft.fahasExpiry,
        ...(platePhotoId ? { platePhotoId } : {}),
        ...(vehiclePhotoId ? { vehiclePhotoId } : {}),
      };
      let vehicleId = draft.id ?? "";
      try {
        const saved = draft.id
          ? await api<{ data: { id: string } }>(`/vehicles/${draft.id}`, { method: "PATCH", body })
          : await api<{ data: { id: string } }>("/vehicles", { method: "POST", body });
        vehicleId = saved.data.id;
        const previous = vehicles.data?.data.find((item) => item.id === vehicleId)?.currentDriverId ?? "";
        if (driverId && driverId !== previous) {
          await api(`/drivers/${driverId}/assign`, {
            method: "POST",
            body: { vehicleId, date: new Date().toISOString(), odometerKm: draft.odometerKm },
          });
        } else if (!driverId && previous) {
          await api(`/drivers/${previous}/unassign`, { method: "POST", body: { date: new Date().toISOString() } });
        }
        if (wantsEmi) {
          await api("/emi/plans", {
            method: "POST",
            body: {
              vehicleId,
              bank: emi.bank.trim(),
              emiAmount,
              balloonAmount,
              interestRate: interest,
              tenureMonths: tenure,
              startDate: emi.startDate,
              dueDay,
            },
          });
        }
      } catch (err) {
        if (!draft.id && vehicleId) {
          setDraft({ ...draft, id: vehicleId, driverId });
        } else if (driverId !== draft.driverId) {
          setDraft({ ...draft, driverId });
        }
        throw err;
      }
    },
    onSuccess: async () => {
      setDraft(null);
      setEmi(blankEmi());
      setEmiLocked(false);
      setPlateFile(null);
      setVehicleFile(null);
      setIstimaraFile(null);
      setExtraFiles([]);
      setNewDriver(blankDriver());
      setDriverFiles([]);
      await client.invalidateQueries({ queryKey: ["vehicles"] });
      await client.invalidateQueries({ queryKey: ["driver-options"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the vehicle"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: async (_result, id) => {
      setConfirmId("");
      setError("");
      setDraft((current) => (current?.id === id ? null : current));
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
  const deleting = vehicles.data?.data.find((vehicle) => vehicle.id === confirmId);

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

  const monthsLeft = monthsRemaining(emi.startDate, Number(emi.tenureMonths));

  const vehicleForm = draft ? (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <PhotoPicker label="Vehicle photo" file={vehicleFile} existingId={draft.vehiclePhotoId} onChange={setVehicleFile} />
          <PhotoPicker label="Number plate photo" file={plateFile} existingId={draft.platePhotoId} onChange={setPlateFile} />
          <PhotoPicker label="Istimara picture" file={istimaraFile} existingId={null} onChange={setIstimaraFile} />
              {draft.photoIds.map((id) => (
                <div key={id} className="space-y-1">
                  <PhotoThumb fileId={id} label="Extra photo" />
                  <button
                    type="button"
                    className="text-sm text-brand-deep hover:text-ink"
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
                  <option value="">Select driver</option>
                  {drivers.data?.data.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name} ({driver.mobileMasked})</option>
                  ))}
                  <option value={ADD_DRIVER}>Add driver</option>
                </SelectInput>
              </Field>
              {draft.driverId === ADD_DRIVER ? (
                <NewDriverFields
                  driver={newDriver}
                  files={driverFiles}
                  onChange={setNewDriver}
                  onFiles={setDriverFiles}
                />
              ) : draft.driverId ? (
                <LinkedDriverDetails
                  vehicleId={draft.id || undefined}
                  driverId={draft.driverId}
                  driver={linkedDriver.data?.data}
                  loading={linkedDriver.isLoading}
                  failed={linkedDriver.isError}
                  onUpdated={() => {
                    void client.invalidateQueries({ queryKey: ["driver", draft.driverId] });
                    void client.invalidateQueries({ queryKey: ["driver-options"] });
                    if (draft.id) void client.invalidateQueries({ queryKey: ["vehicle", draft.id] });
                  }}
                />
              ) : null}
              <Field label="Fahas">
                <DateField value={draft.fahasExpiry} onChange={(fahasExpiry) => setDraft({ ...draft, fahasExpiry })} />
              </Field>
              <div className="sm:col-span-2 mt-1 border-t border-line pt-3">
                <h3 className="text-sm font-semibold">EMI</h3>
                {emiLocked ? <p className="mt-1 text-sm text-muted">Payments are already recorded, so this schedule stays as it is.</p> : null}
              </div>
              <Field label="Bank">
                <TextInput value={emi.bank} disabled={emiLocked} onChange={(event) => setEmi({ ...emi, bank: event.target.value })} />
              </Field>
              <Field label="EMI amount (SAR)">
                <TextInput value={emi.emiAmount} disabled={emiLocked} onChange={(event) => setEmi({ ...emi, emiAmount: event.target.value })} inputMode="decimal" />
              </Field>
              <Field label="Balloon amount (SAR)">
                <TextInput value={emi.balloonAmount} disabled={emiLocked} onChange={(event) => setEmi({ ...emi, balloonAmount: event.target.value })} inputMode="decimal" />
              </Field>
              <Field label="Interest % per year">
                <TextInput value={emi.interestRate} disabled={emiLocked} onChange={(event) => setEmi({ ...emi, interestRate: event.target.value })} inputMode="decimal" />
              </Field>
              <Field label="Tenure (months)">
                <TextInput value={emi.tenureMonths} disabled={emiLocked} onChange={(event) => setEmi({ ...emi, tenureMonths: event.target.value })} inputMode="numeric" />
              </Field>
              <Field label="Start date">
                <DateField value={emi.startDate} onChange={(startDate) => { if (!emiLocked) setEmi({ ...emi, startDate }); }} />
              </Field>
              <Field label="Months remaining">
                <TextInput value={monthsLeft == null ? "" : String(monthsLeft)} disabled readOnly />
              </Field>
              <Field label="Due day (1 to 28)">
                <TextInput value={emi.dueDay} disabled={emiLocked} onChange={(event) => setEmi({ ...emi, dueDay: event.target.value })} inputMode="numeric" />
              </Field>
              <EmiSummary emi={emi} />
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
  ) : null;

  return (
    <div>
      <PageHeader title="Vehicles">
        <Button onClick={draft && !draft.id ? () => setDraft(null) : openAdd}>
          {draft && !draft.id ? "Close Form" : "Add vehicle"}
        </Button>
      </PageHeader>

      {draft && !draft.id ? (
        <Panel className="mb-4 p-4 sm:p-5">
          <h2 className="mb-4 text-base font-semibold text-brand-deep">Add vehicle</h2>
          {vehicleForm}
        </Panel>
      ) : null}

      {draft && draft.id ? (
        <Dialog title="Edit vehicle" onClose={() => { if (!save.isPending) setDraft(null); }}>
          {vehicleForm}
        </Dialog>
      ) : null}

      {vehicles.data && vehicles.data.data.length > 0 ? (
      <div className="mb-4 rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)]">
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
            <button type="button" className="text-brand-deep hover:text-ink" onClick={clearFilters}>Clear filters</button>
          ) : null}
        </div>
      </div>
      ) : null}

      {vehicles.isLoading ? <StateMessage>Loading vehicles...</StateMessage> : null}
      {vehicles.isError ? <StateMessage>{vehicles.error instanceof ApiError ? vehicles.error.message : "Could not load vehicles."}</StateMessage> : null}
      {vehicles.data?.data.length === 0 && !draft ? (
        <EmptyState
          icon={<CarFront className="h-6 w-6" aria-hidden="true" />}
          title="Add vehicles and track them"
          detail="Register your fleet vehicles to monitor istimara, insurance, maintenance, EMI, fuel, and driver assignments."
          action={<Button onClick={openAdd}>Add vehicle</Button>}
        />
      ) : null}
      {vehicles.data && vehicles.data.data.length > 0 && filtered.length === 0 ? (
        <EmptyState
          title="No vehicles match these filters"
          detail="Try clearing or adjusting your search filters."
          action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
        />
      ) : null}
      {error && !draft && !confirmId ? <p className="mb-3 text-sm text-status-danger">{error}</p> : null}

      <ul className="space-y-3">
        {filtered.map((vehicle) => (
          <li key={vehicle.id} className="rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)]">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                <PhotoThumb fileId={vehicle.vehiclePhotoId} label="Vehicle" />
                <PhotoThumb fileId={vehicle.platePhotoId} label="Number plate" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link className="text-base font-semibold text-ink hover:text-brand-deep" to={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>
                    <p className="mt-1 inline-flex rounded-md bg-brand-soft px-2 py-0.5 text-sm font-medium text-ink">{vehicle.plateNumber}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-card px-3.5 text-sm font-medium text-ink hover:border-brand hover:bg-brand-soft" to={`/vehicles/${vehicle.id}`}>Records</Link>
                    <Button variant="secondary" onClick={() => openEdit(vehicle)}>Edit</Button>
                    <Button variant="secondary" className="text-status-danger hover:border-status-danger" onClick={() => { setError(""); setConfirmId(vehicle.id); }}>Delete</Button>
                  </div>
                </div>
                <dl className="mt-3 grid gap-3 rounded-md bg-canvas p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-muted">Model</dt><dd>{vehicle.model}</dd></div>
                  <div><dt className="text-muted">Color</dt><dd>{vehicle.color}</dd></div>
                  <div><dt className="text-muted">Fuel</dt><dd>{vehicle.fuelType.label}</dd></div>
                  <div><dt className="text-muted">Driver</dt><dd>{vehicle.currentDriverName ?? "Unassigned"}</dd></div>
                  <div><dt className="text-muted">Fahas</dt><dd>{formatDate(vehicle.fahasExpiry || vehicle.pucExpiry || vehicle.fitnessExpiry) || "Not recorded"}</dd></div>
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
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <Link className={linkClass} to={`/vehicles/${vehicle.id}?tab=EMI`}>Past EMIs</Link>
                  <Link className={linkClass} to={`/vehicles/${vehicle.id}?tab=Istimara`}>Istimara</Link>
                  <Link className={linkClass} to={`/vehicles/${vehicle.id}?tab=Insurance`}>Insurance</Link>
                  <Link className={linkClass} to={`/vehicles/${vehicle.id}?tab=Maintenance`}>Maintenance</Link>
                </div>
                {vehicle.note ? <p className="mt-3 line-clamp-2 text-sm text-muted">{vehicle.note}</p> : null}
                {(vehicle.photoIds ?? []).length > 0 ? (
                  <p className="mt-2 text-xs text-muted">{vehicle.photoIds.length} extra {vehicle.photoIds.length === 1 ? "photo" : "photos"}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {confirmId ? (
        <Dialog title="Confirm delete" onClose={() => { if (!remove.isPending) setConfirmId(""); }}>
          <p className="text-sm leading-6 text-ink">
            Delete {deleting?.name || "this vehicle"}{deleting?.plateNumber ? `, ${deleting.plateNumber}` : ""}? The vehicle record will be removed.
          </p>
          {error ? <p className="mt-3 text-sm text-status-danger">{error}</p> : null}
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

function NewDriverFields({
  driver,
  files,
  onChange,
  onFiles,
}: {
  driver: NewDriver;
  files: File[];
  onChange: (driver: NewDriver) => void;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-line bg-canvas p-3 sm:col-span-2 sm:grid-cols-2">
      <p className="text-sm font-medium sm:col-span-2">Add driver</p>
      <div className="sm:col-span-2">
        <DocumentCapture
          kind="driver_license"
          title="Upload Driver License / Iqama (Auto-Fill)"
          onRead={(fileId, fields) => {
            onChange({
              ...driver,
              name: fields.name || driver.name,
              mobile: fields.mobile || driver.mobile,
              iqamaNumber: fields.iqamaNumber || driver.iqamaNumber,
              iqamaExpiry: fields.iqamaExpiry || driver.iqamaExpiry,
              licenseNumber: fields.licenseNumber || driver.licenseNumber,
              licenseType: fields.licenseType || driver.licenseType,
              licenseExpiry: fields.licenseExpiry || driver.licenseExpiry,
              ocrFileIds: fileId ? [...(driver.ocrFileIds ?? []), fileId] : driver.ocrFileIds,
            });
          }}
        />
      </div>
      <Field label="Name">
        <TextInput value={driver.name} onChange={(event) => onChange({ ...driver, name: event.target.value })} required />
      </Field>
      <Field label="Mobile">
        <PhoneInput value={driver.mobile} onChange={(mobile) => onChange({ ...driver, mobile })} required />
      </Field>
      <Field label="Employee ID">
        <TextInput value={driver.employeeId} onChange={(event) => onChange({ ...driver, employeeId: event.target.value })} />
      </Field>
      <Field label="Status">
        <SelectInput value={driver.status} onChange={(event) => onChange({ ...driver, status: event.target.value })}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectInput>
      </Field>
      <Field label="Iqama number">
        <TextInput inputMode="numeric" value={driver.iqamaNumber} placeholder="10 digits" onChange={(event) => onChange({ ...driver, iqamaNumber: event.target.value })} required />
      </Field>
      <Field label="Iqama expiry">
        <DateField value={driver.iqamaExpiry} onChange={(iqamaExpiry) => onChange({ ...driver, iqamaExpiry })} />
      </Field>
      <Field label="License number">
        <TextInput value={driver.licenseNumber} onChange={(event) => onChange({ ...driver, licenseNumber: event.target.value })} required />
      </Field>
      <Field label="License type">
        <SelectInput value={driver.licenseType} onChange={(event) => onChange({ ...driver, licenseType: event.target.value })}>
          {licenseTypes.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </SelectInput>
      </Field>
      <Field label="License expiry">
        <DateField value={driver.licenseExpiry} onChange={(licenseExpiry) => onChange({ ...driver, licenseExpiry })} />
      </Field>
      <label className="flex items-start gap-3 rounded-md border border-line bg-card p-3 sm:col-span-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-brand"
          checked={driver.portalAccess}
          onChange={(event) => onChange({ ...driver, portalAccess: event.target.checked })}
        />
        <span>
          <span className="block text-sm font-medium text-ink">Allow sign-in</span>
          <span className="mt-1 block text-xs leading-5 text-muted">The driver can sign in with their mobile number and a code. Leave this off unless they need the portal.</span>
        </span>
      </label>
      <div className="sm:col-span-2">
        <p className="text-sm font-medium">Documents</p>
        <p className="mt-1 text-xs text-muted">Iqama, license, or other files. PDF, images, and common documents, up to 10 MB each.</p>
        {files.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3">
                <span className="truncate">{file.name}</span>
                <button type="button" className="text-xs text-status-danger" onClick={() => onFiles(files.filter((_, item) => item !== index))}>Remove</button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-line bg-card px-3 py-2 text-sm">
          Add documents
          <input
            className="sr-only"
            type="file"
            multiple
            onChange={(event) => {
              onFiles([...files, ...Array.from(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted sm:col-span-2">This creates the same driver record used on Drivers, then links it to this vehicle.</p>
    </div>
  );
}

function LinkedDriverDetails({
  vehicleId,
  driverId,
  driver,
  loading,
  failed,
  onUpdated,
}: {
  vehicleId?: string;
  driverId: string;
  driver?: LinkedDriver & { fileIds?: string[] };
  loading: boolean;
  failed: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    mobile: "",
    employeeId: "",
    status: "active",
    iqamaNumber: "",
    iqamaExpiry: "",
    licenseNumber: "",
    licenseType: "private",
    licenseExpiry: "",
    fileIds: [] as string[],
  });

  useEffect(() => {
    if (!driver) return;
    setEditForm({
      name: driver.name ?? "",
      mobile: driver.mobile ?? "",
      employeeId: driver.employeeId ?? "",
      status: driver.status?.code ?? "active",
      iqamaNumber: driver.iqamaNumber ?? "",
      iqamaExpiry: dateInput(driver.iqamaExpiry),
      licenseNumber: driver.licenseNumber ?? "",
      licenseType: driver.licenseType?.code ?? "private",
      licenseExpiry: dateInput(driver.licenseExpiry),
      fileIds: driver.fileIds ?? [],
    });
  }, [driver]);

  async function saveDriverChanges() {
    setSaving(true);
    setSaveErr("");
    setSaveMsg("");
    try {
      await api(`/drivers/${driverId}`, {
        method: "PATCH",
        body: {
          name: editForm.name.trim(),
          mobile: editForm.mobile.trim(),
          employeeId: editForm.employeeId.trim(),
          status: editForm.status,
          iqamaNumber: editForm.iqamaNumber.replace(/\D/g, ""),
          iqamaExpiry: editForm.iqamaExpiry,
          licenseNumber: editForm.licenseNumber.trim(),
          licenseType: editForm.licenseType,
          licenseExpiry: editForm.licenseExpiry,
          fileIds: editForm.fileIds,
        },
      });
      setSaveMsg("Driver details updated.");
      setEditing(false);
      onUpdated();
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : "Could not update driver details");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted sm:col-span-2">Loading driver...</p>;
  if (failed || !driver) return <p className="text-sm text-status-danger sm:col-span-2">Could not load this driver.</p>;
  const rows: [string, string][] = [
    ["Name", driver.name],
    ["Mobile", driver.mobile || ""],
    ["Employee ID", driver.employeeId || ""],
    ["Status", driver.status.label],
    ["Iqama number", driver.iqamaNumber || ""],
    ["Iqama expiry", formatDate(driver.iqamaExpiry)],
    ["License number", driver.licenseNumber || ""],
    ["License type", driver.licenseType.label],
    ["License expiry", formatDate(driver.licenseExpiry)],
  ];
  return (
    <div className="grid gap-3 rounded-md border border-line bg-canvas p-3 sm:col-span-2 sm:grid-cols-2">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        <p className="text-sm font-medium">Driver details</p>
        <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel manual edit" : "Edit driver manually"}
        </Button>
      </div>
      <div className="sm:col-span-2">
        <DocumentCapture
          kind="driver_license"
          vehicleId={vehicleId}
          title="Upload Driver License / Iqama (Auto-Fill)"
          description="Upload a driver license or Iqama (JPG, PNG, or PDF) to extract and update license/Iqama details automatically, or click 'Edit driver manually' to enter details yourself."
          onRead={(fileId, fields) => {
            setEditing(true);
            setSaveMsg("");
            setEditForm((prev) => ({
              ...prev,
              name: fields.name || prev.name,
              mobile: fields.mobile || prev.mobile,
              iqamaNumber: fields.iqamaNumber || prev.iqamaNumber,
              iqamaExpiry: fields.iqamaExpiry || prev.iqamaExpiry,
              licenseNumber: fields.licenseNumber || prev.licenseNumber,
              licenseType: fields.licenseType || prev.licenseType,
              licenseExpiry: fields.licenseExpiry || prev.licenseExpiry,
              fileIds: fileId && !prev.fileIds.includes(fileId) ? [...prev.fileIds, fileId] : prev.fileIds,
            }));
          }}
        />
      </div>
      {editing ? (
        <>
          <Field label="Name">
            <TextInput value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="Mobile">
            <PhoneInput value={editForm.mobile} onChange={(mobile) => setEditForm({ ...editForm, mobile })} />
          </Field>
          <Field label="Employee ID">
            <TextInput value={editForm.employeeId} onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })} />
          </Field>
          <Field label="Status">
            <SelectInput value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectInput>
          </Field>
          <Field label="Iqama number">
            <TextInput value={editForm.iqamaNumber} onChange={(e) => setEditForm({ ...editForm, iqamaNumber: e.target.value })} />
          </Field>
          <Field label="Iqama expiry">
            <DateField value={editForm.iqamaExpiry} onChange={(iqamaExpiry) => setEditForm({ ...editForm, iqamaExpiry })} />
          </Field>
          <Field label="License number">
            <TextInput value={editForm.licenseNumber} onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })} />
          </Field>
          <Field label="License type">
            <SelectInput value={editForm.licenseType} onChange={(e) => setEditForm({ ...editForm, licenseType: e.target.value })}>
              {licenseTypes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="License expiry">
            <DateField value={editForm.licenseExpiry} onChange={(licenseExpiry) => setEditForm({ ...editForm, licenseExpiry })} />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="button" className="h-9 px-3 text-xs" disabled={saving} onClick={() => void saveDriverChanges()}>
              {saving ? "Saving driver..." : "Save driver details"}
            </Button>
            {saveErr ? <span className="text-xs text-status-danger">{saveErr}</span> : null}
          </div>
        </>
      ) : (
        rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted">{label}</p>
            <p className="text-sm">{value || "-"}</p>
          </div>
        ))
      )}
      {saveMsg ? <p className="text-xs font-medium text-brand-deep sm:col-span-2">{saveMsg}</p> : null}
      <p className="text-xs text-muted sm:col-span-2">
        Upload a license/Iqama above to extract fields automatically, or click Edit driver manually to update any field directly.
      </p>
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
        className="max-h-[min(92vh,900px)] w-full max-w-4xl overflow-y-auto rounded-lg border border-line bg-card p-4 shadow-[0_16px_40px_rgba(17,22,16,0.16)] sm:p-5"
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
