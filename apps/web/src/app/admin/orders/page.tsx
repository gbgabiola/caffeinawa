'use client';

import { useEffect, useState } from 'react';

import type { OrderStatus } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { getAdminOrders, updateAdminOrder, type AdminOrder } from '@/lib/api/admin-orders';

const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatStatus(status: OrderStatus) {
  return status.replace('_', ' ');
}

export default function AdminOrdersPage() {
  const { accessToken, customer, isLoading } = useAuth();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !accessToken || customer?.role !== 'ADMIN') {
      return;
    }

    let cancelled = false;

    getAdminOrders(accessToken)
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

    return () => {
      cancelled = true;
    };
  }, [accessToken, customer?.role, isLoading]);

  const isFetching = fetchState === 'idle' || fetchState === 'loading';

  if (isLoading) {
    return (
      <div className="px-6 py-8 lg:px-8">
        <p className="text-sm text-gray-600">Checking admin access...</p>
      </div>
    );
  }

  if (!customer || customer.role !== 'ADMIN') {
    return null;
  }

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
    <div className="px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Orders</h1>

          <p className="mt-3 text-gray-600">View customer orders and manage their current status.</p>
        </div>

        {updateError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {updateError}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isFetching ? (
            <div className="p-6">
              <p className="text-sm text-gray-600">Loading orders...</p>
            </div>
          ) : error ? (
            <div className="p-6">
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-gray-600">No orders found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 font-medium text-gray-600">Customer</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Items</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Total</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Created</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => {
                    const isUpdating = updatingOrderId === order.id;

                    return (
                      <tr key={order.id}>
                        <td className="px-6 py-4 align-top">
                          <div>
                            <p className="font-medium text-gray-900">Customer</p>
                            <p className="break-all text-sm text-gray-500">{order.customerId}</p>
                          </div>
                        </td>

                        <td className="px-6 py-4 align-top text-gray-600">
                          {order.items.reduce((total, item) => total + item.quantity, 0)}
                        </td>

                        <td className="px-6 py-4 align-top font-medium text-gray-900">{formatCurrency(order.total)}</td>

                        <td className="px-6 py-4 align-top">
                          <select
                            value={order.status}
                            disabled={isUpdating}
                            onChange={event => handleStatusChange(order.id, event.target.value as OrderStatus)}
                            aria-label={`Status for order ${order.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm capitalize text-gray-700 outline-none focus:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {ORDER_STATUSES.map(status => (
                              <option key={status} value={status}>
                                {formatStatus(status)}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-6 py-4 align-top text-gray-600">{formatDate(order.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
