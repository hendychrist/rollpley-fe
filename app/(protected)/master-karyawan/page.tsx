import { Suspense } from "react";
import { EmployeeWorkspace } from "@/components/employee/employee-workspace";
import { Skeleton } from "@/components/base/skeleton";
export default function EmployeesPage() { return <Suspense fallback={<div className="content-wrap"><Skeleton lines={7} /></div>}><EmployeeWorkspace /></Suspense>; }
