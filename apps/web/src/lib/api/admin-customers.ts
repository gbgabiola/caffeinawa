import type { Customer } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface AdminCustomer extends Customer {
  role: 'CUSTOMER' | 'ADMIN';
}

export interface UpdateAdminCustomerInput {
  name: string;
  email: string;
}

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

export function getAdminCustomers(accessToken: string): Promise<AdminCustomer[]> {
  return request<AdminCustomer[]>(accessToken, '/admin/customers');
}

export function getAdminCustomer(accessToken: string, customerId: string): Promise<AdminCustomer> {
  return request<AdminCustomer>(accessToken, `/admin/customers/${customerId}`);
}

export function updateAdminCustomer(
  accessToken: string,
  customerId: string,
  input: UpdateAdminCustomerInput,
): Promise<AdminCustomer> {
  return request<AdminCustomer>(accessToken, `/admin/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
