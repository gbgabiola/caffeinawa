import {
  BadGatewayException,
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseCheckoutSession(
  payload: unknown,
  orderId: string,
):
  | {
      sessionId: string;
      checkoutUrl: string;
    }
  | undefined {
  const data = asRecord(asRecord(payload)?.data);
  const attributes = asRecord(data?.attributes);
  const sessionId = data?.id;
  const checkoutUrl = attributes?.checkout_url;
  if (
    data?.type !== 'checkout_session' ||
    typeof sessionId !== 'string' ||
    !sessionId ||
    sessionId.trim() !== sessionId ||
    typeof checkoutUrl !== 'string' ||
    checkoutUrl.trim() !== checkoutUrl ||
    (attributes?.reference_number !== undefined &&
      attributes.reference_number !== orderId)
  ) {
    return undefined;
  }
  try {
    const url = new URL(checkoutUrl);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return undefined;
  } catch {
    return undefined;
  }
  return { sessionId, checkoutUrl };
}

interface CreateCheckoutSessionInput {
  orderId: string;
  amount: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  customerName: string;
  customerEmail: string;
}

@Injectable()
export class PayMongoService {
  private readonly logger = new Logger(PayMongoService.name);
  private readonly apiUrl =
    process.env.PAYMONGO_API_URL ?? 'https://api.paymongo.com';

  private readonly secretKey = process.env.PAYMONGO_SECRET_KEY;

  private readonly webUrl = process.env.WEB_URL ?? 'http://localhost:3000';

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{
    sessionId: string;
    checkoutUrl: string;
  }> {
    if (!this.secretKey) {
      throw new InternalServerErrorException('PayMongo is not configured');
    }

    let apiOrigin: string;
    try {
      const url = new URL(this.apiUrl);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        ((process.env.NODE_ENV === 'production' ||
          process.env.PAYMONGO_MODE === 'live') &&
          url.protocol !== 'https:')
      ) {
        throw new Error('Invalid provider origin');
      }
      apiOrigin = url.origin;
    } catch {
      throw new InternalServerErrorException('PayMongo is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let failure = 'transport';

    try {
      const response = await fetch(`${apiOrigin}/v2/checkout_sessions`, {
        signal: controller.signal,
        redirect: 'error',
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString(
            'base64',
          )}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: input.items.map((item) => ({
                name: item.name,
                amount: Math.round(item.unitPrice * 100),
                currency: 'PHP',
                quantity: item.quantity,
              })),
              payment_method_types: ['qrph'], // Update to add payment methods, e.g., gcash
              success_url: `${this.webUrl}/checkout/success?orderId=${encodeURIComponent(input.orderId)}`,
              cancel_url: `${this.webUrl}/checkout/cancelled?orderId=${encodeURIComponent(input.orderId)}`,
              reference_number: input.orderId,
              description: `Caffeinawa Order ${input.orderId}`,
              send_email_receipt: false,
              show_description: true,
              show_line_items: true,
              billing: {
                name: input.customerName,
                email: input.customerEmail,
              },
            },
          },
        }),
      });

      if (!response.ok) {
        failure = `HTTP ${response.status}`;
        // Do not read or expose provider error bodies. Aborting below cancels
        // the unread body as well as any unfinished request.
        throw new Error('Provider rejected checkout creation');
      }

      failure = 'invalid response';
      const payload: unknown = await response.json();
      const session = parseCheckoutSession(payload, input.orderId);
      if (!session) throw new Error('Invalid checkout session response');
      return session;
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
