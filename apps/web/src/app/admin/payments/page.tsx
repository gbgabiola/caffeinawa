'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import type { Payment, PaymentProvider, PaymentStatus } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
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
  const { customer, accessToken, isAuthenticated, isLoading } = useAuth();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (isLoading || !isAuthenticated || customer?.role !== 'ADMIN') {
      return;
    }

    void loadPayments();
  }, [customer?.role, isAuthenticated, isLoading, loadPayments]);

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

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="text-sm text-gray-500">Checking authorization...</p>
      </main>
    );
  }

  if (!isAuthenticated || customer?.role !== 'ADMIN') {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-900">Access denied</h1>

          <p className="mt-2 text-sm text-red-700">Administrator access is required to view payments.</p>

          <Link
            href="/"
            className="mt-5 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Return home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>

          <p className="mt-1 text-sm text-gray-500">Monitor customer payments and confirm cash transactions.</p>
        </div>

        <button
          type="button"
          onClick={() => void loadPayments()}
          disabled={loadingPayments}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingPayments ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loadingPayments ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading payments...</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="font-medium text-gray-900">No payments yet</h2>

            <p className="mt-1 text-sm text-gray-500">Payments will appear here after customers place orders.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Payment
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Order
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Provider
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Amount
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Status
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Paid
                  </th>

                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {payments.map(payment => {
                  const updating = updatingPaymentId === payment.id;
                  const canMarkAsPaid = payment.provider === 'cash' && payment.status === 'pending';

                  return (
                    <tr key={payment.id} className="align-top">
                      <td className="px-6 py-4">
                        <p className="max-w-48 break-all text-sm font-medium text-gray-900">{payment.id}</p>

                        <p className="mt-1 text-xs text-gray-500">
                          Created {dateFormatter.format(new Date(payment.createdAt))}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/orders?orderId=${encodeURIComponent(payment.orderId)}`}
                          className="break-all text-sm font-medium text-gray-900 hover:underline"
                        >
                          {payment.orderId}
                        </Link>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">
                        {formatProvider(payment.provider)}

                        {payment.checkoutSessionId && (
                          <p className="mt-1 max-w-40 break-all text-xs text-gray-500">
                            Session: {payment.checkoutSessionId}
                          </p>
                        )}

                        {payment.paymentIntentId && (
                          <p className="mt-1 max-w-40 break-all text-xs text-gray-500">
                            Intent: {payment.paymentIntentId}
                          </p>
                        )}

                        {payment.providerEventId && (
                          <p className="mt-1 max-w-40 break-all text-xs text-gray-500">
                            Event: {payment.providerEventId}
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {currencyFormatter.format(payment.amount)}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(payment.status)}`}
                        >
                          {formatStatus(payment.status)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {payment.paidAt ? dateFormatter.format(new Date(payment.paidAt)) : '—'}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {canMarkAsPaid ? (
                          <button
                            type="button"
                            onClick={() => void handleMarkAsPaid(payment.id)}
                            disabled={updating}
                            className="whitespace-nowrap rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                          >
                            {updating ? 'Updating...' : 'Mark as paid'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
