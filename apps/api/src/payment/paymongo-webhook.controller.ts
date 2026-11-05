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

import {
  getPayMongoWebhookMode,
  paidCheckoutDetails,
  parsePayMongoEvent,
} from './paymongo-webhook-event.js';
import type { PayMongoWebhookEvent } from './paymongo-webhook-event.js';

import { PaymentService } from './payment.service.js';

const MAX_SIGNATURE_AGE_SECONDS = 300;

interface PayMongoWebhookRequest extends Request {
  rawBody?: Buffer;
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
    if (
      typeof signature !== 'string' ||
      !signature ||
      !Buffer.isBuffer(request.rawBody)
    ) {
      throw new UnauthorizedException('Missing PayMongo webhook signature');
    }

    // Verify authenticity before parsing or processing payload.
    this.verifySignature(request.rawBody, signature);

    const event = this.parseEvent(request.rawBody);

    if (event.attributes.type === 'checkout_session.payment.paid') {
      paidCheckoutDetails(event);
      await this.paymentService.handlePayMongoPaymentPaid(
        event,
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
      parsed = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(rawBody),
      );
    } catch {
      throw new BadRequestException('Invalid PayMongo webhook JSON payload');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('data' in parsed)
    ) {
      throw new BadRequestException('Invalid PayMongo webhook event payload');
    }
    return parsePayMongoEvent(parsed.data);
  }

  private verifySignature(rawBody: Buffer, signatureHeader: string): void {
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (!webhookSecret?.trim()) {
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
          part !== null && part.key.length > 0,
      );

    const timestamp = parts.find((part) => part.key === 't')?.value;

    const signatureKey = getPayMongoWebhookMode() === 'live' ? 'li' : 'te';
    if (
      parts.filter((part) => part.key === 't').length !== 1 ||
      parts.filter((part) => part.key === signatureKey).length !== 1
    ) {
      throw new UnauthorizedException('Invalid PayMongo webhook signature');
    }

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

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(timestamp)
      .update('.')
      .update(rawBody)
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
