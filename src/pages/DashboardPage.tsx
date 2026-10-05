import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarClock, CarFront, Shield, Users, Wrench } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart, DonutChart, type ChartItem } from "../components/Charts";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { formatDate, formatSar } from "../lib/format";
import type { ListResponse, Money, Status } from "../types";

type Summary = {
  totalVehicles: number;
  active: number;
  inMaintenance: number;
  assigned: number;
  unassigned: number;
  drivers?: number;
  monthlyExpiries?: { insurance: number; istimara: number; license: number; iqama: number; total: number };
};
type Attention = { kind: string; title: string; dueDate: string | null; status: Status; vehicleId: string };
type Costs = { total: Money; categories: Record<string, Money> };
type Unpaid = {
  emis: Array<{ id: string; vehicleId: string; dueDate: string | null; amount: Money }>;
  violations: Array<{ id: string; vehicleId: string; date: string | null; amount: Money; number: string }>;
};
type Alert = { id: string; message: string; status: Status; dueDate: string | null; createdAt: string | null };
type Activity = { id: string; action: string; collectionName: string; at: string | null };

const costLabels: Record<string, string> = {
  maintenance: "Maintenance",
  fuel: "Fuel",
  emi: "EMI",
  insurance: "Insurance",
  fines: "Fines",
  other: "Other",
};

const costColors = ["#4B49AC", "#7978E9", "#7DA0FA", "#98BDFF", "#F3797E", "#3C3A92"];

const recordLabels: Record<string, string> = {
  vehicles: "Vehicle",
  drivers: "Driver",
  assignments: "Assignment",
  handovers: "Handover",
  insurancepolicies: "Insurance",
  istimaras: "Istimara",
  maintenanceschedules: "Maintenance",
  maintenancelogs: "Maintenance log",
  fuellogs: "Fuel",
  violations: "Violation",
  trips: "Trip",
  expenses: "Expense",
  emiplans: "EMI",
  emiinstallments: "EMI installment",
  directmessages: "Message",
  fileassets: "Document",
  users: "User",
  alertrules: "Alert rule",
  alerts: "Alert",
};

const actionLabels: Record<string, string> = {
  create: "Added",
  update: "Updated",
  delete: "Removed",
};

const statusRank: Record<string, number> = {
  expired: 0,
  overdue: 1,
  expiring_soon: 2,
  due_soon: 3,
};

