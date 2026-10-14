import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, DataTable, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Tabs } from "../components/ui";
import { api } from "../lib/api";
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
type AlertView = "open" | "overdue" | "dismissed" | "all";
type Tone = "overdue" | "soon" | "later" | "none";

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

function dayKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function toneFor(dueDate: string | null): Tone {
  if (!dueDate) return "none";
  const due = dayKey(dueDate);
  const today = dayKey(new Date());
  if (due < today) return "overdue";
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  if (due <= dayKey(soon)) return "soon";
  return "later";
}

function duePhrase(dueDate: string | null) {
  if (!dueDate) return "No due date";
  const date = formatDate(dueDate);
  if (!date) return "No due date";
  const tone = toneFor(dueDate);
  if (tone === "overdue") return `Overdue, due ${date}`;
  if (dayKey(dueDate) === dayKey(new Date())) return `Due today, ${date}`;
  return `Due ${date}`;
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

const toneClass: Record<Tone, string> = {
  overdue: "border-line border-l-4 border-l-status-danger bg-card",
  soon: "border-line border-l-4 border-l-status-warn bg-card",
  later: "border-line bg-card",
  none: "border-line bg-card",
};

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
      overdue: rows.filter((alert) => alert.status.code === "open" && toneFor(alert.dueDate) === "overdue").length,
      dismissed: rows.filter((alert) => alert.status.code === "dismissed").length,
      all: rows.length,
    }),
    [rows],
  );
  const visible = rows
    .filter((alert) => {
      if (view === "all") return true;
      if (view === "dismissed") return alert.status.code === "dismissed";
      if (alert.status.code !== "open") return false;
      if (view === "overdue") return toneFor(alert.dueDate) === "overdue";
      return true;
    })
    .sort((a, b) => {
      const rank = (alert: Alert) => {
        if (alert.status.code !== "open") return 3;
        const tone = toneFor(alert.dueDate);
        if (tone === "overdue") return 0;
        if (tone === "soon") return 1;
        return 2;
      };
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });

  return (
    <div className="space-y-8">
      <PageHeader title="Alerts" description="Due dates, maintenance, EMI, and violations. Dismiss an alert after it is handled." />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Open" value={alerts.isLoading ? null : counts.open} hint="Still need a look" />
        <Summary label="Overdue" value={alerts.isLoading ? null : counts.overdue} hint="Past the due date" />
        <Summary label="Dismissed" value={alerts.isLoading ? null : counts.dismissed} hint="Already handled" />
        <Summary label="All" value={alerts.isLoading ? null : counts.all} hint="In this list" />
      </section>

      <section className="space-y-3">
        <Tabs
          label="Alert status"
          value={view}
          options={(
            [
              ["open", "Open"],
              ["overdue", "Overdue"],
              ["dismissed", "Dismissed"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => ({ id, label: `${label} (${counts[id]})` }))}
          onChange={(id) => setView(id as AlertView)}
        />

        {alerts.isLoading ? <Skeleton className="h-28 w-full" /> : null}
        {alerts.isError ? (
          <ErrorState title="Could not load alerts." detail="The alert list did not come back. Try again in a moment." onRetry={() => void alerts.refetch()} />
        ) : null}
        {alerts.data && visible.length === 0 ? (
          <EmptyState
            title={view === "open" ? "No open alerts." : view === "overdue" ? "Nothing is overdue." : view === "dismissed" ? "No dismissed alerts." : "No alerts yet."}
            detail={view === "open" ? "New alerts appear when a due date is reached." : undefined}
          />
        ) : null}
        {visible.length > 0 ? (
          <ul className="grid gap-3">
            {visible.map((alert) => {
              const tone = alert.status.code === "open" ? toneFor(alert.dueDate) : "none";
              return (
                <li key={alert.id} className={`rounded-lg border p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] ${toneClass[tone]}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted">{typeLabel(alert.type)}</p>
                      <p className="mt-1 text-sm font-medium leading-6 text-ink">{alert.message}</p>
                    </div>
                    <Badge code={alert.status.code === "dismissed" ? undefined : tone === "overdue" ? "overdue" : tone === "soon" ? "due_soon" : "open"} label={alert.status.code === "dismissed" ? "Dismissed" : tone === "overdue" ? "Overdue" : tone === "soon" ? "Due soon" : "Open"} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs leading-5 text-muted">
                      {duePhrase(alert.dueDate)}
                      {formatDate(alert.createdAt) ? `, raised ${formatDate(alert.createdAt)}` : ""}
                      {alert.vehicleId ? (
                        <>
                          {". "}
                          <Link className="font-medium text-brand-deep hover:text-ink" to={`/vehicles/${alert.vehicleId}`}>
                            View vehicle
                          </Link>
                        </>
                      ) : null}
                    </p>
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
              );
            })}
          </ul>
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
          <Panel>
            <ul>
              {rules.data.data.map((rule) => (
                <li key={rule.type} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{typeLabel(rule.type)}</h3>
                      <Badge code={rule.enabled ? "active" : "inactive"} label={rule.enabled ? "On" : "Off"} />
                    </div>
                    <p className="mt-1 text-sm leading-6 text-ink">{formatOffsets(rule.type, rule.offsets)}</p>
                    <p className="mt-0.5 text-xs text-muted">Sent to {formatRecipients(rule.recipients)}</p>
                  </div>
                  <Button
                    variant={rule.enabled ? "secondary" : "primary"}
                    className="h-8 shrink-0"
                    aria-pressed={rule.enabled}
                    disabled={toggle.isPending && toggle.variables?.type === rule.type}
                    onClick={() => toggle.mutate(rule)}
                  >
                    {rule.enabled ? "Turn off" : "Turn on"}
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-ink">SMS log</h2>
        <p className="mt-1 mb-3 text-sm text-muted">Recent texts sent for these alerts. Phone numbers are masked.</p>
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

function Summary({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3 shadow-[0_1px_2px_rgba(17,22,16,0.04)]">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value == null ? "..." : value.toLocaleString("en-US")}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
