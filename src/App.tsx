import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { StateMessage } from "./components/ui";
import { ApiError, api } from "./lib/api";
import { AlertsPage } from "./pages/AlertsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DriversPage } from "./pages/DriversPage";
import { EmiListPage, FuelListPage, InsuranceListPage } from "./pages/ListsPage";
import { LoginPage } from "./pages/LoginPage";
import { MessagesPage } from "./pages/MessagesPage";
import { PlatformPage } from "./pages/PlatformPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VehicleDetailPage } from "./pages/VehicleDetailPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { EmployeeDetailPage, EmployeesPage, HrDashboardPage } from "./pages/HrPages";
import {
  EquipmentDashboardPage,
  EquipmentDetailPage,
  EquipmentListPage,
  MobilizationBoardPage,
} from "./pages/EquipmentPages";
import type { SessionUser } from "./types";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function Start() {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ data: SessionUser }>("/auth/me") });
  const [error, setError] = useState("");
  const user = me.data?.data;

  useEffect(() => {
    if (!user || user.role !== "super_admin" || user.companyId) return;
    let cancelled = false;
    api("/auth/fleet", { method: "POST" })
      .then(() => client.invalidateQueries({ queryKey: ["me"] }))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not open the fleet");
      });
    return () => {
      cancelled = true;
    };
  }, [user, client]);

  if (error) return <StateMessage>{error}</StateMessage>;
  if (!user || (user.role === "super_admin" && !user.companyId)) return <StateMessage>Opening the fleet...</StateMessage>;
  return <Navigate to="/dashboard" replace />;
}

function RequireAuth() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ data: SessionUser }>("/auth/me") });
  if (me.isLoading) return <StateMessage>Loading your session...</StateMessage>;
  if (me.isError || !me.data || me.data.data.role === "driver") return <Navigate to="/login" replace />;
  return <AppShell user={me.data.data} />;
}

export function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Start />} />
            <Route path="/platform" element={<PlatformPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/insurance" element={<InsuranceListPage />} />
            <Route path="/emi" element={<EmiListPage />} />
            <Route path="/fuel" element={<FuelListPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/hr" element={<HrDashboardPage />} />
            <Route path="/hr/employees" element={<EmployeesPage />} />
            <Route path="/hr/employees/:id" element={<EmployeeDetailPage />} />
            <Route path="/equipment" element={<EquipmentDashboardPage />} />
            <Route path="/equipment/assets" element={<EquipmentListPage />} />
            <Route path="/equipment/assets/:id" element={<EquipmentDetailPage />} />
            <Route path="/equipment/mobilizations" element={<MobilizationBoardPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
