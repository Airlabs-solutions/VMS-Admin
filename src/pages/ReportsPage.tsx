import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, DataTable, PageHeader, SelectInput, StateMessage, TextInput } from "../components/ui";
import { api, download } from "../lib/api";
import type { ListResponse } from "../types";

const reports = [
  ["vehicles", "Vehicle list"],
  ["expiries", "Expiry report"],
  ["maintenance", "Maintenance history"],
  ["costs", "Cost per vehicle"],
  ["fuel", "Fuel report"],
  ["emi", "EMI report"],
  ["violations", "Violations report"],
  ["assignments", "Assignment history"],
] as const;

export function ReportsPage() {
  const [name, setName] = useState<string>("vehicles");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const report = useQuery({
    queryKey: ["report", name, from, to],
    queryFn: () => api<ListResponse<Record<string, unknown>>>(`/reports/${name}${suffix}`),
  });
  const rows = report.data?.data ?? [];
  const columns = rows[0] ? Object.keys(rows[0]).filter((key) => key !== "totalHalalas") : [];

  return (
    <div>
      <PageHeader title="Reports">
        <Button variant="secondary" onClick={() => void download(`/reports/${name}/export.xlsx${suffix}`, `${name}.xlsx`)}>Export Excel</Button>
      </PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <SelectInput value={name} onChange={(event) => setName(event.target.value)}>
          {reports.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
        <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      {report.isLoading ? <StateMessage>Loading report...</StateMessage> : null}
      {report.isError ? <StateMessage>Could not load this report.</StateMessage> : null}
      {rows.length === 0 && !report.isLoading ? <StateMessage>No rows for these filters.</StateMessage> : null}
      {rows.length > 0 ? <DataTable columns={columns} rows={rows.map((row) => columns.map((column) => String(row[column] ?? "")))} /> : null}
    </div>
  );
}
