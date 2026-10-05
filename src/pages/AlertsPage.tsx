import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, DataTable, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDate } from "../lib/format";
import type { ListResponse, Status } from "../types";

type Alert = {
  id: string;
  type: string;
  message: string;
  status: Status;
  dueDate: string | null;
  createdAt: string | null;
  vehicleId: string | null;
};
type Rule = { type: string; offsets: number[]; enabled: boolean; recipients: string[] };
type Sms = { id: string; recipientMasked: string; body: string; status: Status; sentAt: string | null; error: string | null };
type AlertView = "open" | "dismissed" | "all";

const typeLabels: Record<string, string> = {
  istimara_expiry: "Istimara",
  insurance_expiry: "Insurance",
  maintenance_date: "Maintenance date",
  maintenance_km: "Maintenance distance",
  license_expiry: "Driver license",
  iqama_expiry: "Iqama",
  emi_due: "EMI",
  violation_created: "Saher violation",
};

const recipientLabels: Record<string, string> = {
  admin: "Company admin",
  driver: "Driver",
};

const smsErrors: Record<string, string> = {
  NO_CREDITS: "No SMS credits left",
  SEND_FAILED: "The message could not be sent",
};

function typeLabel(type: string) {
  return typeLabels[type] ?? "Alert";
}

function formatOffsets(type: string, offsets: number[]) {
  if (type === "violation_created") return "When a violation is logged";
  const sorted = [...offsets].sort((a, b) => b - a);
  if (type === "maintenance_km") {
    return sorted.map((value) => (value === 0 ? "When due" : `${value.toLocaleString("en-US")} km before`)).join(", ");
  }
  return sorted.map((value) => (value === 0 ? "On the due date" : `${value} days before`)).join(", ");
}

function formatRecipients(recipients: string[]) {
  if (recipients.length === 0) return "Nobody";
  return recipients.map((recipient) => recipientLabels[recipient] ?? "Company admin").join(", ");
}

function whenLine(alert: Alert) {
  const due = formatDate(alert.dueDate);
  const raised = formatDate(alert.createdAt);
  if (due && raised) return `Due ${due}, raised ${raised}`;
  if (due) return `Due ${due}`;
  if (raised) return `Raised ${raised}`;
  return "";
}

export function AlertsPage() {
  const client = useQueryClient();
  const [view, setView] = useState<AlertView>("open");
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => api<ListResponse<Alert>>("/alerts?limit=100") });
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => api<{ data: Rule[] }>("/alert-rules") });
  const sms = useQuery({ queryKey: ["sms"], queryFn: () => api<ListResponse<Sms>>("/sms-logs?limit=30") });
  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/alerts/${id}`, { method: "PATCH", body: { status: "dismissed" } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const toggle = useMutation({
    mutationFn: (rule: Rule) => api(`/alert-rules/${rule.type}`, { method: "PATCH", body: { enabled: !rule.enabled } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["rules"] }),
  });

  const rows = alerts.data?.data ?? [];
  const counts = useMemo(
    () => ({
      open: rows.filter((alert) => alert.status.code === "open").length,
      dismissed: rows.filter((alert) => alert.status.code === "dismissed").length,
      all: rows.length,
    }),
    [rows],
  );
  const visible = rows.filter((alert) => view === "all" || alert.status.code === view);

  return (
    <div className="space-y-6">
      <PageHeader title="Alerts" description="Due dates, maintenance, EMI, and violations. Dismiss an alert after it is handled." />

      <section>
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Alert status">
          {(
            [
              ["open", "Open"],
              ["dismissed", "Dismissed"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium transition duration-200 ease-out",
                view === id ? "bg-brand text-white" : "border border-line bg-card text-ink hover:border-brand-mid",
              )}
              onClick={() => setView(id)}
            >
              {label} ({counts[id]})
            </button>
          ))}
        </div>

        {alerts.isLoading ? <Skeleton className="h-28 w-full" /> : null}
        {alerts.isError ? (
          <ErrorState title="Could not load alerts." detail="The alert list did not come back. Try again in a moment." onRetry={() => void alerts.refetch()} />
        ) : null}
        {alerts.data && visible.length === 0 ? (
          <EmptyState
            title={view === "open" ? "No open alerts." : view === "dismissed" ? "No dismissed alerts." : "No alerts yet."}
            detail={view === "open" ? "New alerts appear when a due date is reached." : undefined}
          />
        ) : null}
        {visible.length > 0 ? (
          <Panel>
            <ul>
              {visible.map((alert) => (
                <li key={alert.id} className="grid gap-3 border-t border-line px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{typeLabel(alert.type)}</p>
                    <p className="mt-1 text-sm leading-6 text-ink">{alert.message}</p>
                    <p className="mt-1 text-xs text-muted">
                      {whenLine(alert)}
                      {alert.vehicleId ? (
                        <>
                          {whenLine(alert) ? ", " : null}
                          <Link className="font-medium text-brand" to={`/vehicles/${alert.vehicleId}`}>
                            View vehicle
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge code={alert.status.code} label={alert.status.code === "dismissed" ? "Dismissed" : "Open"} />
                    {alert.status.code === "open" ? (
                      <Button
                        variant="secondary"
                        className="h-8"
                        disabled={dismiss.isPending && dismiss.variables === alert.id}
                        onClick={() => dismiss.mutate(alert.id)}
                      >
                        Dismiss
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-ink">When alerts are sent</h2>
        <p className="mt-1 mb-3 text-sm text-muted">Turn a rule off to stop new alerts and SMS for that item.</p>
        {rules.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {rules.isError ? (
          <ErrorState title="Could not load alert timing." detail="The rules did not come back. Try again in a moment." onRetry={() => void rules.refetch()} />
        ) : null}
        {rules.data ? (
          <div className="grid gap-3 md:grid-cols-2">
            {rules.data.data.map((rule) => (
              <Panel key={rule.type} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink">{typeLabel(rule.type)}</h3>
                    <p className="mt-1 text-sm leading-6 text-ink">{formatOffsets(rule.type, rule.offsets)}</p>
                    <p className="mt-1 text-xs text-muted">Sent to {formatRecipients(rule.recipients)}</p>
                  </div>
                  <Button
                    variant={rule.enabled ? "primary" : "secondary"}
                    className="h-8 shrink-0"
                    aria-pressed={rule.enabled}
                    disabled={toggle.isPending && toggle.variables?.type === rule.type}
                    onClick={() => toggle.mutate(rule)}
                  >
                    {rule.enabled ? "On" : "Off"}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-ink">SMS log</h2>
        {sms.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {sms.isError ? (
          <ErrorState title="Could not load the SMS log." detail="The message list did not come back. Try again in a moment." onRetry={() => void sms.refetch()} />
        ) : null}
        {sms.data?.data.length === 0 ? <EmptyState title="No SMS has been sent." /> : null}
        {sms.data && sms.data.data.length > 0 ? (
          <DataTable
            columns={["Sent", "To", "Message", "Status"]}
            rows={sms.data.data.map((row) => [
              formatDate(row.sentAt) || "Not sent",
              row.recipientMasked,
              row.body,
              <span key={row.id} className="inline-flex flex-col items-end gap-1 md:items-start">
                <Badge code={row.status.code} label={row.status.label} />
                {row.error ? <span className="text-xs text-status-danger">{smsErrors[row.error] ?? "The message could not be sent"}</span> : null}
              </span>,
            ])}
          />
        ) : null}
      </section>
    </div>
  );
}
