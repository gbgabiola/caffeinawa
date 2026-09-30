import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { PaymentService } from './payment.service.js';

interface PayMongoWebhookRequest extends Request {
  rawBody?: Buffer;
}

interface PayMongoWebhookEvent {
  data: {
    id: string;
    type: 'event';
    attributes: {
      type: string;
      livemode: boolean;
      data: {
        id: string;
        type: 'checkout_session';
        attributes: {
          reference_number?: string;
          payment_intent?: {
            id?: string;
          };
        };
      };
      previous_data?: Record<string, unknown>;
      pending_webhooks?: number;
      created_at?: number;
      updated_at?: number;
    };
  };
}

@Controller('webhooks/paymongo')
export class PayMongoWebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Headers('paymongo-signature') signature: string | undefined,
    @Req() request: PayMongoWebhookRequest,
  ) {
    if (!signature || !request.rawBody) {
      throw new UnauthorizedException('Missing PayMongo webhook signature');
    }

    this.verifySignature(request.rawBody, signature);

    const event = JSON.parse(
      request.rawBody.toString('utf8'),
    ) as PayMongoWebhookEvent;

    console.log('[PayMongo webhook]', JSON.stringify(event, null, 2));

    if (event.data.attributes.type === 'checkout_session.payment.paid') {
      await this.paymentService.handlePayMongoPaymentPaid(
        event.data,
        request.rawBody,
      );
    }

    return {
      received: true,
    };
  }

  private verifySignature(rawBody: Buffer, signatureHeader: string): void {
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new UnauthorizedException(
        'PayMongo webhook secret is not configured',
      );
    }

    const parts = signatureHeader
      .split(',')
      .map((part) => part.split('='))
      .filter(([key, value]) => key && value);

    const timestamp = parts.find(([key]) => key === 't')?.[1];

    const signature = parts.find(
      ([key]) => key === (process.env.PAYMONGO_MODE === 'live' ? 'li' : 'te'),
    )?.[1];

    if (!timestamp || !signature) {
      throw new UnauthorizedException('Invalid PayMongo webhook signature');
    }

    const payload = `${timestamp}.${rawBody.toString('utf8')}`;

    const expected = createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');

    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException('Invalid PayMongo webhook signature');
    }
  }
}
