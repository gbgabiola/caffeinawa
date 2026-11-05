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
            payments: [
              {
                id: 'pay_test_123',
                type: 'payment',
                attributes: { status: 'paid', amount: 25000, currency: 'PHP' },
              },
            ],
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
    .update(timestamp)
    .update('.')
    .update(rawBody)
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
    event.data.attributes.livemode = true;
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
  it('acknowledges an unrelated resource event without attempting settlement', async () => {
    const event = createEvent('payment.failed');
    const payload = {
      data: {
        ...event.data,
        attributes: {
          ...event.data.attributes,
          data: {
            id: 'pay_other',
            type: 'payment',
            attributes: { status: 'failed' },
          },
        },
      },
    };
    const signed = signedRequest(payload);
    await expect(
      controller.handleWebhook(signed.signature, signed.request),
    ).resolves.toEqual({ received: true });
    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it('rejects a signed event whose resource mode conflicts with the endpoint mode', async () => {
    const event = createEvent();
    event.data.attributes.livemode = true;
    const signed = signedRequest(event);
    await expect(
      controller.handleWebhook(signed.signature, signed.request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'invalid'])(
    'fails closed for unconfigured mode %s',
    async (mode) => {
      const signed = signedRequest(createEvent());
      if (mode === undefined) delete process.env.PAYMONGO_MODE;
      else process.env.PAYMONGO_MODE = mode;
      await expect(
        controller.handleWebhook(signed.signature, signed.request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    },
  );

  it.each(['t', 'te'])(
    'rejects duplicate %s signature fields, including empty duplicates',
    async (field) => {
      const signed = signedRequest(createEvent());
      for (const duplicate of [
        field === 't'
          ? `t=${currentTimestamp()}`
          : signed.signature.split(',')[1]!,
        `${field}=`,
      ]) {
        await expect(
          controller.handleWebhook(
            `${signed.signature},${duplicate}`,
            signed.request,
          ),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    },
  );

  it('verifies exact raw bytes and rejects invalid UTF-8 after authentication', async () => {
    const event = createEvent('payment.failed');
    const text = JSON.stringify(event).replace('evt_test_123', 'evt_RAW');
    const rawBody = Buffer.from(text.replace('evt_RAW', 'evt_bad_'));
    const marker = rawBody.indexOf(Buffer.from('evt_bad_')) + 4;
    rawBody[marker] = 0xff;
    const rawRequest = { rawBody } as Request & { rawBody: Buffer };
    await expect(
      controller.handleWebhook(signBody(rawBody), rawRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
    const normalized = Buffer.from(rawBody.toString('utf8'));
    await expect(
      controller.handleWebhook(signBody(normalized), rawRequest),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });

  it.each([
    (a: Record<string, unknown>) => {
      a.payments = [];
    },
    (a: Record<string, unknown>) => {
      delete a.payments;
    },
    (a: Record<string, unknown>) => {
      a.reference_number = '';
    },
    (a: Record<string, unknown>) => {
      delete a.reference_number;
    },
    (a: Record<string, unknown>) => {
      a.livemode = true;
    },
    (a: Record<string, unknown>) => {
      a.payments = [
        {
          id: 'pay_pending',
          type: 'payment',
          attributes: { status: 'pending', amount: 25000, currency: 'PHP' },
        },
      ];
    },
    (a: Record<string, unknown>) => {
      a.payments = [
        {
          id: 'pay_a',
          type: 'payment',
          attributes: { status: 'paid', amount: 25000, currency: 'PHP' },
        },
        {
          id: 'pay_b',
          type: 'payment',
          attributes: { status: 'paid', amount: 25000, currency: 'PHP' },
        },
      ];
    },
    ...[0, -1, 1.5, '25000', Number.MAX_SAFE_INTEGER + 1].map(
      (amount) => (a: Record<string, unknown>) => {
        a.payments = [
          {
            id: 'pay_a',
            type: 'payment',
            attributes: { status: 'paid', amount, currency: 'PHP' },
          },
        ];
      },
    ),
    ...['php', null, ''].map((currency) => (a: Record<string, unknown>) => {
      a.payments = [
        {
          id: 'pay_a',
          type: 'payment',
          attributes: { status: 'paid', amount: 25000, currency },
        },
      ];
    }),
    (a: Record<string, unknown>) => {
      a.payments = [
        {
          id: 'pay_a',
          type: 'payment',
          attributes: {
            status: 'paid',
            amount: 25000,
            currency: 'PHP',
            livemode: true,
          },
        },
      ];
    },
    (a: Record<string, unknown>) => {
      a.payments = [
        {
          id: 'pay_a',
          type: 'payment',
          attributes: {
            status: 'paid',
            amount: 25000,
            currency: 'PHP',
            payment_intent_id: 'pi_other',
          },
        },
      ];
    },
  ])(
    'rejects malformed paid evidence %# before calling settlement',
    async (mutate) => {
      const event = createEvent();
      mutate(event.data.attributes.data.attributes);
      const signed = signedRequest(event);
      await expect(
        controller.handleWebhook(signed.signature, signed.request),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    },
  );

  it('accepts one paid payment alongside failed attempts without treating them as paid', async () => {
    const event = createEvent();
    event.data.attributes.data.attributes.payments.unshift({
      id: 'pay_failed',
      type: 'payment',
      attributes: { status: 'failed', amount: 100, currency: 'PHP' },
    });
    const signed = signedRequest(event);
    await expect(
      controller.handleWebhook(signed.signature, signed.request),
    ).resolves.toEqual({ received: true });
    expect(paymentService.handlePayMongoPaymentPaid).toHaveBeenCalledOnce();
  });

  it('accepts paid amount evidence when Hosted Checkout omits the optional payment resource type', async () => {
    const event = createEvent();
    const payment = event.data.attributes.data.attributes.payments[0]!;
    Reflect.deleteProperty(payment, 'type');
    const signed = signedRequest(event);
    await expect(
      controller.handleWebhook(signed.signature, signed.request),
    ).resolves.toEqual({ received: true });
    expect(paymentService.handlePayMongoPaymentPaid).toHaveBeenCalledOnce();
  });

  it.each(['missing amount and currency', 'incorrect resource type'])(
    'rejects incomplete or conflicting Dashboard payment evidence: %s',
    async (scenario) => {
      const event = createEvent();
      const payment = event.data.attributes.data.attributes.payments[0]!;
      if (scenario === 'missing amount and currency') {
        Reflect.deleteProperty(payment, 'type');
        Reflect.deleteProperty(payment.attributes, 'amount');
        Reflect.deleteProperty(payment.attributes, 'currency');
      } else payment.type = 'checkout_session';
      const signed = signedRequest(event);
      await expect(
        controller.handleWebhook(signed.signature, signed.request),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    },
  );

  it('rejects an undocumented envelope instead of inventing an event identity', async () => {
    const event = createEvent();
    const signed = signedRequest({
      event_type: 'send.webhook',
      data: { ...event.data.attributes, resource: 'checkout_session' },
    });
    await expect(
      controller.handleWebhook(signed.signature, signed.request),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
  });
});
