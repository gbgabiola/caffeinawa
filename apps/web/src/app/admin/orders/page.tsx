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
import { getAdminOrders, updateAdminOrder } from '@/lib/api/admin-orders';

import type { OrderStatus } from '@caffeinawa/types';

const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
const ADMIN_ORDER_ACTIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatStatus(status: OrderStatus): string {
  return status.replace('_', ' ');
}

export default function AdminOrdersPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { search, deferredSearch, setSearch, currentPage, setCurrentPage, resetPage } = useAdminListState();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const {
    items: orders,
    meta,
    error,
    status: fetchStatus,
  } = useAdminListQuery({
    accessToken,
    queryKey: [
      'admin',
      'orders',
      { page: currentPage, pageSize: ADMIN_PAGE_SIZE, search: deferredSearch, status: statusFilter },
    ],
    queryFn: token =>
      getAdminOrders(token, {
        page: currentPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: deferredSearch,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
  });
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  async function handleStatusChange(orderId: string, status: OrderStatus) {
    if (!accessToken) {
      return;
    }
    setUpdatingOrderId(orderId);
    setUpdateError(null);
    try {
      await updateAdminOrder(accessToken, orderId, status);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Unable to update order status.');

      await queryClient.invalidateQueries({
        queryKey: ['admin', 'orders'],
      });
    } finally {
      setUpdatingOrderId(null);
    }
  }

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-cafe-muted">Caffeinawa Admin</p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-cafe-espresso">Orders</h1>

          <p className="mt-3 text-cafe-muted">View customer orders and manage their status.</p>
        </div>

        {updateError && (
          <div role="alert" className="mt-4 rounded-lg border border-status-error-border bg-status-error-soft px-4 py-3 text-sm text-status-error">
            {updateError}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-cafe-border bg-cafe-paper shadow-sm">
          <AdminListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by customer name or email..."
          >
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-cafe-muted">Status</span>
              <select
                value={statusFilter}
                onChange={event => {
                  setStatusFilter(event.target.value as OrderStatus | '');
                  resetPage();
                }}
                className="mt-1 rounded-lg border border-cafe-input-border bg-cafe-paper px-3 py-2 text-sm text-cafe-espresso shadow-sm"
              >
                <option value="">All statuses</option>
                {ORDER_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
          </AdminListToolbar>
          <AdminListState
            status={fetchStatus}
            error={error}
            isEmpty={orders.length === 0}
            loadingMessage="Loading orders..."
            emptyMessage="No orders found."
          >
            <div className="overflow-x-auto">
              <AdminTable>
                <AdminTableHead>
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-cafe-muted"
                    >
                      Customer
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-cafe-muted"
                    >
                      Items
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-cafe-muted"
                    >
                      Total
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-cafe-muted"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-cafe-muted"
                    >
                      Created
                    </th>
                  </tr>
                </AdminTableHead>

                <AdminTableBody>
                  {orders.map(order => {
                    const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);

                    return (
                      <tr key={order.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <p className="font-medium text-cafe-espresso">{order.customer.name}</p>
                          <p className="mt-1 text-sm text-cafe-muted">{order.customer.email}</p>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-cafe-muted">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-cafe-espresso">
                          {formatCurrency(order.total)}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4">
                          <select
                            value={order.status}
                            onChange={event => void handleStatusChange(order.id, event.target.value as OrderStatus)}
                            disabled={updatingOrderId === order.id || ADMIN_ORDER_ACTIONS[order.status].length === 0}
                            className="rounded-md border border-cafe-input-border bg-cafe-paper px-3 py-2 text-sm capitalize text-cafe-brown shadow-sm outline-none transition focus:border-cafe-accent focus:ring-2 focus:ring-cafe-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Update status for ${order.customer.name}'s order`}
                          >
                            {[order.status, ...ADMIN_ORDER_ACTIONS[order.status]].map(status => (
                              <option key={status} value={status}>
                                {formatStatus(status)}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-cafe-muted">
                          {formatDate(order.createdAt)}
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
