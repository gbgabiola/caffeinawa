'use client';

import { useEffect, useState } from 'react';
import type { AdminOrder, OrderStatus } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { getAdminOrders, updateAdminOrder } from '@/lib/api/admin-orders';

const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

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

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      void getAdminOrders(accessToken)
        .then(data => {
          if (cancelled) {
            return;
          }

          setOrders(data);
          setError(null);
          setFetchState('success');
        })
        .catch(error => {
          if (cancelled) {
            return;
          }

          setError(error instanceof Error ? error.message : 'Unable to load orders.');
          setFetchState('error');
        });
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const isFetching = fetchState === 'idle' || fetchState === 'loading';

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    if (!accessToken) {
      return;
    }

    setUpdatingOrderId(orderId);
    setUpdateError(null);

    try {
      const updatedOrder = await updateAdminOrder(accessToken, orderId, status);

      setOrders(currentOrders => currentOrders.map(order => (order.id === updatedOrder.id ? updatedOrder : order)));
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Unable to update order status.');
    } finally {
      setUpdatingOrderId(null);
    }
  }

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Orders</h1>
          <p className="mt-3 text-gray-600">View customer orders and manage their status.</p>
        </div>

        {error && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {updateError && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {updateError}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isFetching ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">No orders found.</div>
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
                      Items
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Total
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
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {orders.map(order => {
                    const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);

                    return (
                      <tr key={order.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <p className="font-medium text-gray-900">{order.customer.name}</p>
                          <p className="mt-1 text-sm text-gray-500">{order.customer.email}</p>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                          {formatCurrency(order.total)}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4">
                          <select
                            value={order.status}
                            onChange={event => void handleStatusChange(order.id, event.target.value as OrderStatus)}
                            disabled={updatingOrderId === order.id}
                            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm capitalize text-gray-700 shadow-sm outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Update status for ${order.customer.name}'s order`}
                          >
                            {ORDER_STATUSES.map(status => (
                              <option key={status} value={status}>
                                {formatStatus(status)}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {formatDate(order.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
