import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentService } from './payment.service.js';
import { PayMongoWebhookController } from './paymongo-webhook.controller.js';

const webhookSecret = 'unit-test-webhook-secret';

const originalSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
const originalMode = process.env.PAYMONGO_MODE;

function currentTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

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
            payment_intent: {
              id: 'pi_test_123',
            },
          },
        },
      },
    },
  };
}

function signBody(
  rawBody: Buffer,
  options: {
    timestamp?: string;
    mode?: 'test' | 'live';
    secret?: string;
  } = {},
): string {
  const timestamp = options.timestamp ?? currentTimestamp();

  const secret = options.secret ?? webhookSecret;

  const signatureKey = options.mode === 'live' ? 'li' : 'te';

  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  return `t=${timestamp},${signatureKey}=${digest}`;
}

function signedRequest(
  payload: unknown,
  options: {
    timestamp?: string;
    mode?: 'test' | 'live';
  } = {},
) {
  const rawBody = Buffer.from(JSON.stringify(payload));

  return {
    rawBody,
    signature: signBody(rawBody, options),
    request: {
      rawBody,
    } as Request & { rawBody: Buffer },
  };
}

describe('PayMongoWebhookController', () => {
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
    vi.restoreAllMocks();

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

  it('accepts a valid test-mode signed paid event', async () => {
    const event = createEvent();

    const { signature, request, rawBody } = signedRequest(event);

    await expect(controller.handleWebhook(signature, request)).resolves.toEqual(
      {
        received: true,
      },
    );

    expect(
      paymentService.handlePayMongoPaymentPaid,
    ).toHaveBeenCalledExactlyOnceWith(event.data, rawBody);
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

  it('rejects a missing raw body', async () => {
    await expect(
      controller.handleWebhook('t=1,te=invalid', {} as Request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid signature', async () => {
    const { request } = signedRequest(createEvent());

    await expect(
      controller.handleWebhook(
        `t=${currentTimestamp()},te=${'0'.repeat(64)}`,
        request,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it('rejects the wrong signature mode', async () => {
    const { request, rawBody } = signedRequest(createEvent());

    const liveSignature = signBody(rawBody, {
      mode: 'live',
    });

    await expect(
      controller.handleWebhook(liveSignature, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a signature older than five minutes', async () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();

    const { signature, request } = signedRequest(createEvent(), {
      timestamp: oldTimestamp,
    });

    await expect(
      controller.handleWebhook(signature, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it('rejects a signature from too far in the future', async () => {
    const futureTimestamp = (Math.floor(Date.now() / 1000) + 301).toString();

    const { signature, request } = signedRequest(createEvent(), {
      timestamp: futureTimestamp,
    });

    await expect(
      controller.handleWebhook(signature, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['not-a-timestamp', '-1', '1.5', '999999999999999999999999'])(
    'rejects invalid timestamp %s',
    async (timestamp) => {
      const { signature, request } = signedRequest(createEvent(), {
        timestamp,
      });

      await expect(
        controller.handleWebhook(signature, request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('rejects malformed JSON with a valid signature', async () => {
    const rawBody = Buffer.from('{"data":');

    const request = {
      rawBody,
    } as Request & { rawBody: Buffer };

    const signature = signBody(rawBody);

    await expect(
      controller.handleWebhook(signature, request),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    [],
    { data: null },
    { data: { id: 'evt_123' } },
    {
      data: {
        id: 'evt_123',
        type: 'event',
        attributes: null,
      },
    },
    {
      data: {
        id: 'evt_123',
        type: 'event',
        attributes: {
          type: 'checkout_session.payment.paid',
          livemode: false,
          data: {
            id: 123,
            type: 'checkout_session',
            attributes: {},
          },
        },
      },
    },
  ])('rejects structurally invalid webhook payload %#', async (payload) => {
    const { signature, request } = signedRequest(payload);

    await expect(
      controller.handleWebhook(signature, request),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it.each([
    'checkout_session.payment.failed',
    'checkout_session.payment.expired',
    'checkout_session.payment.cancelled',
  ])('acknowledges %s without marking payment paid', async (eventType) => {
    const { signature, request } = signedRequest(createEvent(eventType));

    await expect(controller.handleWebhook(signature, request)).resolves.toEqual(
      {
        received: true,
      },
    );

    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it('rejects a missing webhook secret', async () => {
    const { signature, request } = signedRequest(createEvent());

    delete process.env.PAYMONGO_WEBHOOK_SECRET;

    await expect(
      controller.handleWebhook(signature, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid live-mode signature', async () => {
    process.env.PAYMONGO_MODE = 'live';

    const event = createEvent();
    const { signature, request, rawBody } = signedRequest(event, {
      mode: 'live',
    });

    await expect(controller.handleWebhook(signature, request)).resolves.toEqual(
      {
        received: true,
      },
    );

    expect(
      paymentService.handlePayMongoPaymentPaid,
    ).toHaveBeenCalledExactlyOnceWith(event.data, rawBody);
  });

  it('does not process an event when signature verification fails', async () => {
    const event = createEvent();
    const { request, rawBody } = signedRequest(event);

    const wrongSignature = signBody(rawBody, {
      secret: 'incorrect-secret',
    });

    await expect(
      controller.handleWebhook(wrongSignature, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });
});
