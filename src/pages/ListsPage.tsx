import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge, Button, DataTable, PageHeader, StateMessage, linkClass } from "../components/ui";
import { api, download } from "../lib/api";
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
      {rows.data?.data.length === 0 ? <StateMessage>No service schedules yet. Open a vehicle to add one.</StateMessage> : null}
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
      {rows.data?.data.length === 0 ? <StateMessage>No policies yet.</StateMessage> : null}
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

export function EmiListPage() {
  const rows = useQuery({
    queryKey: ["emi-list"],
    queryFn: () => api<ListResponse<{ id: string; plateNumber: string; bank: string; loanAmount: Money; monthlyAmount: Money; remaining: Money; nextDue: string | null; installmentsLeft: number; status: Status; vehicleId: string }>>("/emi/plans?limit=100"),
  });
  return (
    <Frame title="EMI" exportPath="/emi/export.xlsx">
      {rows.isLoading ? <StateMessage>Loading EMI plans...</StateMessage> : null}
      {rows.isError ? <StateMessage>Could not load EMI plans.</StateMessage> : null}
      {rows.data?.data.length === 0 ? <StateMessage>No EMI plans yet. Add one from a vehicle.</StateMessage> : null}
      {rows.data && rows.data.data.length > 0 ? (
        <DataTable
          columns={["Plate", "Bank", "Loan", "Monthly", "Next due", "Remaining", "Status"]}
          rows={rows.data.data.map((row) => [
            <Link key={row.id} className={linkClass} to={`/vehicles/${row.vehicleId}`}>{row.plateNumber}</Link>,
            row.bank,
            formatSar(row.loanAmount),
            formatSar(row.monthlyAmount),
            formatDate(row.nextDue),
            formatSar(row.remaining),
            <Badge key={`${row.id}-s`} code={row.status.code} label={row.status.label} />,
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
      {rows.data?.data.length === 0 ? <StateMessage>No fuel logs yet.</StateMessage> : null}
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
      {rows.data?.data.length === 0 ? <StateMessage>No violations yet.</StateMessage> : null}
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
      {rows.data?.data.length === 0 ? <StateMessage>No trips yet.</StateMessage> : null}
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
      {rows.data?.data.length === 0 ? <StateMessage>No expenses yet.</StateMessage> : null}
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
