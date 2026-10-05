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

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/vehicles": "Records",
  "/drivers": "Drivers",
  "/messages": "Messages",
  "/insurance": "Insurance",
  "/emi": "EMI",
  "/fuel": "Fuel",
  "/alerts": "Alerts",
  "/settings": "Settings",
};

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
    <div className="absolute top-12 right-0 left-0 z-40 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(28,36,52,0.08)]">
      {search.isLoading ? <p className="px-2 py-3 text-sm text-muted">Searching...</p> : null}
      {search.isError ? <p className="px-2 py-3 text-sm text-status-danger">Search failed. Try again.</p> : null}
      {search.data?.data.vehicles.map((vehicle) => (
        <Link key={vehicle.id} to={`/vehicles/${vehicle.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-canvas">
          <span className="font-medium text-ink">{vehicle.plateNumber}</span>
          <span className="ml-2 text-muted">{vehicle.make} {vehicle.model}</span>
        </Link>
      ))}
      {search.data?.data.drivers.map((driver) => (
        <Link key={driver.id} to="/drivers" className="block rounded-md px-2 py-2 text-sm hover:bg-canvas">
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
  const [panel, setPanel] = useState<"search" | "account" | null>(null);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const term = useDebounced(query.trim(), 250);
  const section = titles[location.pathname] ?? (location.pathname.startsWith("/vehicles/") ? "Vehicle" : "Admin");

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
    <div className="admin-shell min-h-screen bg-canvas" data-collapsed={collapsed ? "true" : "false"}>
      {mobileOpen ? (
        <button type="button" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-sidebar transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-3">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-md px-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand text-xs font-semibold text-white">VMS</span>
            <span className={cn("min-w-0 truncate text-sm font-semibold text-ink", collapsed && "lg:hidden")}>Vehicle Management</span>
          </Link>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-canvas lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Admin">
          {groups.map((group) => {
            const expandable = group.heading && group.items.length > 1;
            const open = openGroups[group.id] !== false;
            return (
              <div key={group.id} className={cn(group.heading && "pt-3")}>
                {expandable ? (
                  <button
                    type="button"
                    className={cn("mb-1 flex w-full items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-muted uppercase", collapsed && "lg:hidden")}
                    aria-expanded={open}
                    onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !open }))}
                  >
                    {group.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-out", open ? "rotate-0" : "-rotate-90")} />
                  </button>
                ) : null}
                <div className={cn("space-y-1", expandable && !open && (collapsed ? "hidden lg:block" : "hidden"))}>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150 ease-out",
                          isActive ? "bg-brand/10 font-medium text-brand" : "text-muted hover:bg-canvas hover:text-ink",
                          collapsed && "lg:justify-center lg:px-0",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className={cn("truncate", collapsed && "lg:sr-only")}>{item.label}</span>
                      {item.to === "/alerts" && openAlerts.length > 0 ? (
                        <span className={cn("ml-auto rounded-md bg-highlight px-1.5 py-0.5 text-[11px] font-semibold text-[#1c2434]", collapsed && "lg:hidden")}>
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

        <div className="border-t border-line p-3">
          <div className={cn("flex items-center gap-2.5 rounded-md px-1 py-1", collapsed && "lg:justify-center")}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-xs font-semibold text-brand">{initials(user.name)}</span>
            <span className={cn("min-w-0", collapsed && "lg:hidden")}>
              <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
              <span className="block truncate text-xs text-muted">{roleLabel(user.role)}</span>
            </span>
          </div>
          <button
            type="button"
            className="mt-2 hidden h-9 w-full items-center justify-center gap-2 rounded-md text-sm text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            <span className={cn(collapsed && "lg:sr-only")}>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
          <button
            type="button"
            className={cn(
              "mt-1 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md text-sm text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink disabled:opacity-60",
              collapsed && "lg:px-0",
            )}
            disabled={signingOut}
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className={cn(collapsed && "lg:sr-only")}>{signingOut ? "Signing out..." : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-header">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-5">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-md text-ink hover:bg-canvas lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <p className="min-w-0 truncate text-sm text-muted">
            <span className="hidden sm:inline">Admin <span className="px-1 text-line">/</span></span>
            <span className="font-medium text-ink">{section}</span>
          </p>

          <form onSubmit={onSearch} className="relative ml-auto hidden min-w-0 flex-1 max-w-md md:block">
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
              className="h-10 w-full rounded-md border border-line bg-card pr-3 pl-9 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
            {panel === "search" && term.length >= 2 ? <SearchResults search={search} /> : null}
          </form>

          <button type="button" className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink hover:bg-canvas md:ml-0" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand/10 text-xs font-semibold text-brand" aria-label="Account menu" aria-expanded={panel === "account"} onClick={() => setPanel(panel === "account" ? null : "account")}>
            {initials(user.name)}
          </button>

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
              className="h-10 w-full rounded-md border border-line bg-card pr-3 pl-9 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
            {panel === "search" && term.length >= 2 ? <SearchResults search={search} /> : null}
          </form>

          {panel === "account" ? (
            <div className="absolute top-full right-3 z-40 mt-1 w-56 rounded-lg border border-line bg-card p-2 shadow-[0_8px_24px_rgba(28,36,52,0.08)] sm:right-5">
              <div className="px-2 py-2">
                <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                <p className="truncate text-xs text-muted">{roleLabel(user.role)}</p>
              </div>
              <Link to="/settings" className="block rounded-md px-2 py-2 text-sm text-ink hover:bg-canvas">Settings</Link>
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink hover:bg-canvas disabled:opacity-60" disabled={signingOut} onClick={signOut}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          ) : null}
        </header>

        {panel === "account" ? <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close panel" onClick={() => setPanel(null)} /> : null}

        <main key={location.pathname} className="page-enter mx-auto w-full max-w-[1536px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