function formatWhen(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatCard({
  to,
  label,
  value,
  detail,
  icon: Icon,
}: {
  to: string;
  label: string;
  value: number;
  detail: string;
  icon: typeof CarFront;
}) {
  return (
    <Link
      to={to}
      className="flex min-w-0 flex-col rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(28,36,52,0.05)] transition-colors duration-150 ease-out hover:border-brand-soft"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-muted">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-2xl leading-none font-semibold tracking-tight text-ink">{value.toLocaleString("en-US")}</p>
      <p className="mt-2 truncate text-xs text-muted">{detail}</p>
    </Link>
  );
}

function SectionTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {detail ? <p className="mt-0.5 text-xs text-muted">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[108px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-72 rounded-lg lg:col-span-7" />
        <Skeleton className="h-72 rounded-lg lg:col-span-5" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api<{ data: Summary }>("/dashboard/summary") });
  const attention = useQuery({ queryKey: ["attention"], queryFn: () => api<{ data: Attention[] }>("/dashboard/attention") });
  const costs = useQuery({ queryKey: ["costs"], queryFn: () => api<{ data: Costs }>("/dashboard/costs") });
  const unpaid = useQuery({ queryKey: ["unpaid"], queryFn: () => api<{ data: Unpaid }>("/dashboard/unpaid") });
  const alerts = useQuery({ queryKey: ["alerts", "dashboard"], queryFn: () => api<ListResponse<Alert>>("/alerts?limit=20") });
  const activity = useQuery({ queryKey: ["audit", "dashboard"], queryFn: () => api<ListResponse<Activity>>("/audit?limit=8") });

  const cards = summary.data?.data;
  const openAlerts = (alerts.data?.data ?? []).filter((alert) => alert.status.code === "open");
  const dueItems = useMemo(() => {
    return [...(attention.data?.data ?? [])].sort((a, b) => (statusRank[a.status.code] ?? 9) - (statusRank[b.status.code] ?? 9));
  }, [attention.data]);
  const urgent = dueItems.filter((item) => item.status.code === "expired" || item.status.code === "overdue").length;
  const expiryItems: ChartItem[] = [
    { label: "Insurance", value: cards?.monthlyExpiries?.insurance ?? 0, color: "#4B49AC" },
    { label: "Istimara", value: cards?.monthlyExpiries?.istimara ?? 0, color: "#7978E9" },
    { label: "License", value: cards?.monthlyExpiries?.license ?? 0, color: "#7DA0FA" },
    { label: "Iqama", value: cards?.monthlyExpiries?.iqama ?? 0, color: "#98BDFF" },
  ];
  const costItems: ChartItem[] = Object.entries(costs.data?.data.categories ?? {})
    .filter(([, value]) => value.halalas > 0)
    .map(([key, value], index) => ({
      label: costLabels[key] ?? key,
      value: value.halalas,
      color: costColors[index % costColors.length],
    }));

  const unpaidRows = [
    ...(unpaid.data?.data.emis ?? []).slice(0, 4).map((row) => ({
      id: row.id,
      label: `EMI ${formatDate(row.dueDate)}`,
      to: "/emi",
      amount: formatSar(row.amount),
    })),
    ...(unpaid.data?.data.violations ?? []).slice(0, 4).map((row) => ({
      id: row.id,
      label: row.number,
      to: `/vehicles/${row.vehicleId}`,
      amount: formatSar(row.amount),
    })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" description="Fleet totals, documents due, costs, and the latest record changes." />

      {summary.isLoading ? <DashboardSkeleton /> : null}
      {summary.isError ? (
        <ErrorState
          title="Could not load the dashboard."
          detail={summary.error instanceof ApiError ? summary.error.message : "The fleet summary did not come back. Try again in a moment."}
          onRetry={() => void summary.refetch()}
        />
      ) : null}

      {cards ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard to="/vehicles" label="Vehicles" value={cards.totalVehicles} detail={`${cards.active} active`} icon={CarFront} />
            <StatCard to="/drivers" label="Drivers" value={cards.drivers ?? 0} detail="Active drivers" icon={Users} />
            <StatCard to="/vehicles" label="Assigned" value={cards.assigned} detail={`${cards.unassigned} without a driver`} icon={Shield} />
            <StatCard to="/vehicles" label="Maintenance" value={cards.inMaintenance} detail="Out of service" icon={Wrench} />
            <StatCard to="/insurance" label="Expiring" value={cards.monthlyExpiries?.total ?? 0} detail="Due this month" icon={CalendarClock} />
            <StatCard to="/alerts" label="Open alerts" value={openAlerts.length} detail={urgent > 0 ? `${urgent} overdue or expired` : "Nothing urgent"} icon={Bell} />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-12">
            <Panel className="p-4 sm:p-5 lg:col-span-7">
              <SectionTitle title="Expiring this month" detail="Insurance, istimara, license, and iqama" action={<p className="text-2xl font-semibold tracking-tight text-ink">{cards.monthlyExpiries?.total ?? 0}</p>} />
              <BarChart items={expiryItems} />
            </Panel>

            <Panel className="p-4 sm:p-5 lg:col-span-5">
              <SectionTitle title="Costs this month" detail={costs.isLoading ? "Loading costs..." : costs.data ? formatSar(costs.data.data.total) : "Costs unavailable"} />
              {costs.isLoading ? <Skeleton className="h-36 w-full" /> : null}
              {costs.isError ? <p className="text-sm text-muted">Could not load costs.</p> : null}
              {costs.data ? <DonutChart items={costItems} /> : null}
            </Panel>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-12">
            <Panel className="p-4 sm:p-5 lg:col-span-7">
              <SectionTitle title="Needs attention" detail="Next 30 days" />
              {attention.isLoading ? <Skeleton className="h-24" /> : null}
              {attention.data && dueItems.length === 0 ? <p className="text-sm text-muted">Nothing is due in the next 30 days.</p> : null}
              <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
                {dueItems.slice(0, 8).map((item, index) => (
                  <li key={`${item.title}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{item.kind}</p>
                      <Link className="mt-0.5 block truncate font-medium text-brand" to={item.vehicleId ? `/vehicles/${item.vehicleId}` : "/drivers"}>
                        {item.title}
                      </Link>
                    </div>
                    <div className="text-right">
                      <Badge code={item.status.code} label={item.status.label} />
                      <p className="mt-1 text-xs text-muted">{formatDate(item.dueDate)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <div className="grid gap-4 lg:col-span-5">
              <Panel className="p-4 sm:p-5">
                <SectionTitle title="Open alerts" action={<Link className="text-xs font-medium text-brand" to="/alerts">View all</Link>} />
                {alerts.isLoading ? <Skeleton className="h-16" /> : null}
                {alerts.data && openAlerts.length === 0 ? <p className="text-sm text-muted">No open alerts.</p> : null}
                <ul className="max-h-56 space-y-3 overflow-y-auto">
                  {openAlerts.slice(0, 4).map((alert) => (
                    <li key={alert.id} className="border-l-2 border-highlight pl-3 text-sm">
                      <p className="text-ink">{alert.message}</p>
                      <p className="mt-1 text-xs text-muted">{formatDate(alert.dueDate ?? alert.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel className="p-4 sm:p-5">
                <SectionTitle title="Unpaid" action={<Link className="text-xs font-medium text-brand" to="/emi">EMI</Link>} />
                {unpaid.isLoading ? <Skeleton className="h-16" /> : null}
                {unpaid.data && unpaidRows.length === 0 ? <p className="text-sm text-muted">No overdue installments or unpaid violations.</p> : null}
                <ul className="divide-y divide-line text-sm">
                  {unpaidRows.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link className="min-w-0 truncate text-brand" to={row.to}>{row.label}</Link>
                      <span className="shrink-0 font-medium text-ink">{row.amount}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>

          <Panel className="p-4 sm:p-5">
            <SectionTitle title="Recent activity" detail="Latest adds, updates, and removals" />
            {activity.isLoading ? <Skeleton className="h-20" /> : null}
            {activity.data?.data.length === 0 ? <EmptyState title="No changes yet" detail="New records and updates will show up here." /> : null}
            <ul className="grid md:grid-cols-2 md:gap-x-8">
              {activity.data?.data.map((row) => (
                <li key={row.id} className="flex items-center gap-3 border-b border-line py-3 text-sm">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-ink">{actionLabels[row.action] ?? row.action} {recordLabels[row.collectionName] ?? row.collectionName}</span>
                  <span className="shrink-0 text-xs text-muted">{formatWhen(row.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
