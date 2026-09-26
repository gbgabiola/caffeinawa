import type { Coffee, CoffeeCategory } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface CreateAdminCoffeeInput {
  name: string;
  description: string;
  category: CoffeeCategory;
  price: number;
  available?: boolean;
  imageUrl?: string;
}

export type UpdateAdminCoffeeInput = Partial<CreateAdminCoffeeInput>;

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

    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;

    throw new Error(message ?? `Request failed with status ${response.status}`);
  }

  const responseText = await response.text();

  if (!responseText) {
    return undefined as T;
  }

  return JSON.parse(responseText) as T;
}

export function getAdminCoffees(accessToken: string): Promise<Coffee[]> {
  return request<Coffee[]>(accessToken, '/coffees');
}

export function createAdminCoffee(accessToken: string, input: CreateAdminCoffeeInput): Promise<Coffee> {
  return request<Coffee>(accessToken, '/coffees', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAdminCoffee(
  accessToken: string,
  coffeeId: string,
  input: UpdateAdminCoffeeInput,
): Promise<Coffee> {
  return request<Coffee>(accessToken, `/coffees/${coffeeId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteAdminCoffee(accessToken: string, coffeeId: string): Promise<void> {
  return request<void>(accessToken, `/coffees/${coffeeId}`, {
    method: 'DELETE',
  });
}
