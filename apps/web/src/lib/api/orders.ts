import type { Order } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function getOrder(accessToken: string, orderId: string): Promise<Order> {
  const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Order not found.');
    }

    if (response.status === 401) {
      throw new Error('Authentication required.');
    }

    throw new Error('Unable to load order.');
  }

  return response.json();
}

export async function getOrders(accessToken: string): Promise<Order[]> {
  const response = await fetch(`${API_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unable to load your orders.',
    );
  }

  return response.json() as Promise<Order[]>;
}
