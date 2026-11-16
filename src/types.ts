export type Status = { code: string; label: string };
export type Money = { halalas: number; sar: number };

export type Module = "fleet" | "equipment" | "hr" | "payroll";

export type CompanyLimits = {
  vehicles: number;
  equipment: number;
  employees: number;
  adminSeats: number;
  smsCredits: number;
  storageMb: number;
};

export type Subscription = {
  plan: string;
  status: "trial" | "active" | "suspended" | "expired";
  startsAt: string;
  endsAt: string | null;
  notes: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  role: "super_admin" | "company_admin" | "fleet_manager" | "hr_manager" | "payroll_officer" | "equipment_manager" | "driver" | string;
  companyId: string | null;
  companyName: string | null;
  driverId: string | null;
  supportGrantId: string | null;
  modules?: string[];
  permissions?: string[];
  limits?: CompanyLimits;
};

export type ListResponse<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
