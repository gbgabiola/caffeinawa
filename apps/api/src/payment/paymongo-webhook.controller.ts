import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { PaymentService } from './payment.service.js';

const MAX_SIGNATURE_AGE_SECONDS = 300;

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
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidWebhookEvent(value: unknown): value is PayMongoWebhookEvent {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }

  const event = value.data;

  if (
    typeof event.id !== 'string' ||
    event.id.length === 0 ||
    event.type !== 'event' ||
    !isRecord(event.attributes)
  ) {
    return false;
  }

  const attributes = event.attributes;

  if (
    typeof attributes.type !== 'string' ||
    attributes.type.length === 0 ||
    typeof attributes.livemode !== 'boolean' ||
    !isRecord(attributes.data)
  ) {
    return false;
  }

  const checkoutSession = attributes.data;

  if (
    typeof checkoutSession.id !== 'string' ||
    checkoutSession.id.length === 0 ||
    checkoutSession.type !== 'checkout_session' ||
    !isRecord(checkoutSession.attributes)
  ) {
    return false;
  }

  const sessionAttributes = checkoutSession.attributes;

  if (
    sessionAttributes.reference_number !== undefined &&
    typeof sessionAttributes.reference_number !== 'string'
  ) {
    return false;
  }

  const paymentIntent = sessionAttributes.payment_intent;

  if (
    paymentIntent !== undefined &&
    (!isRecord(paymentIntent) ||
      (paymentIntent.id !== undefined && typeof paymentIntent.id !== 'string'))
  ) {
    return false;
  }

  return true;
}

@Controller('webhooks/paymongo')
export class PayMongoWebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Headers('paymongo-signature')
    signature: string | undefined,
    @Req() request: PayMongoWebhookRequest,
  ): Promise<{ received: true }> {
    if (!signature || !request.rawBody) {
      throw new UnauthorizedException('Missing PayMongo webhook signature');
    }

    // Verify authenticity before parsing or processing payload.
    this.verifySignature(request.rawBody, signature);

    const event = this.parseEvent(request.rawBody);

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

  private parseEvent(rawBody: Buffer): PayMongoWebhookEvent {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid PayMongo webhook JSON payload');
    }

    if (!isValidWebhookEvent(parsed)) {
      throw new BadRequestException('Invalid PayMongo webhook event payload');
    }

    return parsed;
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
      .map((part) => {
        const separator = part.indexOf('=');

        if (separator === -1) {
          return null;
        }

        return {
          key: part.slice(0, separator).trim(),
          value: part.slice(separator + 1).trim(),
        };
      })
      .filter(
        (part): part is { key: string; value: string } =>
          part !== null && part.key.length > 0 && part.value.length > 0,
      );

    const timestamp = parts.find((part) => part.key === 't')?.value;

    const signatureKey = process.env.PAYMONGO_MODE === 'live' ? 'li' : 'te';

    const signature = parts.find((part) => part.key === signatureKey)?.value;

    if (!timestamp || !signature) {
      throw new UnauthorizedException('Invalid PayMongo webhook signature');
    }

    // Unix timestamp, in seconds.
    if (!/^\d+$/.test(timestamp)) {
      throw new UnauthorizedException('Invalid PayMongo webhook timestamp');
    }

    const timestampSeconds = Number(timestamp);
    const currentSeconds = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(currentSeconds - timestampSeconds) > MAX_SIGNATURE_AGE_SECONDS
    ) {
      throw new UnauthorizedException(
        'Expired or invalid PayMongo webhook timestamp',
      );
    }

    if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('Invalid PayMongo webhook signature');
    }

    const payload = `${timestamp}.${rawBody.toString('utf8')}`;

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(payload)
      .digest();

    const receivedSignature = Buffer.from(signature, 'hex');

    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw new UnauthorizedException('Invalid PayMongo webhook signature');
    }
  }
}
