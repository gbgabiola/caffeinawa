'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import AdminListState from '@/components/admin/AdminListState';
import AdminListToolbar from '@/components/admin/AdminListToolbar';
import AdminTable, { AdminTableBody, AdminTableHead } from '@/components/admin/AdminTable';
import Pagination from '@/components/admin/Pagination';

import { useAuth } from '@/components/auth/AuthProvider';
import { ADMIN_PAGE_SIZE } from '@/constants/admin';
import { useAdminListQuery } from '@/hooks/useAdminListQuery';
import { useAdminListState } from '@/hooks/useAdminListState';

import {
  getPaymentReconciliationIssues,
  markPaymentReconciliationIssueReviewed,
  type PaymentIssueReason,
  type PaymentIssueStatus,
  type PaymentReconciliationIssue,
} from '@/features/payment-reconciliation/payment-reconciliation.api';

const REASON_LABELS: Record<PaymentIssueReason, string> = {
  PAYMENT_NOT_FOUND: 'Payment not found',
  INVALID_PROVIDER: 'Invalid payment provider',
  ORDER_REFERENCE_MISMATCH: 'Order reference mismatch',
  INVALID_PAYMENT_STATUS: 'Invalid payment status',
  INVALID_ORDER_STATUS: 'Invalid order status',
  ORDER_NOT_FOUND: 'Order not found',
};

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string | null): string {
  if (!value) return '—';

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function IssueDetails({ issue }: { issue: PaymentReconciliationIssue }) {
  const details = [
    ['Event ID', issue.providerEventId],
    ['Checkout session', issue.checkoutSessionId],
    ['Payment ID', issue.paymentId],
    ['Order ID', issue.orderId],
    ['Recorded at', formatDate(issue.recordedAt)],
    ['Reviewed at', formatDate(issue.reviewedAt)],
  ];

  return (
    <dl className="grid gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-2">
      {details.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>

          <dd className="mt-1 break-all font-mono text-xs text-gray-800">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminPaymentReconciliationPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { search, deferredSearch, setSearch, currentPage, setCurrentPage, resetPage } = useAdminListState();

  const [statusFilter, setStatusFilter] = useState<PaymentIssueStatus | ''>('OPEN');

  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const [reviewingIssueId, setReviewingIssueId] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const {
    items: issues,
    meta,
    error,
    status: fetchStatus,
    isFetching,
  } = useAdminListQuery<PaymentReconciliationIssue>({
    accessToken,
    queryKey: [
      'admin',
      'payment-reconciliation',
      'issues',
      {
        page: currentPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: deferredSearch,
        status: statusFilter,
      },
    ],
    queryFn: token =>
      getPaymentReconciliationIssues(token, {
        page: currentPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: deferredSearch,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
  });

  // Query the same endpoint for the global OPEN count,
  // independently of the table's search/status/page.
  const openCountQuery = useQuery({
    queryKey: ['admin', 'payment-reconciliation', 'open-count'],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const result = await getPaymentReconciliationIssues(accessToken as string, {
        page: 1,
        pageSize: 1,
        status: 'OPEN',
      });

      return result.meta.total;
    },
    staleTime: 30_000,
  });

  async function handleMarkReviewed(issue: PaymentReconciliationIssue) {
    if (!accessToken || reviewingIssueId) return;
    if (issue.status === 'REVIEWED') return;

    const confirmed = window.confirm(
      'Mark this reconciliation issue as reviewed? ' + 'This does not refund, settle, or update the payment.',
    );

    if (!confirmed) return;

    setReviewingIssueId(issue.id);
    setActionError(null);

    try {
      await markPaymentReconciliationIssueReviewed(accessToken, issue.id);

      await queryClient.invalidateQueries({
        queryKey: ['admin', 'payment-reconciliation'],
      });
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to mark issue as reviewed.');
    } finally {
      setReviewingIssueId(null);
    }
  }

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== 'OPEN');

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Payment Reconciliation</h1>

            <p className="mt-3 max-w-2xl text-gray-600">
              Investigate rejected PayMongo settlement events and track which issues have been reviewed.
            </p>
          </div>

          <Link
            href="/admin/payments"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Back to payments
          </Link>
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Open reconciliation issues</p>

          <p aria-live="polite" className="mt-2 text-3xl font-semibold text-gray-900">
            {openCountQuery.isPending ? '—' : openCountQuery.isError ? 'Unavailable' : openCountQuery.data}
          </p>

          <p className="mt-2 text-sm text-gray-500">All open issues, regardless of the filters below.</p>
        </div>

        {actionError && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <AdminListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search event, session, payment or order ID..."
          >
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</span>

              <select
                value={statusFilter}
                onChange={event => {
                  setStatusFilter(event.target.value as PaymentIssueStatus | '');
                  resetPage();
                }}
                className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All statuses</option>
                <option value="OPEN">Open</option>
                <option value="REVIEWED">Reviewed</option>
              </select>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('OPEN');
                  resetPage();
                }}
                className="self-end rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Clear filters
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                void queryClient.invalidateQueries({
                  queryKey: ['admin', 'payment-reconciliation'],
                });
              }}
              disabled={isFetching}
              className="self-end rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              Refresh
            </button>
          </AdminListToolbar>

          <AdminListState
            status={fetchStatus}
            error={error}
            isEmpty={issues.length === 0}
            loadingMessage="Loading reconciliation issues..."
            emptyMessage="No reconciliation issues found."
          >
            <>
              <AdminTable>
                <AdminTableHead>
                  <tr>
                    {['Recorded', 'Reason', 'Checkout session', 'Status', 'Action'].map(label => (
                      <th
                        key={label}
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </AdminTableHead>

                <AdminTableBody>
                  {issues.map(issue => {
                    const expanded = expandedIssueId === issue.id;

                    return (
                      <tr key={issue.id} className="align-top">
                        <td className="px-6 py-4 text-sm text-gray-600">{formatDate(issue.recordedAt)}</td>

                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{REASON_LABELS[issue.reason]}</td>

                        <td className="px-6 py-4">
                          <span className="break-all font-mono text-xs text-gray-600">{issue.checkoutSessionId}</span>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              issue.status === 'OPEN' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {issue.status === 'OPEN' ? 'Open' : 'Reviewed'}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-2">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              onClick={() => setExpandedIssueId(expanded ? null : issue.id)}
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              {expanded ? 'Hide details' : 'View details'}
                            </button>

                            {issue.status === 'OPEN' && (
                              <button
                                type="button"
                                disabled={reviewingIssueId !== null}
                                onClick={() => void handleMarkReviewed(issue)}
                                className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                              >
                                {reviewingIssueId === issue.id ? 'Updating...' : 'Mark Reviewed'}
                              </button>
                            )}

                            {expanded && (
                              <div className="mt-2 w-72 max-w-[70vw]">
                                <IssueDetails issue={issue} />
                              </div>
                            )}
                          </div>
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
            </>
          </AdminListState>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          Marking an issue as reviewed acknowledges the record. It does not confirm a refund or change payment status.
        </p>
      </div>
    </main>
  );
}
