import type { Customer } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginCustomer extends Customer {
  role: 'CUSTOMER' | 'ADMIN';
}

export interface LoginResponse {
  accessToken: string;
  customer: LoginCustomer;
}

export async function register(input: RegisterInput): Promise<Customer> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to register');
  }

  return response.json();
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Invalid email or password');
  }

  return response.json();
}

export async function getCurrentCustomer(accessToken: string): Promise<LoginCustomer> {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch current customer');
  }

  return response.json();
}
