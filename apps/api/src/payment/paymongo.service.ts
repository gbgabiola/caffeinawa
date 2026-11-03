import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

const RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000;
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function parseSession(payload: unknown, orderId: string) {
  const data = asRecord(asRecord(payload)?.data);
  const attributes = asRecord(data?.attributes);
  const id = data?.id;
  const url = attributes?.checkout_url;
  if (
    data?.type !== 'checkout_session' ||
    typeof id !== 'string' ||
    !/^cs_[a-z0-9_]+$/i.test(id) ||
    typeof url !== 'string' ||
    url.trim() !== url ||
    (attributes?.reference_number !== undefined &&
      attributes.reference_number !== orderId)
  )
    return undefined;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'checkout.paymongo.com' ||
      parsed.port ||
      parsed.username ||
      parsed.password
    )
      return undefined;
  } catch {
    return undefined;
  }
  return { sessionId: id, checkoutUrl: url, attributes: attributes! };
}

export interface CreateCheckoutSessionInput {
  orderId: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  customerName: string;
  customerEmail: string;
}
export interface PreparedCheckoutSession {
  requestBody: string;
  scopeHash: string;
}
export interface RetrievedCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
  status: 'active' | 'expired';
  paymentState: 'unpaid' | 'paid' | 'processing';
}

@Injectable()
export class PayMongoService {
  private readonly logger = new Logger(PayMongoService.name);
  private readonly apiUrl =
    process.env.PAYMONGO_API_URL ?? 'https://api.paymongo.com';
  private readonly secretKey = process.env.PAYMONGO_SECRET_KEY;
  private readonly mode = process.env.PAYMONGO_MODE ?? 'test';
  private readonly webUrl = new URL(
    process.env.WEB_URL ?? 'http://localhost:3000',
  ).origin;

