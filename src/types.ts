export type Status = { code: string; label: string };
export type Money = { halalas: number; sar: number };

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  role: "super_admin" | "company_admin" | "driver";
  companyId: string | null;
  companyName: string | null;
  driverId: string | null;
  supportGrantId: string | null;
};

export type ListResponse<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
