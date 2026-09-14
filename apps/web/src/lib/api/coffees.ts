import type { Coffee } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function getCoffees(): Promise<Coffee[]> {
  const response = await fetch(`${API_URL}/coffees`, {
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch coffees');
  }

  return response.json();
}

export async function getCoffee(id: string): Promise<Coffee> {
  const response = await fetch(`${API_URL}/coffees/${id}`, {
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch coffee');
  }

  return response.json();
}
