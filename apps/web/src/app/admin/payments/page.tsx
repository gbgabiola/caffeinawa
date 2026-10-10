'use client';

import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import AdminListState from '@/components/admin/AdminListState';
import AdminListToolbar from '@/components/admin/AdminListToolbar';
import AdminTable, { AdminTableBody, AdminTableHead } from '@/components/admin/AdminTable';
import Pagination from '@/components/admin/Pagination';
import { useAuth } from '@/components/auth/AuthProvider';
import { ADMIN_PAGE_SIZE } from '@/constants/admin';
import { useAdminListQuery } from '@/hooks/useAdminListQuery';
import { useAdminListState } from '@/hooks/useAdminListState';
import { getAdminPayments, markAdminPaymentAsPaid } from '@/lib/api/admin-payments';

import type { PaymentProvider, PaymentStatus } from '@caffeinawa/types';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatProvider(provider: PaymentProvider): string {
  return provider === 'paymongo' ? 'PayMongo' : 'Cash';
}

function formatStatus(status: PaymentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClasses(status: PaymentStatus): string {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'cancelled':
      return 'bg-gray-100 text-gray-700';
    case 'expired':
      return 'bg-orange-100 text-orange-700';
    case 'pending':
    default:
      return 'bg-amber-100 text-amber-700';
  }
}

export default function AdminPaymentsPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { search, deferredSearch, setSearch, currentPage, setCurrentPage, resetPage } = useAdminListState();
  const [providerFilter, setProviderFilter] = useState<PaymentProvider | ''>('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | ''>('');
  const {
    items: payments,
    meta,
    error,
    status: fetchStatus,
  } = useAdminListQuery({
    accessToken,
    queryKey: [
      'admin',
      'payments',
      {
        page: currentPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: deferredSearch,
        provider: providerFilter,
        status: statusFilter,
      },
    ],
    queryFn: token =>
      getAdminPayments(token, {
        page: currentPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: deferredSearch,
        ...(providerFilter ? { provider: providerFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
  });
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  async function handleMarkAsPaid(paymentId: string) {
    if (!accessToken) {
      return;
    }

    setUpdatingPaymentId(paymentId);
    setUpdateError(null);

    try {
      await markAdminPaymentAsPaid(accessToken, paymentId);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Unable to mark payment as paid.');
    } finally {
      setUpdatingPaymentId(null);
    }
  }

  const hasActiveFilters = Boolean(search.trim() || providerFilter || statusFilter);
  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Payments</h1>

          <p className="mt-3 text-gray-600">Monitor payment status and confirm cash payments.</p>
        </div>

        {updateError && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {updateError}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <AdminListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by customer or coffee..."
          >
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Provider</span>
              <select
                value={providerFilter}
                onChange={event => {
                  setProviderFilter(event.target.value as PaymentProvider | '');
                  resetPage();
                }}
                className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All providers</option>
                <option value="cash">Cash</option>
                <option value="paymongo">PayMongo</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</span>
              <select
                value={statusFilter}
                onChange={event => {
                  setStatusFilter(event.target.value as PaymentStatus | '');
                  resetPage();
                }}
                className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All statuses</option>
                {(['pending', 'paid', 'failed', 'expired', 'cancelled'] as PaymentStatus[]).map(status => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setProviderFilter('');
                  setStatusFilter('');
                  resetPage();
                }}
                className="self-end rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Clear filters
              </button>
            )}
          </AdminListToolbar>
          <AdminListState
            status={fetchStatus}
            error={error}
            isEmpty={payments.length === 0}
            loadingMessage="Loading payments..."
            emptyMessage="No payments found."
          >
            <div className="overflow-x-auto">
              <AdminTable>
                <AdminTableHead>
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Customer
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Order
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Payment method
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Paid
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Action
                    </th>
                  </tr>
                </AdminTableHead>

                <AdminTableBody>
                  {payments.map(payment => {
                    const itemCount = payment.order.items.reduce((total, item) => total + item.quantity, 0);

                    const itemSummary = payment.order.items
                      .map(item => `${item.quantity}× ${item.coffeeName}`)
                      .join(', ');

                    return (
                      <tr key={payment.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <p className="font-medium text-gray-900">{payment.order.customer.name}</p>
                          <p className="mt-1 text-sm text-gray-500">{payment.order.customer.email}</p>
                        </td>

                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">
                            {itemCount} {itemCount === 1 ? 'item' : 'items'}
                          </p>
                          <p className="mt-1 max-w-xs text-sm text-gray-500">{itemSummary}</p>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4">
                          <p className="font-medium text-gray-900">{formatProvider(payment.provider)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Created {dateFormatter.format(new Date(payment.createdAt))}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                          {currencyFormatter.format(payment.amount)}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(payment.status)}`}
                          >
                            {formatStatus(payment.status)}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {payment.paidAt ? dateFormatter.format(new Date(payment.paidAt)) : '—'}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4">
                          {payment.provider === 'cash' && payment.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => void handleMarkAsPaid(payment.id)}
                              disabled={updatingPaymentId === payment.id}
                              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingPaymentId === payment.id ? 'Updating...' : 'Mark as paid'}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </AdminTableBody>
              </AdminTable>

              <Pagination
                currentPage={meta?.page ?? currentPage}
                totalPages={meta?.totalPages ?? 1}
                totalItems={meta?.total ?? 0}
                pageSize={meta?.pageSize ?? ADMIN_PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            </div>
          </AdminListState>
        </div>
      </div>
    </main>
  );
}
