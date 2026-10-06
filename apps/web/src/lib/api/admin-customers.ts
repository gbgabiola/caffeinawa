import { adminRequest, buildQueryString, type AdminListQuery } from './admin-client';

import type { AdminCustomer, PaginatedResponse } from '@caffeinawa/types';

export interface UpdateAdminCustomerInput {
  name: string;
  email: string;
}

export type AdminCustomerQuery = AdminListQuery;

export function getAdminCustomers(
  accessToken: string,
  query: AdminCustomerQuery,
): Promise<PaginatedResponse<AdminCustomer>> {
  return adminRequest<PaginatedResponse<AdminCustomer>>(accessToken, `/admin/customers${buildQueryString(query)}`);
}

export function getAdminCustomer(accessToken: string, customerId: string): Promise<AdminCustomer> {
  return adminRequest<AdminCustomer>(accessToken, `/admin/customers/${encodeURIComponent(customerId)}`);
}

export function updateAdminCustomer(
  accessToken: string,
  customerId: string,
  input: UpdateAdminCustomerInput,
): Promise<AdminCustomer> {
  return adminRequest<AdminCustomer>(accessToken, `/admin/customers/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
