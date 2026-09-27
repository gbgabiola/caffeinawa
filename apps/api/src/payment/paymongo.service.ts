import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

interface PayMongoCheckoutSessionResponse {
  data: {
    id: string;
    type: 'checkout_session';
    attributes: {
      checkout_url: string;
      reference_number?: string;
      status: string;
    };
  };
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

    const response = await fetch(`${this.apiUrl}/v2/checkout_sessions`, {
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
      const errorBody = await response.text();

      throw new BadGatewayException(
        `PayMongo checkout creation failed: ${errorBody}`,
      );
    }

    const payload = (await response.json()) as PayMongoCheckoutSessionResponse;

    return {
      sessionId: payload.data.id,
      checkoutUrl: payload.data.attributes.checkout_url,
    };
  }
}
