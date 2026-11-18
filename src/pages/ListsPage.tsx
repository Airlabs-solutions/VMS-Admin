import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, Fuel, MapPin, Receipt, Shield, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, DataTable, EmptyState, PageHeader, StateMessage, linkClass } from "../components/ui";
import { ApiError, api, download } from "../lib/api";
import { formatDate, formatKm, formatSar } from "../lib/format";
import type { ListResponse, Money, Status } from "../types";

function Frame({ title, exportPath, children }: { title: string; exportPath: string; children: ReactNode }) {
  return (
    <div>
      <PageHeader title={title}>
        <Button variant="secondary" onClick={() => void download(exportPath, `${title.toLowerCase()}.xlsx`)}>Export Excel</Button>
      </PageHeader>
      {children}
    </div>
  );
}

export function MaintenanceListPage() {
  const rows = useQuery({
    queryKey: ["maint-list"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; serviceType: string; nextDueDate: string | null; nextDueKm: number; status: Status; vehicleId: string }>>("/maintenance/schedules?limit=100"),
  });
  return (
    <Frame title="Maintenance" exportPath="/maintenance/export.xlsx">
      {rows.isLoading ? <StateMessage>Loading maintenance...</StateMessage> : null}
      {rows.data?.data.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-6 w-6" aria-hidden="true" />}
          title="Schedule vehicle maintenance and track due dates"
          detail="Open any vehicle to add service schedules by date or odometer distance."
          action={<Link to="/vehicles"><Button>Open vehicles</Button></Link>}
        />
      ) : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Plate", "Service", "Next date", "Next km", "Status"]}
          rows={rows.data.data.map((row) => [
            <Link key={row.id} className={linkClass} to={`/vehicles/${row.vehicleId}`}>{row.plateNumber}</Link>,
            row.serviceType,
            formatDate(row.nextDueDate),
            formatKm(row.nextDueKm),
            <Badge key={`${row.id}-s`} code={row.status.code} label={row.status.label} />,
          ])}
        />
      ) : null}
    </Frame>
  );
}

export function InsuranceListPage() {
  const rows = useQuery({
    queryKey: ["ins-list"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; insurer: string; policyNumber: string; startDate: string; endDate: string; premium: Money; status: Status; vehicleId: string }>>("/insurance/policies?limit=100"),
  });
  return (
    <Frame title="Insurance" exportPath="/insurance/export.xlsx">
      {rows.data?.data.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-6 w-6" aria-hidden="true" />}
          title="Add insurance policies and monitor renewals"
          detail="Open a vehicle to record its insurance policy and receive expiry alerts."
          action={<Link to="/vehicles"><Button>Open vehicles</Button></Link>}
        />
      ) : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Plate", "Insurer", "Policy", "Start", "Expiry", "Premium", "Status"]}
          rows={rows.data.data.map((row) => [
            <Link key={row.id} className={linkClass} to={`/vehicles/${row.vehicleId}`}>{row.plateNumber}</Link>,
            row.insurer,
            row.policyNumber,
            formatDate(row.startDate),
            formatDate(row.endDate),
            formatSar(row.premium),
            <Badge key={`${row.id}-s`} code={row.status.code} label={row.status.label} />,
          ])}
        />
      ) : rows.isLoading ? <StateMessage>Loading insurance...</StateMessage> : null}
    </Frame>
  );
}

type EmiRow = {
  id: string;
  vehicleName: string;
  plateNumber: string;
  bank: string;
  monthlyAmount: Money;
  balloonAmount: Money;
  remaining: Money;
  nextDue: string | null;
  nextInstallmentId: string | null;
  lastPaidInstallmentId: string | null;
  installmentsLeft: number;
  status: Status;
  vehicleId: string;
};

