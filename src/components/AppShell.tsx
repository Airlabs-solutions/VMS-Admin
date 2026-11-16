import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Building,
  CarFront,
  CircleDollarSign,
  FileSpreadsheet,
  FolderKanban,
  Fuel,
  HardHat,
  Layers,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  PlusCircle,
  Search,
  Settings,
  Shield,
  Sun,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { applyTheme, currentTheme, type ThemeName } from "../lib/theme";
import type { ListResponse, SessionUser, Status } from "../types";

type ModuleKey = "fleet" | "hr" | "equipment";

type RibbonItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeCount?: number;
  exact?: boolean;
};

type RibbonGroup = {
  id: string;
  caption: string;
  items: RibbonItem[];
};

type ModuleTabDef = {
  key: ModuleKey;
  label: string;
  defaultPath: string;
  icon: typeof CarFront;
  ctaLabel: string;
  ctaTo: string;
  groups: RibbonGroup[];
};

function buildModuleTabs(
  user: SessionUser,
  unreadMessages: number,
  openAlertsCount: number,
): ModuleTabDef[] {
  const isSuper = user.role === "super_admin";
  const enabled = user.modules && user.modules.length > 0 ? user.modules : ["fleet", "hr", "equipment"];
  const tabs: ModuleTabDef[] = [];

  if (enabled.includes("fleet") || isSuper) {
    tabs.push({
      key: "fleet",
      label: "Fleet Management",
      defaultPath: "/dashboard",
      icon: CarFront,
      ctaLabel: "Add vehicle",
      ctaTo: "/vehicles",
      groups: [
        {
          id: "fleet-overview",
          caption: "Overview",
          items: [
            { to: "/dashboard", label: "Fleet Dashboard", icon: LayoutDashboard, exact: true },
          ],
        },
        {
          id: "fleet-ops",
          caption: "Fleet Operations",
          items: [
            { to: "/vehicles", label: "Vehicle Register", icon: CarFront },
            { to: "/drivers", label: "Drivers", icon: Users },
            { to: "/messages", label: "Messages", icon: MessageSquare, badgeCount: unreadMessages },
          ],
        },
        {
          id: "fleet-finance",
          caption: "Finance & Fuel",
          items: [
            { to: "/insurance", label: "Insurance", icon: Shield },
            { to: "/emi", label: "EMI Schedule", icon: CircleDollarSign },
            { to: "/fuel", label: "Fuel Logs", icon: Fuel },
          ],
        },
        {
          id: "fleet-admin",
          caption: "Compliance & System",
          items: [
            { to: "/alerts", label: "Alerts", icon: Bell, badgeCount: openAlertsCount },
            ...(isSuper ? [{ to: "/platform", label: "Companies", icon: Building }] : []),
            { to: "/settings", label: "Settings", icon: Settings },
          ],
        },
      ],
    });
  }

  if (enabled.includes("hr") || isSuper) {
    tabs.push({
      key: "hr",
      label: "Human Resources (HR)",
      defaultPath: "/hr",
      icon: Briefcase,
      ctaLabel: "Add employee",
      ctaTo: "/hr/employees?action=new",
      groups: [
        {
          id: "hr-overview",
          caption: "HR Overview",
          items: [
            { to: "/hr", label: "HR Dashboard", icon: LayoutDashboard, exact: true },
          ],
        },
        {
          id: "hr-workforce",
          caption: "Employee Management",
          items: [
            { to: "/hr/employees", label: "Employee Register", icon: UserCheck, exact: true },
            { to: "/hr/employees?action=new", label: "New Employee", icon: UserPlus, exact: true },
            { to: "/hr/employees?action=import", label: "Bulk Import", icon: FileSpreadsheet, exact: true },
          ],
        },
        {
          id: "hr-compliance",
          caption: "Compliance & Setup",
          items: [
            { to: "/hr/employees?expiring=30", label: "Expiring Docs", icon: AlertTriangle, exact: true },
            { to: "/hr?lookups=open", label: "Depts & Lookups", icon: Layers, exact: true },
            { to: "/alerts", label: "HR Alerts", icon: Bell, badgeCount: openAlertsCount },
          ],
        },
        ...(isSuper
          ? [
              {
                id: "hr-system",
                caption: "Administration",
                items: [
                  { to: "/platform", label: "Companies", icon: Building },
                  { to: "/settings", label: "Settings", icon: Settings },
                ],
              },
            ]
          : []),
      ],
    });
  }

  if (enabled.includes("equipment") || isSuper) {
    tabs.push({
      key: "equipment",
      label: "Equipment Management",
      defaultPath: "/equipment",
      icon: HardHat,
      ctaLabel: "Add equipment",
      ctaTo: "/equipment/assets?action=new",
      groups: [
        {
          id: "eq-overview",
          caption: "Equipment Overview",
          items: [
            { to: "/equipment", label: "Equipment Dashboard", icon: LayoutDashboard, exact: true },
          ],
        },
        {
          id: "eq-register",
          caption: "Asset Register",
          items: [
            { to: "/equipment/assets", label: "Equipment Register", icon: Wrench, exact: true },
            { to: "/equipment/assets?action=new", label: "New Equipment", icon: PlusCircle, exact: true },
            { to: "/equipment/assets?action=import", label: "Bulk Import", icon: FileSpreadsheet, exact: true },
          ],
        },
        {
          id: "eq-deployment",
          caption: "Site Mobilization & Setup",
          items: [
            { to: "/equipment/mobilizations", label: "Mobilization Board", icon: MapPin },
            { to: "/equipment?categories=open", label: "Categories & Checklists", icon: FolderKanban, exact: true },
            { to: "/alerts", label: "Equipment Alerts", icon: Bell, badgeCount: openAlertsCount },
          ],
        },
        ...(isSuper
          ? [
              {
                id: "eq-system",
                caption: "Administration",
                items: [
                  { to: "/platform", label: "Companies", icon: Building },
                  { to: "/settings", label: "Settings", icon: Settings },
                ],
              },
            ]
          : []),
      ],
    });
  }

  return tabs;
}

