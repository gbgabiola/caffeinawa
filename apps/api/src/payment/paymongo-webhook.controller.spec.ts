import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentService } from './payment.service.js';
import { PayMongoWebhookController } from './paymongo-webhook.controller.js';

const webhookSecret = 'unit-test-webhook-secret';
const timestamp = '1720000000';

function createEvent(eventType = 'checkout_session.payment.paid') {
  return {
    data: {
      id: 'evt_test_123',
      type: 'event' as const,
      attributes: {
        type: eventType,
        livemode: false,
        data: {
          id: 'cs_test_123',
          type: 'checkout_session' as const,
          attributes: {
            reference_number: 'order_test_123',
            payment_intent: { id: 'pi_test_123' },
          },
        },
      },
    },
  };
}

function signedRequest(event: ReturnType<typeof createEvent>) {
  const rawBody = Buffer.from(JSON.stringify(event));
  const digest = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  return {
    rawBody,
    signature: `t=${timestamp},te=${digest}`,
    request: { rawBody } as Request & { rawBody: Buffer },
  };
}

describe('PayMongoWebhookController', () => {
  const originalSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const originalMode = process.env.PAYMONGO_MODE;
  let paymentService: {
    handlePayMongoPaymentPaid: ReturnType<typeof vi.fn>;
  };
  let controller: PayMongoWebhookController;

  beforeEach(() => {
    process.env.PAYMONGO_WEBHOOK_SECRET = webhookSecret;
    process.env.PAYMONGO_MODE = 'test';
    paymentService = {
      handlePayMongoPaymentPaid: vi.fn().mockResolvedValue(undefined),
    };
    controller = new PayMongoWebhookController(
      paymentService as unknown as PaymentService,
    );
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.PAYMONGO_WEBHOOK_SECRET;
    } else {
      process.env.PAYMONGO_WEBHOOK_SECRET = originalSecret;
    }

    if (originalMode === undefined) {
      delete process.env.PAYMONGO_MODE;
    } else {
      process.env.PAYMONGO_MODE = originalMode;
    }
  });

  it('accepts a valid test-mode signature and forwards the paid event', async () => {
    const event = createEvent();
    const { signature, request, rawBody } = signedRequest(event);

    await expect(controller.handleWebhook(signature, request)).resolves.toEqual(
      {
        received: true,
      },
    );

    expect(paymentService.handlePayMongoPaymentPaid).toHaveBeenCalledOnce();
    expect(paymentService.handlePayMongoPaymentPaid).toHaveBeenCalledWith(
      event.data,
      rawBody,
    );
  });

  it.each([undefined, ''])(
    'rejects a missing signature (%s)',
    async (signature) => {
      const { request } = signedRequest(createEvent());

      await expect(
        controller.handleWebhook(signature, request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    },
  );

  it('rejects a request without the raw body', async () => {
    await expect(
      controller.handleWebhook('t=1,te=invalid', {} as Request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid signature', async () => {
    const { request } = signedRequest(createEvent());

    await expect(
      controller.handleWebhook(`t=${timestamp},te=${'0'.repeat(64)}`, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it('rejects a signature that uses the wrong mode key', async () => {
    const { request, rawBody } = signedRequest(createEvent());
    const digest = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    await expect(
      controller.handleWebhook(`t=${timestamp},li=${digest}`, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not process non-paid event types', async () => {
    const { signature, request } = signedRequest(
      createEvent('checkout_session.payment.failed'),
    );

    await expect(controller.handleWebhook(signature, request)).resolves.toEqual(
      {
        received: true,
      },
    );
    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it('rejects requests when the webhook secret is not configured', async () => {
    delete process.env.PAYMONGO_WEBHOOK_SECRET;
    const { signature, request } = signedRequest(createEvent());

    await expect(
      controller.handleWebhook(signature, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });
});
