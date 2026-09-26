import type { Coffee } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function getMenu(): Promise<Coffee[]> {
  const response = await fetch(`${API_URL}/menu`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch menu: ${response.status}`);
  }

  return response.json() as Promise<Coffee[]>;
}

export async function getMenuItem(id: string): Promise<Coffee> {
  const response = await fetch(`${API_URL}/menu/${id}`, {
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch menu item: ${response.status}`);
  }

  return response.json() as Promise<Coffee>;
}
