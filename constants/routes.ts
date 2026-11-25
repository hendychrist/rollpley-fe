export const ROUTES = {
  login: "/login",
  payroll: "/payroll",
  employees: "/master-karyawan",
} as const;

export const PROTECTED_ROUTES = [ROUTES.payroll, ROUTES.employees] as const;