function detectModuleFromPath(pathname: string, current: ModuleKey): ModuleKey {
  if (pathname.startsWith("/hr")) return "hr";
  if (pathname.startsWith("/equipment")) return "equipment";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/vehicles") ||
    pathname.startsWith("/drivers") ||
    pathname.startsWith("/messages") ||
    pathname.startsWith("/insurance") ||
    pathname.startsWith("/emi") ||
    pathname.startsWith("/fuel")
  ) {
    return "fleet";
  }
  return current;
}

function isRibbonItemActive(item: RibbonItem, pathname: string, search: string): boolean {
  const fullCurrent = `${pathname}${search}`;
  if (item.to.includes("?")) {
    return fullCurrent === item.to;
  }
  if (search && (pathname === "/hr" || pathname === "/hr/employees" || pathname === "/equipment" || pathname === "/equipment/assets")) {
    return false;
  }
  if (item.exact) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

type SearchResult = {
  vehicles: Array<{ id: string; plateNumber: string; make: string; model: string }>;
  drivers: Array<{ id: string; name: string; mobileMasked: string }>;
};

type AlertRow = { id: string; message: string; status: Status; dueDate: string | null; createdAt: string | null };

function roleLabel(role: SessionUser["role"]) {
  if (role === "super_admin") return "Super admin";
  if (role === "company_admin") return "Company admin";
  return role.replace(/_/g, " ");
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "AD"
  );
}

