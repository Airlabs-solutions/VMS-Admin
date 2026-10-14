import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  Bell,
  CarFront,
  ChevronDown,
  CircleDollarSign,
  Fuel,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  Sun,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { applyTheme, currentTheme, type ThemeName } from "../lib/theme";
import type { ListResponse, SessionUser, Status } from "../types";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
type NavGroup = { id: string; label: string; heading: boolean; items: NavItem[] };

const groups: NavGroup[] = [
  { id: "menu", label: "Menu", heading: false, items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    id: "fleet",
    label: "Fleet",
    heading: false,
    items: [
      { to: "/vehicles", label: "Records", icon: CarFront },
      { to: "/drivers", label: "Drivers", icon: Users },
      { to: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    heading: true,
    items: [
      { to: "/insurance", label: "Insurance", icon: Shield },
      { to: "/emi", label: "EMI", icon: CircleDollarSign },
      { to: "/fuel", label: "Fuel", icon: Fuel },
    ],
  },
  { id: "support", label: "Support", heading: false, items: [{ to: "/alerts", label: "Alerts", icon: Bell }] },
  { id: "account", label: "Account", heading: false, items: [{ to: "/settings", label: "Settings", icon: Settings }] },
];

type SearchResult = {
  vehicles: Array<{ id: string; plateNumber: string; make: string; model: string }>;
  drivers: Array<{ id: string; name: string; mobileMasked: string }>;
};

type AlertRow = { id: string; message: string; status: Status; dueDate: string | null; createdAt: string | null };

function roleLabel(role: SessionUser["role"]) {
  if (role === "super_admin") return "Super admin";
  if (role === "company_admin") return "Company admin";
  return "Driver";
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
    <div className="absolute top-12 right-0 left-0 z-40 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(20,40,30,0.08)]">
      {search.isLoading ? <p className="px-2 py-3 text-sm text-muted">Searching...</p> : null}
      {search.isError ? <p className="px-2 py-3 text-sm text-status-danger">Search failed. Try again.</p> : null}
      {search.data?.data.vehicles.map((vehicle) => (
        <Link key={vehicle.id} to={`/vehicles/${vehicle.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-brand-soft">
          <span className="font-medium text-ink">{vehicle.plateNumber}</span>
          <span className="ml-2 text-muted">{vehicle.make} {vehicle.model}</span>
        </Link>
      ))}
      {search.data?.data.drivers.map((driver) => (
        <Link key={driver.id} to="/drivers" className="block rounded-md px-2 py-2 text-sm hover:bg-brand-soft">
          <span className="font-medium text-ink">{driver.name}</span>
          <span className="ml-2 text-muted">{driver.mobileMasked}</span>
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("vms-admin-sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ fleet: true, finance: true });
  const [theme, setTheme] = useState<ThemeName>(() => currentTheme());
  const [panel, setPanel] = useState<"search" | "account" | "alerts" | null>(null);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const term = useDebounced(query.trim(), 250);

  const alerts = useQuery({
    queryKey: ["alerts", "shell"],
    queryFn: () => api<ListResponse<AlertRow>>("/alerts?limit=8"),
  });
  const search = useQuery({
    queryKey: ["search", term],
    queryFn: () => api<{ data: SearchResult }>(`/dashboard/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2 && panel === "search",
  });

  const openAlerts = (alerts.data?.data ?? []).filter((alert) => alert.status.code === "open");

  useEffect(() => {
    localStorage.setItem("vms-admin-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setPanel(null);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

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

  return (
    <div className="box-border h-screen overflow-hidden bg-canvas">
      {mobileOpen ? (
        <button type="button" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
      ) : null}

      <div className="admin-shell h-full w-full overflow-hidden bg-card" data-collapsed={collapsed ? "true" : "false"}>
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-line bg-sidebar transition-transform duration-300 ease-out lg:static lg:z-auto lg:h-full lg:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-[72px] items-center justify-between gap-2 px-4">
            <Link to="/dashboard" className={cn("min-w-0 truncate px-1 text-lg font-semibold tracking-tight text-ink", collapsed && "lg:w-full lg:text-center")}>
              VMS
            </Link>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-brand-soft lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Admin">
            {groups.map((group) => {
              const expandable = group.heading && group.items.length > 1;
              const open = openGroups[group.id] !== false;
              return (
                <div key={group.id} className={cn(group.heading && "pt-3")}>
                  {expandable ? (
                    <button
                      type="button"
                      className={cn("mb-1 flex w-full items-center justify-between px-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase", collapsed && "lg:hidden")}
                      aria-expanded={open}
                      onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !open }))}
                    >
                      {group.label}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-out", open ? "rotate-0" : "-rotate-90")} />
                    </button>
                  ) : null}
                  <div className={cn("space-y-0.5", expandable && !open && (collapsed ? "hidden lg:block" : "hidden"))}>
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        title={item.label}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150 ease-out",
                            isActive ? "bg-brand-soft font-medium text-ink shadow-[inset_3px_0_0_#a8d95b]" : "text-muted hover:bg-canvas hover:text-ink",
                            collapsed && "lg:justify-center lg:px-0",
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className={cn("truncate", collapsed && "lg:sr-only")}>{item.label}</span>
                        {item.to === "/alerts" && openAlerts.length > 0 ? (
                          <span className={cn("ml-auto grid h-5 min-w-5 place-items-center rounded-md bg-brand px-1 text-[11px] font-semibold text-ink", collapsed && "lg:hidden")}>
                            {openAlerts.length}
                          </span>
                        ) : null}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="space-y-1 border-t border-line p-3">
            <button
              type="button"
              className={cn(
                "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md text-sm text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink disabled:opacity-60",
                collapsed && "lg:px-0",
              )}
              disabled={signingOut}
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className={cn(collapsed && "lg:sr-only")}>{signingOut ? "Signing out..." : "Sign out"}</span>
            </button>
            <button
              type="button"
              className="hidden h-9 w-full items-center justify-center gap-2 rounded-md text-sm text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink lg:inline-flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              <span className={cn(collapsed && "lg:sr-only")}>{collapsed ? "Expand" : "Collapse sidebar"}</span>
            </button>
          </div>
        </aside>

        <div className="admin-main flex min-w-0 flex-col">
          <header className="relative z-30 shrink-0 border-b border-line bg-header">
            <div className="flex h-[72px] items-center gap-2 px-3 sm:gap-3 sm:px-5">
              <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink hover:bg-brand-soft lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
                <Menu className="h-5 w-5" />
              </button>

              <form onSubmit={onSearch} className="relative hidden min-w-0 flex-1 max-w-md md:block">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
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
                  placeholder="Search plate or driver"
                  aria-label="Search plate or driver"
                  className="h-10 w-full rounded-md border border-transparent bg-canvas pr-3 pl-9 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:bg-card focus:ring-2 focus:ring-brand/30"
                />
                {panel === "search" && term.length >= 2 ? <SearchResults search={search} /> : null}
              </form>

              <div className="ml-auto flex items-center gap-1 sm:gap-2">
                <div className="relative">
                  <button
                    type="button"
                    className="relative grid h-10 w-10 place-items-center rounded-md text-ink hover:bg-brand-soft"
                    aria-label="Open alerts"
                    aria-expanded={panel === "alerts"}
                    onClick={() => setPanel((current) => (current === "alerts" ? null : "alerts"))}
                  >
                    <Bell className="h-4 w-4" />
                    {openAlerts.length > 0 ? <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-brand" /> : null}
                  </button>
                  {panel === "alerts" ? (
                    <div className="absolute top-12 right-0 z-40 w-72 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(20,40,30,0.08)] sm:w-80">
                      <p className="px-2 py-2 text-sm font-semibold text-ink">Open alerts</p>
                      {alerts.isLoading ? <p className="px-2 py-3 text-sm text-muted">Loading alerts...</p> : null}
                      {alerts.isError ? <p className="px-2 py-3 text-sm text-status-danger">Could not load alerts.</p> : null}
                      {alerts.data && openAlerts.length === 0 ? <p className="px-2 py-3 text-sm text-muted">No open alerts.</p> : null}
                      <ul>
                        {openAlerts.slice(0, 5).map((alert) => (
                          <li key={alert.id} className="rounded-md px-2 py-2 text-sm text-ink hover:bg-brand-soft">
                            <p className="line-clamp-2">{alert.message}</p>
                          </li>
                        ))}
                      </ul>
                      <Link to="/alerts" className="block rounded-md px-2 py-2 text-sm font-medium text-brand-deep hover:bg-brand-soft">
                        View all
                      </Link>
                    </div>
                  ) : null}
                </div>

                <Link to="/settings" className="hidden h-10 w-10 place-items-center rounded-md text-ink hover:bg-brand-soft sm:grid" aria-label="Settings">
                  <Settings className="h-4 w-4" />
                </Link>

                <div className="relative">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md py-1 pr-1 pl-1 hover:bg-brand-soft"
                    aria-label="Account menu"
                    aria-expanded={panel === "account"}
                    onClick={() => setPanel((current) => (current === "account" ? null : "account"))}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand text-xs font-semibold text-ink">{initials(user.name)}</span>
                    <span className="hidden text-left lg:block">
                      <span className="block max-w-[9rem] truncate text-sm font-medium text-ink">{user.name}</span>
                      <span className="block max-w-[9rem] truncate text-xs text-muted">{user.email ?? roleLabel(user.role)}</span>
                    </span>
                  </button>
                  {panel === "account" ? (
                    <div className="absolute top-12 right-0 z-40 w-56 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(20,40,30,0.08)]">
                      <div className="px-2 py-2">
                        <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                        <p className="truncate text-xs text-muted">{roleLabel(user.role)}</p>
                      </div>
                      <Link to="/settings" className="block rounded-md px-2 py-2 text-sm text-ink hover:bg-brand-soft">Settings</Link>
                      <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink hover:bg-brand-soft" onClick={toggleTheme}>
                        {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                        {theme === "dark" ? "Light theme" : "Dark theme"}
                      </button>
                      <button type="button" className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line px-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-60" disabled={signingOut} onClick={signOut}>
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        {signingOut ? "Signing out..." : "Sign out"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <Link to="/vehicles" className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-brand-strong">
                  <span className="sm:hidden">Add</span>
                  <span className="hidden sm:inline">Add vehicle</span>
                </Link>
              </div>
            </div>

            <form onSubmit={onSearch} className="relative px-3 pb-3 md:hidden">
              <Search className="pointer-events-none absolute top-1/2 left-6 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
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
                placeholder="Search plate or driver"
                aria-label="Search plate or driver"
                className="h-10 w-full rounded-md border border-transparent bg-canvas pr-3 pl-9 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:bg-card focus:ring-2 focus:ring-brand/30"
              />
              {panel === "search" && term.length >= 2 ? <SearchResults search={search} /> : null}
            </form>
          </header>

          {panel === "account" || panel === "alerts" ? (
            <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close panel" onClick={() => setPanel(null)} />
          ) : null}

          <main key={location.pathname} className="page-enter min-h-0 flex-1 overflow-y-auto bg-canvas px-4 py-5 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
