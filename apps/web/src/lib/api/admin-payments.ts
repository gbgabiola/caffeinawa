import type { AdminPayment } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function getErrorMessage(status: number, body: string): string {
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body);

      if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
        const message = parsed.message;

        if (typeof message === 'string') {
          return message;
        }

        if (Array.isArray(message) && message.every(item => typeof item === 'string')) {
          return message.join(', ');
        }
      }
    } catch {
      // Fall back to status-specific message.
    }
  }

  if (status === 401) {
    return 'Authentication required.';
  }

  if (status === 403) {
    return 'Administrator access required.';
  }

  if (status === 404) {
    return 'Payment not found.';
  }

  return 'Unable to process the payment request.';
}

async function request<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    cache: 'no-store',
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status, body));
  }

  if (!body) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
}

export function getAdminPayments(accessToken: string): Promise<AdminPayment[]> {
  return request<AdminPayment[]>(accessToken, '/admin/payments');
}

export function getAdminPayment(accessToken: string, paymentId: string): Promise<AdminPayment> {
  return request<AdminPayment>(accessToken, `/admin/payments/${encodeURIComponent(paymentId)}`);
}

export function markAdminPaymentAsPaid(accessToken: string, paymentId: string): Promise<AdminPayment> {
  return request<AdminPayment>(accessToken, `/admin/payments/${encodeURIComponent(paymentId)}/mark-paid`, {
    method: 'PATCH',
  });
}