function SearchResults({ search }: { search: UseQueryResult<{ data: SearchResult }> }) {
  return (
    <div className="absolute top-11 right-0 left-0 z-50 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(20,40,30,0.12)]">
      {search.isLoading ? <p className="px-2 py-3 text-sm text-muted">Searching...</p> : null}
      {search.isError ? <p className="px-2 py-3 text-sm text-status-danger">Search failed. Try again.</p> : null}
      {search.data?.data.vehicles.map((vehicle) => (
        <Link key={vehicle.id} to={`/vehicles/${vehicle.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-brand-soft">
          <span className="font-medium text-ink">{vehicle.plateNumber}</span>
          <span className="ms-2 text-muted">{vehicle.make} {vehicle.model}</span>
        </Link>
      ))}
      {search.data?.data.drivers.map((driver) => (
        <Link key={driver.id} to="/drivers" className="block rounded-md px-2 py-2 text-sm hover:bg-brand-soft">
          <span className="font-medium text-ink">{driver.name}</span>
          <span className="ms-2 text-muted">{driver.mobileMasked}</span>
        </Link>
      ))}
      {search.data && search.data.data.vehicles.length + search.data.data.drivers.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted">No matches.</p>
      ) : null}
    </div>
  );
}

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function AppShell({ user }: { user: SessionUser }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeModule, setActiveModule] = useState<ModuleKey>(() =>
    detectModuleFromPath(location.pathname, "fleet"),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => currentTheme());
  const [panel, setPanel] = useState<"search" | "account" | "alerts" | null>(null);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const term = useDebounced(query.trim(), 250);

  const alerts = useQuery({
    queryKey: ["alerts", "shell"],
    queryFn: () => api<ListResponse<AlertRow>>("/alerts?limit=8"),
  });
  const messageUnread = useQuery({
    queryKey: ["message-unread"],
    queryFn: () => api<{ data: { unread: number } }>("/messages/unread"),
    refetchInterval: 15000,
  });
  const search = useQuery({
    queryKey: ["search", term],
    queryFn: () => api<{ data: SearchResult }>(`/dashboard/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2 && panel === "search",
  });

  const openAlerts = (alerts.data?.data ?? []).filter((alert) => alert.status.code === "open");
  const unreadMessages = messageUnread.data?.data.unread ?? 0;

  const moduleTabs = buildModuleTabs(user, unreadMessages, openAlerts.length);
  const currentTab = moduleTabs.find((t) => t.key === activeModule) ?? moduleTabs[0];

  useEffect(() => {
    setActiveModule((prev) => detectModuleFromPath(location.pathname, prev));
    setMobileOpen(false);
    setPanel(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setPanel(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function signOut() {
    setSigningOut(true);
    void api("/auth/logout", { method: "POST" }).finally(() => {
      window.location.assign("/login");
    });
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPanel("search");
  }

  function handleSelectModule(tab: ModuleTabDef) {
    setActiveModule(tab.key);
    navigate(tab.defaultPath);
  }

  return (
    <div className="box-border flex h-screen flex-col overflow-hidden bg-canvas">
      {/* Top Tier 1: Brand + 3 Module Switcher Tabs + Global Search & User Bar */}
      <header className="relative z-40 shrink-0 border-b border-line bg-sidebar">
        <div className="flex min-h-[54px] flex-wrap items-center justify-between gap-2 px-3 sm:px-5">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink hover:bg-brand-soft lg:hidden"
              aria-label="Toggle module menu"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-md px-2 py-1 text-base font-bold tracking-tight text-ink"
            >
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-bold text-ink">
                V
              </span>
              <span>VMS ERP</span>
            </Link>

            {/* Top Module Switcher Tabs (Fleet | HR | Equipment) */}
            <nav className="flex items-center gap-1 pt-1" aria-label="Platform Modules">
              {moduleTabs.map((tab) => {
                const isSelected = currentTab?.key === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleSelectModule(tab)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-t-md border-t border-x px-3.5 py-2 text-xs sm:text-sm font-semibold transition-colors duration-150",
                      isSelected
                        ? "border-line bg-card text-ink shadow-[inset_0_3px_0_0_#a8d95b]"
                        : "border-transparent bg-transparent text-muted hover:bg-card/60 hover:text-ink",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Global Controls: Search, Alerts, Settings, Account, Quick Action */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <form onSubmit={onSearch} className="relative hidden w-56 xl:w-72 md:block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPanel("search");
                }}
                onFocus={() => setPanel("search")}
                onBlur={() => {
                  window.setTimeout(() => setPanel((current) => (current === "search" ? null : current)), 180);
                }}
                placeholder="Search plate or driver..."
                aria-label="Search plate or driver"
                className="h-8 w-full rounded-md border border-line bg-card pe-3 ps-8 text-xs text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              {panel === "search" && term.length >= 2 ? <SearchResults search={search} /> : null}
            </form>

            <div className="relative">
              <button
                type="button"
                className="relative grid h-8 w-8 place-items-center rounded-md border border-line bg-card text-ink hover:bg-brand-soft"
                aria-label="Open alerts"
                aria-expanded={panel === "alerts"}
                onClick={() => setPanel((current) => (current === "alerts" ? null : "alerts"))}
              >
                <Bell className="h-4 w-4" />
                {openAlerts.length > 0 ? <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand" /> : null}
              </button>
              {panel === "alerts" ? (
                <div className="absolute top-10 right-0 z-50 w-72 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(20,40,30,0.12)] sm:w-80">
                  <p className="px-2 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Open alerts ({openAlerts.length})</p>
                  {alerts.isLoading ? <p className="px-2 py-3 text-sm text-muted">Loading alerts...</p> : null}
                  {alerts.isError ? <p className="px-2 py-3 text-sm text-status-danger">Could not load alerts.</p> : null}
                  {alerts.data && openAlerts.length === 0 ? <p className="px-2 py-3 text-sm text-muted">No open alerts.</p> : null}
                  <ul>
                    {openAlerts.slice(0, 5).map((alert) => (
                      <li key={alert.id} className="rounded-md px-2 py-1.5 text-xs text-ink hover:bg-brand-soft">
                        <p className="line-clamp-2">{alert.message}</p>
                      </li>
                    ))}
                  </ul>
                  <Link to="/alerts" className="mt-1 block rounded-md px-2 py-1.5 text-xs font-semibold text-brand-deep hover:bg-brand-soft">
                    View all alerts
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 rounded-md border border-line bg-card px-2 py-1 hover:bg-brand-soft"
                aria-label="Account menu"
                aria-expanded={panel === "account"}
                onClick={() => setPanel((current) => (current === "account" ? null : "account"))}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand text-[11px] font-semibold text-ink">
                  {initials(user.name)}
                </span>
                <span className="hidden text-start lg:block">
                  <span className="block max-w-[8rem] truncate text-xs font-semibold text-ink">{user.name}</span>
                </span>
              </button>
              {panel === "account" ? (
                <div className="absolute top-10 right-0 z-50 w-56 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(20,40,30,0.12)]">
                  <div className="border-b border-line px-2 py-2">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    <p className="truncate text-xs text-muted">{user.email ?? roleLabel(user.role)}</p>
                  </div>
                  <Link to="/settings" className="mt-1 block rounded-md px-2 py-1.5 text-sm text-ink hover:bg-brand-soft">
                    Settings
                  </Link>
                  {user.role === "super_admin" ? (
                    <Link to="/platform" className="block rounded-md px-2 py-1.5 text-sm text-ink hover:bg-brand-soft">
                      Platform Companies
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-ink hover:bg-brand-soft"
                    onClick={toggleTheme}
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                    {theme === "dark" ? "Light theme" : "Dark theme"}
                  </button>
                  <button
                    type="button"
                    className="mt-1 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-line px-2 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-60"
                    disabled={signingOut}
                    onClick={signOut}
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              ) : null}
            </div>

            {currentTab ? (
              <Link
                to={currentTab.ctaTo}
                className="inline-flex h-8 items-center justify-center rounded-md bg-brand px-3 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-brand-strong"
              >
                {currentTab.ctaLabel}
              </Link>
            ) : null}
          </div>
        </div>

        {/* Tier 2: ERP Module Ribbon Bar (Shows Options Within the Selected Module) */}
        {currentTab ? (
          <div
            className={cn(
              "border-t border-line bg-card px-3 py-1.5 sm:px-5",
              mobileOpen ? "block" : "hidden lg:block",
            )}
          >
            <div className="flex flex-wrap items-stretch gap-3 overflow-x-auto">
              {currentTab.groups.map((group, groupIndex) => (
                <div
                  key={group.id}
                  className={cn(
                    "flex flex-col justify-between pe-3",
                    groupIndex < currentTab.groups.length - 1 && "border-r border-line",
                  )}
                >
                  <div className="flex items-center gap-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isRibbonItemActive(item, location.pathname, location.search);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            "group relative flex min-w-[78px] flex-col items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-center transition-colors duration-150",
                            active
                              ? "bg-brand-soft font-semibold text-ink shadow-[inset_0_-2px_0_0_#a8d95b]"
                              : "text-muted hover:bg-canvas hover:text-ink",
                          )}
                        >
                          <span className="relative">
                            <Icon
                              className={cn(
                                "h-5 w-5 transition-transform duration-150 group-hover:scale-105",
                                active ? "text-brand-deep" : "text-ink/80",
                              )}
                              aria-hidden="true"
                            />
                            {item.badgeCount && item.badgeCount > 0 ? (
                              <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-md bg-brand px-1 text-[10px] font-bold text-ink">
                                {item.badgeCount > 9 ? "9+" : item.badgeCount}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[11px] leading-tight whitespace-nowrap">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="mt-1 border-t border-line/60 pt-0.5 text-center text-[10px] font-medium tracking-wider text-muted uppercase">
                    {group.caption}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      {panel === "account" || panel === "alerts" ? (
        <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close panel" onClick={() => setPanel(null)} />
      ) : null}

      <main key={`${location.pathname}${location.search}`} className="page-enter min-h-0 flex-1 overflow-y-auto bg-canvas px-4 py-5 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
