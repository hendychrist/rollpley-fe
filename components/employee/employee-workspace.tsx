"use client";
import { Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/base/button";
import { BaseErrorState } from "@/components/base/error-state";
import { EmptyState } from "@/components/base/empty-state";
import { BaseLoadingState } from "@/components/base/loading-state";
import { PageHeader, Panel } from "@/components/base/panel";
import { Pagination } from "@/components/base/pagination";
import { StatusBadge } from "@/components/base/status-badge";
import { EmployeeForm } from "@/components/employee/employee-form";
import { MasterImportUploader } from "@/components/employee/master-import-uploader";
import { PaymentAccountCell, PaymentAccountStatus, PaymentBankCell,
  PaymentAccountHeader,
} from "@/components/employee/payment-account-cell";
import { AccountVisibilityProvider } from "@/components/employee/account-visibility-provider";

import { EMPLOYMENT_STATUS } from "@/constants/status";
import { useEmployeeList } from "@/hooks/use-employee";

export function EmployeeWorkspace() {
  const list = useEmployeeList();
  const [creating, setCreating] = useState(false);
  // While POST /employees is in flight the dialog cannot be dismissed, so a
  // failure stays visible with the entered values. Ref = synchronous check,
  // state = disabled rendering of the × button.
  const createPendingRef = useRef(false);
  const [createPending, setCreatePending] = useState(false);
  const handleCreateSubmitting = useCallback((submitting: boolean) => { createPendingRef.current = submitting; setCreatePending(submitting); }, []);
  const dismissCreate = () => { if (!createPendingRef.current) setCreating(false); };
  const isFiltered = Boolean(list.search || list.status);

  return (
    <div className="content-wrap">
      <PageHeader
        title="Master Karyawan"
        description="Kelola identitas karyawan, rekening pembayaran, dan hasil impor master."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" />
            Tambah karyawan
          </Button>
        }
      />

      <MasterImportUploader />

      <Panel className="employee-list-panel">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />

            <input
              value={list.search}
              onChange={(event) => list.setSearch(event.target.value)}
              placeholder="Cari nama karyawan"
              aria-label="Cari karyawan"
            />
          </label>

          <select
            value={list.status}
            onChange={(event) => list.setStatus(event.target.value)}
            aria-label="Filter status"
            required={!list.status}
          >
            <option value="" disabled>
              Filter status
            </option>

            {Object.entries(EMPLOYMENT_STATUS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {list.isLoading ? (
          <BaseLoadingState label="Memuat karyawan…" />
        ) : list.isError ? (
          <BaseErrorState
            error={list.error}
            onRetry={list.refetch}
            compact
          />
        ) : !list.data?.rows.length ? (
          <EmptyState
            illustration={isFiltered ? "search" : "employees"}
            title={
              isFiltered
                ? "Tidak ada hasil pencarian"
                : "Belum ada karyawan"
            }
            description={
              isFiltered
                ? "Ubah kata kunci atau filter pencarian."
                : "Tambahkan karyawan satu per satu atau impor tiga workbook master."
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <AccountVisibilityProvider
                rows={list.data.rows}
                accountsByEmployee={list.data.accounts}
                scopeKey={JSON.stringify({
                  search: list.search,
                  status: list.status,
                  meta: list.data.meta,
                  sort: "sort" in list ? list.sort : null,
                  employees: list.data.rows.map((employee) => employee.id),
                })}
              >
                <table className="data-table employee-table">
                <thead>
                  <tr>
                    <th scope="col">Nama</th>
                    <th scope="col">Bank</th>
                    <th><PaymentAccountHeader /></th>
                    <th scope="col">Jabatan</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {list.data.rows.map((employee) => {
                    const accounts =
                      list.data.accounts[employee.id] ?? [];

                    return (
                      <tr key={employee.id}>
                        <td>
                          <Link
                            href={`/master-karyawan/${employee.id}`}
                          >
                            {employee.official_name}
                          </Link>

                        </td>

                        <td>
                          <PaymentBankCell accounts={accounts} />
                        </td>

                        <td>
                          <PaymentAccountCell accounts={accounts} />
                        </td>

                        <td>{employee.position ?? "—"}</td>

                        <td>
                          <StatusBadge
                            label={
                              EMPLOYMENT_STATUS[
                                employee.employment_status
                              ]
                            }
                            tone={
                              employee.employment_status === "active"
                                ? "success"
                                : "warning"
                            }
                          />
                          <span className="employment-account-status"><PaymentAccountStatus accounts={accounts} /></span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </AccountVisibilityProvider>
            </div>

            <Pagination
              page={list.page}
              pageSize={list.data.meta.limit}
              total={list.data.meta.total}
              onChange={list.setPage}
            />
          </>
        )}
      </Panel>

      {creating ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              dismissCreate();
            }
          }}
        >
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <header>
              <div>
                <h2 id="create-title">Tambah karyawan</h2>
                <p>
                  Isi identitas sesuai data HR yang telah diverifikasi.
                </p>
              </div>

              <button
                type="button"
                onClick={dismissCreate}
                disabled={createPending}
                aria-label="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            {/* onClose is also the success path (useEmployeeCreate), so it stays
                unguarded; "Batal" inside the form is disabled while pending. */}
            <EmployeeForm onClose={() => setCreating(false)} onSubmittingChange={handleCreateSubmitting} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