export function EmiListPage() {
  const client = useQueryClient();
  const rows = useQuery({
    queryKey: ["emi-list"],
    queryFn: () => api<ListResponse<EmiRow>>("/emi/plans?limit=100"),
  });
  const mark = useMutation({
    mutationFn: (input: { id: string; status: "paid" | "unpaid" }) => api(`/emi/installments/${input.id}`, { method: "PATCH", body: { status: input.status } }),
    onSuccess: async () => {
      await client.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "emi-list" || key === "unpaid" || key === "inst" || (typeof key === "string" && key.startsWith("emi-"));
        },
      });
    },
  });
  return (
    <Frame title="EMI" exportPath="/emi/export.xlsx">
      {rows.isLoading ? <StateMessage>Loading EMI plans...</StateMessage> : null}
      {rows.isError ? <StateMessage>Could not load EMI plans.</StateMessage> : null}
      {mark.isError ? <p className="mb-3 text-sm text-status-danger">{mark.error instanceof ApiError ? mark.error.message : "Could not update this EMI."}</p> : null}
      {rows.data?.data.length === 0 ? (
        <EmptyState
          icon={<CircleDollarSign className="h-6 w-6" aria-hidden="true" />}
          title="Add EMI plans and track monthly installments"
          detail="Open a vehicle to set up its financing schedule and payment status."
          action={<Link to="/vehicles"><Button>Open vehicles</Button></Link>}
        />
      ) : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Vehicle", "Bank", "EMI", "Balloon", "Next due", "Remaining", "Status", "Payment"]}
          rows={rows.data.data.map((row) => [
            <span key={row.id} className="flex flex-col items-start gap-1">
              <Link className={linkClass} to={`/vehicles/${row.vehicleId}?tab=EMI`}>{row.vehicleName || row.plateNumber}</Link>
              {row.vehicleName ? <span className="text-sm text-ink">{row.plateNumber}</span> : null}
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <Link className={linkClass} to={`/vehicles/${row.vehicleId}?tab=EMI`}>Past EMIs</Link>
                <Link className={linkClass} to={`/vehicles/${row.vehicleId}?tab=Istimara`}>Istimara</Link>
                <Link className={linkClass} to={`/vehicles/${row.vehicleId}?tab=Insurance`}>Insurance</Link>
              </span>
            </span>,
            row.bank,
            formatSar(row.monthlyAmount),
            formatSar(row.balloonAmount),
            formatDate(row.nextDue) || "None",
            formatSar(row.remaining),
            <Badge key={`${row.id}-s`} code={row.status.code} label={row.status.label} />,
            <span key={`${row.id}-pay`} className="flex flex-col items-start gap-2">
              {row.nextInstallmentId ? (
                <Button variant="secondary" className="h-8 px-2.5" disabled={mark.isPending} onClick={() => mark.mutate({ id: row.nextInstallmentId as string, status: "paid" })}>
                  {mark.isPending && mark.variables?.id === row.nextInstallmentId ? "Saving..." : "Mark paid"}
                </Button>
              ) : null}
              {row.lastPaidInstallmentId ? (
                <Button variant="secondary" className="h-8 px-2.5" disabled={mark.isPending} onClick={() => mark.mutate({ id: row.lastPaidInstallmentId as string, status: "unpaid" })}>
                  {mark.isPending && mark.variables?.id === row.lastPaidInstallmentId ? "Saving..." : "Mark unpaid"}
                </Button>
              ) : null}
            </span>,
          ])}
        />
      ) : null}
    </Frame>
  );
}