  private configuration() {
    if (!this.secretKey || !['test', 'live'].includes(this.mode))
      throw new InternalServerErrorException('PayMongo is not configured');
    try {
      const url = new URL(this.apiUrl);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        ((process.env.NODE_ENV === 'production' || this.mode === 'live') &&
          url.protocol !== 'https:')
      )
        throw new Error('Invalid origin');
      return {
        origin: url.origin,
        authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        scopeHash: createHash('sha256')
          .update(JSON.stringify([url.origin, this.mode, this.secretKey]))
          .digest('hex'),
      };
    } catch {
      throw new InternalServerErrorException('PayMongo is not configured');
    }
  }

  prepareCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): PreparedCheckoutSession {
    const { scopeHash } = this.configuration();
    return {
      scopeHash,
      requestBody: JSON.stringify({
        data: {
          attributes: {
            line_items: input.items.map((item) => ({
              name: item.name,
              amount: Math.round(item.unitPrice * 100),
              currency: 'PHP',
              quantity: item.quantity,
            })),
            payment_method_types: ['qrph'],
            success_url: `${this.webUrl}/checkout/success?orderId=${encodeURIComponent(input.orderId)}`,
            cancel_url: `${this.webUrl}/checkout/cancelled?orderId=${encodeURIComponent(input.orderId)}`,
            reference_number: input.orderId,
            description: `Caffeinawa Order ${input.orderId}`,
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            billing: { name: input.customerName, email: input.customerEmail },
          },
        },
      }),
    };
  }

  canRecoverCreation(attempt: { scopeHash: string; createdAt: Date }): boolean {
    try {
      const elapsed = Date.now() - attempt.createdAt.getTime();
      return (
        attempt.scopeHash === this.configuration().scopeHash &&
        Number.isFinite(elapsed) &&
        elapsed >= -60_000 &&
        elapsed < RECOVERY_WINDOW_MS
      );
    } catch {
      return false;
    }
  }

  async createCheckoutSession(
    attempt: PreparedCheckoutSession & { paymentId: string; createdAt: Date },
    orderId: string,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        attempt.paymentId,
      ) ||
      !this.canRecoverCreation(attempt)
    ) {
      throw new ConflictException(
        'This payment needs review by the store. No new checkout session was created.',
      );
    }
    return this.request(
      '/v2/checkout_sessions',
      'POST',
      (payload) => {
        const session = parseSession(payload, orderId);
        if (
          !session ||
          (session.attributes.livemode !== undefined &&
            session.attributes.livemode !== (this.mode === 'live'))
        )
          return undefined;
        return {
          sessionId: session.sessionId,
          checkoutUrl: session.checkoutUrl,
        };
      },
      attempt.requestBody,
      attempt.paymentId,
    );
  }

  async retrieveCheckoutSession(
    sessionId: string,
    orderId: string,
    amountCents: number,
  ): Promise<RetrievedCheckoutSession> {
    if (!/^cs_[a-z0-9_]+$/i.test(sessionId))
      throw new ConflictException('This payment needs review by the store.');
    return this.request(
      `/v1/checkout_sessions/${encodeURIComponent(sessionId)}`,
      'GET',
      (payload) => {
        const session = parseSession(payload, orderId);
        if (!session || session.sessionId !== sessionId) return undefined;
        const a = session.attributes;
        if (
          a.reference_number !== orderId ||
          a.livemode !== (this.mode === 'live') ||
          !['active', 'expired'].includes(String(a.status)) ||
          !Array.isArray(a.line_items) ||
          !a.line_items.length ||
          !Array.isArray(a.payments)
        )
          return undefined;
        let total = 0n;
        for (const value of a.line_items) {
          const item = asRecord(value);
          if (
            !item ||
            item.currency !== 'PHP' ||
            !Number.isSafeInteger(item.amount) ||
            Number(item.amount) <= 0 ||
            !Number.isSafeInteger(item.quantity) ||
            Number(item.quantity) <= 0
          )
            return undefined;
          total += BigInt(Number(item.amount)) * BigInt(Number(item.quantity));
        }
        if (!Number.isSafeInteger(amountCents) || total !== BigInt(amountCents))
          return undefined;
        let paymentState: RetrievedCheckoutSession['paymentState'] = 'unpaid';
        for (const value of a.payments) {
          const payment = asRecord(value);
          const attributes = asRecord(payment?.attributes);
          if (
            payment?.type !== 'payment' ||
            typeof attributes?.status !== 'string'
          )
            return undefined;
          if (attributes.status === 'paid') paymentState = 'paid';
          else if (
            !['failed', 'cancelled'].includes(attributes.status) &&
            paymentState !== 'paid'
          )
            paymentState = 'processing';
        }
        if (a.payment_intent !== null && a.payment_intent !== undefined) {
          const intent = asRecord(a.payment_intent);
          const attributes = asRecord(intent?.attributes);
          if (
            intent?.type !== 'payment_intent' ||
            typeof attributes?.status !== 'string'
          )
            return undefined;
          if (attributes.status === 'succeeded') paymentState = 'paid';
          else if (
            ![
              'awaiting_payment_method',
              'awaiting_next_action',
              'cancelled',
            ].includes(attributes.status) &&
            paymentState !== 'paid'
          )
            paymentState = 'processing';
        }
        return {
          sessionId,
          checkoutUrl: session.checkoutUrl,
          status: a.status as 'active' | 'expired',
          paymentState,
        };
      },
    );
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST',
    parse: (payload: unknown) => T | undefined,
    body?: string,
    key?: string,
  ): Promise<T> {
    const config = this.configuration();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let failure = 'transport';
    try {
      const response = await fetch(`${config.origin}${path}`, {
        method,
        ...(method === 'POST' ? { body } : {}),
        signal: controller.signal,
        redirect: 'error',
        headers: {
          Authorization: config.authorization,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
      });
      if (!response.ok) {
        failure = `HTTP ${response.status}`;
        throw new Error('Provider request rejected');
      }
      failure = 'invalid response';
      const result = parse(await response.json());
      if (result === undefined) throw new Error('Invalid provider response');
      return result;
    } catch {
      const reason = controller.signal.aborted ? 'timeout' : failure;
      controller.abort();
      this.logger.warn(
        `PayMongo checkout unavailable (${reason}); no automatic retry attempted`,
      );
      throw new BadGatewayException(
        'Payment checkout is temporarily unavailable. Check your order before trying again.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
