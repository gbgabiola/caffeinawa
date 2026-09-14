import type { Coffee } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function getCoffees(): Promise<Coffee[]> {
  const response = await fetch(`${API_URL}/coffees`);

  if (!response.ok) {
    throw new Error('Failed to fetch coffees');
  }

  return response.json();
}