export function FuelListPage() {
  const rows = useQuery({
    queryKey: ["fuel-list"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; date: string; liters: number; cost: Money; approvalStatus: Status; vehicleId: string }>>("/fuel?limit=100"),
  });
  return (
    <Frame title="Fuel" exportPath="/fuel/export.xlsx">
      {rows.data?.data.length === 0 ? (
        <EmptyState
          icon={<Fuel className="h-6 w-6" aria-hidden="true" />}
          title="Log fuel fills and monitor consumption"
          detail="Fuel entries logged by drivers or from vehicle pages will appear here."
          action={<Link to="/vehicles"><Button>Open vehicles</Button></Link>}
        />
      ) : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Plate", "Date", "Liters", "Cost", "Approval"]}
          rows={rows.data.data.map((row) => [
            <Link key={row.id} className={linkClass} to={`/vehicles/${row.vehicleId}`}>{row.plateNumber}</Link>,
            formatDate(row.date),
            String(row.liters),
            formatSar(row.cost),
            row.approvalStatus.label,
          ])}
        />
      ) : rows.isLoading ? <StateMessage>Loading fuel logs...</StateMessage> : null}
    </Frame>
  );
}

export function ViolationListPage() {
  const rows = useQuery({
    queryKey: ["vio-list"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; number: string; date: string; amount: Money; status: Status; vehicleId: string }>>("/violations?limit=100"),
  });
  return (
    <Frame title="Violations" exportPath="/violations/export.xlsx">
      {rows.data?.data.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
          title="Record traffic violations and track payments"
          detail="Open a vehicle to log Saher or traffic violations and attach receipts."
          action={<Link to="/vehicles"><Button>Open vehicles</Button></Link>}
        />
      ) : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Plate", "Number", "Date", "Amount", "Status"]}
          rows={rows.data.data.map((row) => [
            <Link key={row.id} className={linkClass} to={`/vehicles/${row.vehicleId}`}>{row.plateNumber}</Link>,
            row.number,
            formatDate(row.date),
            formatSar(row.amount),
            <Badge key={`${row.id}-s`} code={row.status.code} label={row.status.label} />,
          ])}
        />
      ) : rows.isLoading ? <StateMessage>Loading violations...</StateMessage> : null}
    </Frame>
  );
}

export function TripListPage() {
  const rows = useQuery({
    queryKey: ["trip-list"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; date: string; startLocation: string; endLocation: string; distanceKm: number; vehicleId: string }>>("/trips?limit=100"),
  });
  return (
    <Frame title="Trips" exportPath="/trips/export.xlsx">
      {rows.data?.data.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6" aria-hidden="true" />}
          title="Log vehicle trips and track distances"
          detail="Trips recorded by drivers or added on a vehicle will show up here."
          action={<Link to="/vehicles"><Button>Open vehicles</Button></Link>}
        />
      ) : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Plate", "Date", "From", "To", "Distance"]}
          rows={rows.data.data.map((row) => [
            <Link key={row.id} className={linkClass} to={`/vehicles/${row.vehicleId}`}>{row.plateNumber}</Link>,
            formatDate(row.date),
            row.startLocation,
            row.endLocation,
            formatKm(row.distanceKm),
          ])}
        />
      ) : rows.isLoading ? <StateMessage>Loading trips...</StateMessage> : null}
    </Frame>
  );
}

export function ExpenseListPage() {
  const rows = useQuery({
    queryKey: ["exp-list"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; date: string; category: Status; amount: Money; vehicleId: string }>>("/expenses?limit=100"),
  });
  return (
    <Frame title="Expenses" exportPath="/expenses/export.xlsx">
      {rows.data?.data.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" aria-hidden="true" />}
          title="Track vehicle expenses in one place"
          detail="Open a vehicle to record tolls, washes, repairs, and other operating costs."
          action={<Link to="/vehicles"><Button>Open vehicles</Button></Link>}
        />
      ) : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Plate", "Date", "Category", "Amount"]}
          rows={rows.data.data.map((row) => [
            <Link key={row.id} className={linkClass} to={`/vehicles/${row.vehicleId}`}>{row.plateNumber}</Link>,
            formatDate(row.date),
            row.category.label,
            formatSar(row.amount),
          ])}
        />
      ) : rows.isLoading ? <StateMessage>Loading expenses...</StateMessage> : null}
    </Frame>
  );
}
