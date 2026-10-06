import { adminRequest, buildQueryString, type AdminListQuery } from './admin-client';

import type { Coffee, CoffeeCategory, PaginatedResponse } from '@caffeinawa/types';

export interface CreateAdminCoffeeInput {
  name: string;
  description: string;
  category: CoffeeCategory;
  price: number;
  available?: boolean;
  imageUrl?: string;
}

export type UpdateAdminCoffeeInput = Partial<CreateAdminCoffeeInput>;

export interface AdminCoffeeQuery extends AdminListQuery {
  category?: CoffeeCategory;
  available?: boolean;
}
export function getAdminCoffees(accessToken: string, query: AdminCoffeeQuery): Promise<PaginatedResponse<Coffee>> {
  return adminRequest<PaginatedResponse<Coffee>>(accessToken, `/admin/coffees${buildQueryString(query)}`);
}

export function createAdminCoffee(accessToken: string, input: CreateAdminCoffeeInput): Promise<Coffee> {
  return adminRequest<Coffee>(accessToken, '/admin/coffees', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminCoffee(
  accessToken: string,
  coffeeId: string,
  input: UpdateAdminCoffeeInput,
): Promise<Coffee> {
  return adminRequest<Coffee>(accessToken, `/admin/coffees/${encodeURIComponent(coffeeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteAdminCoffee(accessToken: string, coffeeId: string): Promise<void> {
  return adminRequest<void>(accessToken, `/admin/coffees/${encodeURIComponent(coffeeId)}`, { method: 'DELETE' });
}
