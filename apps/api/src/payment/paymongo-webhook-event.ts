import { BadRequestException, UnauthorizedException } from '@nestjs/common';

export interface PayMongoWebhookEvent {
  id: string;
  type: 'event';
  attributes: {
    type: string;
    livemode: boolean;
    data: Record<string, unknown>;
  };
}

export function getPayMongoWebhookMode(): 'test' | 'live' {
  const mode = process.env.PAYMONGO_MODE;
  if (mode !== 'test' && mode !== 'live')
    throw new UnauthorizedException('PayMongo webhook mode is not configured');
  return mode;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/\s/.test(value);
}
function invalid(): never {
  throw new BadRequestException('Invalid PayMongo webhook event payload');
}

export function parsePayMongoEvent(value: unknown): PayMongoWebhookEvent {
  const mode = getPayMongoWebhookMode();
  if (
    !record(value) ||
    !identifier(value.id) ||
    value.type !== 'event' ||
    !record(value.attributes)
  )
    return invalid();
  const a = value.attributes;
  if (!identifier(a.type) || typeof a.livemode !== 'boolean' || !record(a.data))
    return invalid();
  if (a.livemode !== (mode === 'live'))
    throw new UnauthorizedException('PayMongo webhook mode does not match');
  return value as unknown as PayMongoWebhookEvent;
}

export interface PaidCheckoutDetails {
  providerEventId: string;
  checkoutSessionId: string;
  referenceNumber: string;
  amountCents: number;
  currency: string;
  paymentIntentId?: string;
}

export function paidCheckoutDetails(
  event: PayMongoWebhookEvent,
): PaidCheckoutDetails {
  if (event.attributes.type !== 'checkout_session.payment.paid')
    return invalid();
  const session = event.attributes.data;
  if (
    !identifier(session.id) ||
    session.type !== 'checkout_session' ||
    !record(session.attributes)
  )
    return invalid();
  const a = session.attributes;
  if (
    !identifier(a.reference_number) ||
    !Array.isArray(a.payments) ||
    (a.livemode !== undefined && a.livemode !== event.attributes.livemode)
  )
    return invalid();
  const paid: Record<string, unknown>[] = [];
  for (const value of a.payments) {
    if (
      !record(value) ||
      (value.type !== undefined && value.type !== 'payment') ||
      !identifier(value.id) ||
      !record(value.attributes) ||
      !identifier(value.attributes.status)
    )
      return invalid();
    if (value.attributes.status === 'paid') paid.push(value.attributes);
  }
  if (paid.length !== 1) return invalid();
  const payment = paid[0]!;
  if (
    !Number.isSafeInteger(payment.amount) ||
    Number(payment.amount) <= 0 ||
    typeof payment.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(payment.currency) ||
    (payment.livemode !== undefined &&
      payment.livemode !== event.attributes.livemode)
  )
    return invalid();
  let paymentIntentId: string | undefined;
  if (a.payment_intent !== undefined && a.payment_intent !== null) {
    if (!record(a.payment_intent) || !identifier(a.payment_intent.id))
      return invalid();
    paymentIntentId = a.payment_intent.id;
  }
  if (
    payment.payment_intent_id !== undefined &&
    payment.payment_intent_id !== null
  ) {
    if (
      !identifier(payment.payment_intent_id) ||
      (paymentIntentId && paymentIntentId !== payment.payment_intent_id)
    )
      return invalid();
    paymentIntentId = payment.payment_intent_id;
  }
  return {
    providerEventId: event.id,
    checkoutSessionId: session.id,
    referenceNumber: a.reference_number,
    amountCents: Number(payment.amount),
    currency: payment.currency,
    paymentIntentId,
  };
}
