import type { Order, OrderStatus } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export type AdminOrder = Order;

async function request<T>(accessToken: string, path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getAdminOrders(accessToken: string): Promise<AdminOrder[]> {
  return request<AdminOrder[]>(accessToken, '/admin/orders');
}

export function getAdminOrder(accessToken: string, orderId: string): Promise<AdminOrder> {
  return request<AdminOrder>(accessToken, `/admin/orders/${orderId}`);
}

export function updateAdminOrder(accessToken: string, orderId: string, status: OrderStatus): Promise<AdminOrder> {
  return request<AdminOrder>(accessToken, `/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
