'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AdminPayment, PaymentProvider, PaymentStatus } from '@caffeinawa/types';

import Pagination from '@/components/admin/Pagination';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePagination } from '@/hooks/usePagination';
import { getAdminPayments, markAdminPaymentAsPaid } from '@/lib/api/admin-payments';

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

  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { currentPage, totalPages, pageSize, paginatedItems, setCurrentPage } = usePagination(payments);

  const loadPayments = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoadingPayments(true);
    setError(null);

    try {
      const result = await getAdminPayments(accessToken);
      setPayments(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payments.');
    } finally {
      setLoadingPayments(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        void loadPayments();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, loadPayments]);

  async function handleMarkAsPaid(paymentId: string) {
    if (!accessToken) {
      return;
    }

    setUpdatingPaymentId(paymentId);
    setError(null);

    try {
      const updatedPayment = await markAdminPaymentAsPaid(accessToken, paymentId);

      setPayments(currentPayments =>
        currentPayments.map(payment => (payment.id === updatedPayment.id ? updatedPayment : payment)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark payment as paid.');
    } finally {
      setUpdatingPaymentId(null);
    }
  }

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Payments</h1>
          <p className="mt-3 text-gray-600">Monitor payment status and confirm cash payments.</p>
        </div>

        {error && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loadingPayments ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">Loading payments...</div>
          ) : payments.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">No payments found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
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
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {paginatedItems.map(payment => {
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
                </tbody>
              </table>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={payments.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
