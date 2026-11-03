import type { PaymentCheckoutStatus, PaymentResumeResult } from '@caffeinawa/types';

import { validatedPayMongoUrl } from '@/lib/payment-navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
async function request(
  accessToken: string,
  orderId: string,
  resume: boolean,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${API_URL}/orders/${encodeURIComponent(orderId)}/payment-checkout${resume ? '/resume' : ''}`,
    {
      method: resume ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal,
    },
  );
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Your session has expired. Sign in again to check this payment.');
    if (response.status === 429) throw new Error('Please wait a minute before trying payment checkout again.');
    if (response.status === 404) throw new Error('Order not found.');
    throw new Error(
      'Payment checkout is unavailable. Check this order or contact the store before placing another order.',
    );
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Unable to verify payment options.');
  return body as Record<string, unknown>;
}

export async function getPaymentCheckoutStatus(
  accessToken: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<PaymentCheckoutStatus> {
  const body = await request(accessToken, orderId, false, signal);
  if (typeof body.canResume !== 'boolean' || typeof body.message !== 'string')
    throw new Error('Unable to verify payment options.');
  return { canResume: body.canResume, message: body.message };
}

export async function resumePaymentCheckout(
  accessToken: string,
  orderId: string,
): Promise<PaymentResumeResult> {
  const body = await request(accessToken, orderId, true);
  if (body.status === 'ready' && typeof body.checkoutUrl === 'string') {
    return { status: 'ready', checkoutUrl: validatedPayMongoUrl(body.checkoutUrl) };
  }
  if (
    (body.status === 'awaiting_confirmation' || body.status === 'unavailable') &&
    typeof body.message === 'string'
  )
    return { status: body.status, message: body.message };
  throw new Error('Unable to verify payment checkout. Check this order before attempting payment again.');
}
