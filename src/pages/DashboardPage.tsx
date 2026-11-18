import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CarFront,
  CircleDollarSign,
  ClipboardList,
  Fuel,
  IdCard,
  Pencil,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ColumnChart, Gauge, type ChartItem } from "../components/Charts";
import { Badge, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDate, formatSar } from "../lib/format";
import type { ListResponse, Money, SessionUser, Status } from "../types";

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

const FLEET_LIMIT = 500;

const costLabels: Record<string, string> = {
  maintenance: "Maint.",
  fuel: "Fuel",
  emi: "EMI",
  insurance: "Insurance",
  fines: "Fines",
  other: "Other",
};

const costNames: Record<string, string> = {
  maintenance: "Maintenance",
  fuel: "Fuel",
  emi: "EMI",
  insurance: "Insurance",
  fines: "Fines",
  other: "Other",
};

const costPalette = ["#202B3A", "#B66E52", "#475970", "#D19780", "#6B7C8E", "#E9E2D6"];

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

const cardClass = "rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)] sm:p-5";

const quickActions = [
  { to: "/vehicles", label: "Vehicles", icon: CarFront },
  { to: "/drivers", label: "Drivers", icon: Users },
  { to: "/fuel", label: "Fuel", icon: Fuel },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/emi", label: "EMI", icon: CircleDollarSign },
];

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

function compactHalalas(halalas: number) {
  const sar = Math.abs(halalas) / 100;
  const sign = halalas < 0 ? "-" : "";
  if (sar >= 1_000_000) return `${sign}${(sar / 1_000_000).toFixed(1)}m`;
  if (sar >= 1_000) return `${sign}${Math.round(sar / 1_000)}k`;
  return `${sign}${Math.round(sar).toLocaleString("en-US")}`;
}

function sumHalalas(rows: Array<{ amount: Money }>) {
  return rows.reduce((sum, row) => sum + (row.amount?.halalas ?? 0), 0);
}

function attentionIcon(kind: string) {
  if (kind === "Insurance") return Shield;
  if (kind === "Maintenance") return Wrench;
  if (kind === "License" || kind === "Iqama") return IdCard;
  return Bell;
}

function tipFor(input: { urgent: number; expiring: number; maintenance: number; unpaid: number; openAlerts: number }) {
  if (input.urgent > 0) {
    return {
      text: `${input.urgent} items are overdue or expired. Review them before they block a vehicle.`,
      href: "/alerts",
    };
  }
  if (input.expiring > 0) {
    return {
      text: `${input.expiring} documents expire this month. Check insurance, istimara, licenses, and iqama.`,
      href: "/insurance",
    };
  }
  if (input.maintenance > 0) {
    return {
      text: `${input.maintenance} vehicles are in maintenance. Confirm the service date before they return to the fleet.`,
      href: "/vehicles",
    };
  }
  if (input.unpaid > 0) {
    return {
      text: `${input.unpaid} unpaid EMI installments or violations are waiting.`,
      href: "/emi",
    };
  }
  if (input.openAlerts > 0) {
    return {
      text: `${input.openAlerts} alerts are still open.`,
      href: "/alerts",
    };
  }
  return {
    text: "Documents, payments, and maintenance look clear right now.",
    href: "/alerts",
  };
}

function WidgetTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {detail ? <p className="mt-0.5 text-xs text-muted">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-12">
        <Skeleton className="h-80 rounded-lg md:col-span-2 2xl:col-span-5" />
        <Skeleton className="h-80 rounded-lg 2xl:col-span-3" />
        <Skeleton className="h-80 rounded-lg 2xl:col-span-4 2xl:row-span-2" />
        <Skeleton className="h-40 rounded-lg 2xl:col-span-5" />
        <Skeleton className="h-40 rounded-lg 2xl:col-span-3" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-72 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [view, setView] = useState<"fleet" | "costs">("fleet");
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api<{ data: Summary }>("/dashboard/summary") });
  const attention = useQuery({ queryKey: ["attention"], queryFn: () => api<{ data: Attention[] }>("/dashboard/attention") });
  const costs = useQuery({ queryKey: ["costs"], queryFn: () => api<{ data: Costs }>("/dashboard/costs") });
  const unpaid = useQuery({ queryKey: ["unpaid"], queryFn: () => api<{ data: Unpaid }>("/dashboard/unpaid") });
  const alerts = useQuery({ queryKey: ["alerts", "dashboard"], queryFn: () => api<ListResponse<Alert>>("/alerts?limit=20") });
  const activity = useQuery({ queryKey: ["audit", "dashboard"], queryFn: () => api<ListResponse<Activity>>("/audit?limit=8") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ data: SessionUser }>("/auth/me") });

  const cards = summary.data?.data;
  const openAlerts = (alerts.data?.data ?? []).filter((alert) => alert.status.code === "open");
  const dueItems = useMemo(() => {
    return [...(attention.data?.data ?? [])].sort((a, b) => (statusRank[a.status.code] ?? 9) - (statusRank[b.status.code] ?? 9));
  }, [attention.data]);
  const urgent = dueItems.filter((item) => item.status.code === "expired" || item.status.code === "overdue").length;
  const unpaidHalalas = sumHalalas([...(unpaid.data?.data.emis ?? []), ...(unpaid.data?.data.violations ?? [])]);
  const unpaidCount = (unpaid.data?.data.emis.length ?? 0) + (unpaid.data?.data.violations.length ?? 0);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Asia/Riyadh" }).format(new Date());
  const companyName = me.data?.data.companyName || "Company fleet";

  const fleetItems: ChartItem[] = [
    { label: "Active", value: cards?.active ?? 0, color: "#a8d95b" },
    { label: "Assigned", value: cards?.assigned ?? 0, color: "#94c34f" },
    { label: "Workshop", value: cards?.inMaintenance ?? 0, color: "#86b356" },
    { label: "No driver", value: cards?.unassigned ?? 0, color: "#ffb765" },
    { label: "Expiring", value: cards?.monthlyExpiries?.total ?? 0, color: "#d9e486" },
    { label: "Alerts", value: openAlerts.length, color: "#e8e8e8" },
  ];

  const costItems: Array<ChartItem & { name: string }> = Object.entries(costs.data?.data.categories ?? {}).map(([key, value], index) => ({
    label: costLabels[key] ?? key,
    name: costNames[key] ?? key,
    value: value.halalas,
    color: costPalette[index % costPalette.length],
  }));
  const costTotal = costItems.reduce((sum, item) => sum + item.value, 0);
  const costShown = costItems.filter((item) => item.value > 0);
  const tip = tipFor({
    urgent,
    expiring: cards?.monthlyExpiries?.total ?? 0,
    maintenance: cards?.inMaintenance ?? 0,
    unpaid: unpaidCount,
    openAlerts: openAlerts.length,
  });

  const goals = cards
    ? [
        {
          label: "Assigned",
          current: cards.assigned,
          total: cards.totalVehicles,
          color: "#a8d95b",
          detail: cards.unassigned === 0 ? "Every vehicle has a driver" : `${cards.unassigned} without a driver`,
        },
        {
          label: "Active",
          current: cards.active,
          total: cards.totalVehicles,
          color: "#86b356",
          detail: cards.totalVehicles - cards.active === 0 ? "The whole fleet is active" : `${cards.totalVehicles - cards.active} not active`,
        },
        {
          label: "Available",
          current: Math.max(0, cards.totalVehicles - cards.inMaintenance),
          total: cards.totalVehicles,
          color: "#ffb765",
          detail: cards.inMaintenance === 0 ? "No vehicles in maintenance" : `${cards.inMaintenance} in the workshop`,
        },
      ]
    : [];

  const showAttention = dueItems.length > 0;
  const health = !cards || cards.totalVehicles === 0 ? 0 : Math.round((cards.active / cards.totalVehicles) * 100);
  const capacity = !cards ? 0 : Math.min(100, Math.round((cards.totalVehicles / FLEET_LIMIT) * 100));

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Dashboard</h1>
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
          <div className="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-12">
            <section className={cn(cardClass, "md:col-span-2 2xl:col-span-5")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[1.75rem] font-semibold tracking-tight text-ink tabular-nums sm:text-4xl sm:leading-none">
                    {view === "fleet"
                      ? cards.totalVehicles.toLocaleString("en-US")
                      : costs.isLoading
                        ? "..."
                        : costs.data
                          ? formatSar(costs.data.data.total)
                          : "Unavailable"}
                  </p>
                  <p className="mt-2 text-sm text-muted">{view === "fleet" ? "Fleet overview" : "Costs this month"}</p>
                </div>
                <label className="sr-only" htmlFor="overview-view">
                  Overview
                </label>
                <select
                  id="overview-view"
                  value={view}
                  onChange={(event) => setView(event.target.value as "fleet" | "costs")}
                  className="h-8 shrink-0 rounded-md border border-line bg-card px-2 text-xs font-medium text-ink outline-none focus:border-brand"
                >
                  <option value="fleet">Fleet</option>
                  <option value="costs">Costs</option>
                </select>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-[#a8d95b]" />
                  Selected
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-[#ffb765]" />
                  Accent
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-[#e8e8e8]" />
                  Other
                </span>
              </div>
              <div className="mt-4">
                {view === "costs" && costs.isLoading ? <Skeleton className="h-48 w-full" /> : null}
                {view === "costs" && costs.isError ? <p className="flex h-48 items-center text-sm text-muted">Could not load costs.</p> : null}
                {view === "fleet" ? <ColumnChart items={fleetItems} formatAxis={(value) => Math.round(value).toLocaleString("en-US")} /> : null}
                {view === "costs" && costs.data ? (
                  <ColumnChart items={costItems} formatValue={(value) => formatSar(value)} formatAxis={compactHalalas} />
                ) : null}
              </div>
            </section>

            <section className={cn(cardClass, "flex flex-col justify-between 2xl:col-span-3")}>
              <StatBlock label="Active vehicles" value={cards.active.toLocaleString("en-US")} detail="In service" />
              <StatBlock
                label="Monthly cost"
                value={costs.isLoading ? "..." : costs.data ? formatSar(costs.data.data.total) : "Unavailable"}
                detail="Recorded this month"
                divided
              />
              <StatBlock
                label="Unpaid"
                value={unpaid.isLoading ? "..." : unpaid.data ? formatSar(unpaidHalalas) : "Unavailable"}
                detail="EMI and violations"
                divided
              />
            </section>

            <section className={cn(cardClass, "flex h-full flex-col 2xl:col-span-4 2xl:row-span-2")}>
              <div className="rounded-lg bg-[#202B3A] p-4 text-white sm:p-5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-[#E9E2D6]">Fleet card</span>
                  <span className="truncate text-white/90">{companyName}</span>
                </div>
                <p className="mt-8 text-xs text-[#E9E2D6]">Registered vehicles</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{cards.totalVehicles.toLocaleString("en-US")}</p>
                <div className="mt-8 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] text-[#E9E2D6]">Active</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">{cards.active.toLocaleString("en-US")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-[#E9E2D6]">Drivers</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">{(cards.drivers ?? 0).toLocaleString("en-US")}</p>
                  </div>
                </div>
              </div>
              <div className="mt-auto grid grid-cols-5 gap-1 pt-4">
                {quickActions.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="flex flex-col items-center gap-1.5 rounded-md px-1 py-2 text-[11px] font-medium text-muted transition-colors duration-150 hover:bg-brand-soft hover:text-ink"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-md border border-line text-ink">
                      <action.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {action.label}
                  </Link>
                ))}
              </div>
            </section>

            <section className={cn(cardClass, "2xl:col-span-5")}>
              <WidgetTitle
                title="Fleet capacity"
                detail="Registered vehicles"
                action={
                  <Link to="/vehicles" aria-label="Open vehicles" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-brand-soft hover:text-ink">
                    <Pencil className="h-4 w-4" />
                  </Link>
                }
              />
              <div className="h-3 overflow-hidden rounded-md bg-line" role="meter" aria-valuenow={cards.totalVehicles} aria-valuemin={0} aria-valuemax={FLEET_LIMIT} aria-label="Fleet capacity">
                <div className="h-3 rounded-md bg-[#202B3A]" style={{ width: `${capacity}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm tabular-nums">
                <span className="font-semibold text-ink">{cards.totalVehicles.toLocaleString("en-US")}</span>
                <span className="text-muted">{FLEET_LIMIT.toLocaleString("en-US")}</span>
              </div>
            </section>

            <section className={cn(cardClass, "relative 2xl:col-span-3")}>
              <h2 className="text-[15px] font-semibold text-ink">Quick tips</h2>
              <p className="mt-3 pr-12 text-sm leading-6 text-ink">{tip.text}</p>
              <Link to={tip.href} className="mt-4 inline-flex text-sm font-medium text-brand-deep hover:text-ink">
                Read more
              </Link>
              <div className="pointer-events-none absolute right-4 bottom-4 grid grid-cols-2 gap-1" aria-hidden="true">
                <span className="h-3.5 w-3.5 rounded-sm bg-[#202B3A]" />
                <span className="h-3.5 w-3.5 rounded-sm bg-[#B66E52]" />
                <span className="h-3.5 w-3.5 rounded-sm bg-[#E9E2D6]" />
                <span className="h-3.5 w-3.5 rounded-sm bg-[#34414F]" />
              </div>
            </section>
          </div>

          <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <section className={cardClass}>
              <WidgetTitle title="Cost analysis" detail={monthLabel} />
              <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
                {costs.isLoading ? "..." : costs.data ? formatSar(costs.data.data.total) : "Unavailable"}
              </p>
              {costs.isError ? <p className="mt-3 text-sm text-muted">Could not load costs.</p> : null}
              {costs.data && costShown.length === 0 ? <p className="mt-4 text-sm text-muted">No costs recorded this month.</p> : null}
              {costShown.length > 0 ? (
                <>
                  <div className="mt-4 flex h-2.5 gap-1">
                    {costShown.map((item) => (
                      <div key={item.label} className="h-full rounded-sm" style={{ flex: `${item.value} 1 0`, background: item.color }} />
                    ))}
                  </div>
                  <ul className="mt-4 space-y-2 text-sm">
                    {costShown.map((item) => (
                      <li key={item.label} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
                          <span className="truncate text-ink">{item.name}</span>
                        </span>
                        <span className="font-medium text-muted tabular-nums">{Math.round((item.value / costTotal) * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>

            <section className={cardClass}>
              <WidgetTitle title="Fleet health" detail="Share of active vehicles" />
              <Gauge value={health} caption="Active vehicles" />
              <p className="mt-4 text-center text-xs text-muted">
                {urgent > 0 ? `${urgent} overdue or expired` : "Nothing overdue or expired"}
              </p>
            </section>

            <section className={cardClass}>
              <WidgetTitle title="Coverage" detail="Current fleet" />
              <ul className="space-y-4">
                {goals.map((goal) => {
                  const width = goal.total === 0 ? 0 : Math.round((goal.current / goal.total) * 100);
                  return (
                    <li key={goal.label}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-ink">{goal.label}</span>
                        <span className="text-muted tabular-nums">
                          {goal.current.toLocaleString("en-US")} / {goal.total.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-md bg-brand-soft">
                        <div className="h-2 rounded-md" style={{ width: `${width}%`, background: goal.color }} />
                      </div>
                      <p className="mt-1 text-xs text-muted">{goal.detail}</p>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className={cardClass}>
              <WidgetTitle
                title={showAttention ? "Needs attention" : "Recent activity"}
                detail={showAttention ? "Next 30 days" : "Latest adds, updates, and removals"}
                action={
                  showAttention ? (
                    <Link to="/alerts" className="text-xs font-medium text-brand-deep hover:text-ink">
                      View all
                    </Link>
                  ) : null
                }
              />
              {attention.isLoading || (!showAttention && activity.isLoading) ? <Skeleton className="h-24" /> : null}
              {attention.isError ? <p className="text-sm text-muted">Could not load items that need attention.</p> : null}
              {!attention.isLoading && !showAttention && activity.isError ? <p className="text-sm text-muted">Could not load recent activity.</p> : null}
              {!attention.isLoading && !showAttention && activity.data?.data.length === 0 ? (
                <EmptyState title="No changes yet" detail="New records and updates will show up here." />
              ) : null}
              {!attention.isLoading && showAttention ? (
                <ul className="divide-y divide-line">
                  {dueItems.slice(0, 6).map((item, index) => {
                    const Icon = attentionIcon(item.kind);
                    return (
                      <li key={`${item.title}-${index}`}>
                        <Link
                          to={item.vehicleId ? `/vehicles/${item.vehicleId}` : "/drivers"}
                          className="flex items-center gap-3 py-3"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-deep">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                            <span className="block truncate text-xs text-muted">{item.kind}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-xs text-muted">{formatDate(item.dueDate)}</span>
                            <span className="mt-1 inline-flex">
                              <Badge code={item.status.code} label={item.status.label} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : !attention.isLoading && !activity.isLoading ? (
                <ul className="divide-y divide-line">
                  {activity.data?.data.map((row) => (
                    <li key={row.id} className="flex items-center gap-3 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-deep">
                        <ClipboardList className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{recordLabels[row.collectionName] ?? row.collectionName}</span>
                        <span className="block truncate text-xs text-muted">{formatWhen(row.at)}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-medium",
                          row.action === "delete" ? "text-status-danger" : row.action === "create" ? "text-brand-deep" : "text-ink",
                        )}
                      >
                        {actionLabels[row.action] ?? row.action}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatBlock({ label, value, detail, divided }: { label: string; value: string; detail: string; divided?: boolean }) {
  return (
    <div className={cn(divided && "mt-4 border-t border-line pt-4")}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium text-brand-deep">{detail}</p>
    </div>
  );
}
