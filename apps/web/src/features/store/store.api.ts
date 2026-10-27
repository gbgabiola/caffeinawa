import { adminRequest } from '@/lib/api/admin-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface StoreOrderingStatus {
  acceptingOrders: boolean;
  updatedAt: string | null;
}

export async function getStoreOrdering(): Promise<StoreOrderingStatus> {
  const response = await fetch(`${API_URL}/store/ordering`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Unable to check ordering availability. Please try again.');
  }

  return response.json() as Promise<StoreOrderingStatus>;
}

export function updateStoreOrdering(accessToken: string, acceptingOrders: boolean): Promise<StoreOrderingStatus> {
  return adminRequest<StoreOrderingStatus>(accessToken, '/admin/store/ordering', {
    method: 'PATCH',
    body: JSON.stringify({ acceptingOrders }),
  });
}
