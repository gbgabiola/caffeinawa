import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const secret = 'isolated-http-webhook-secret';
describe('Signed PayMongo webhook settlement (database HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerId: string;
  let orderId: string;
  let paymentId: string;
  let sessionId: string;
  let previousOpen: boolean;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (
      !url ||
      url !== process.env.TEST_DATABASE_URL ||
      !decodeURIComponent(new URL(url).pathname).toLowerCase().includes('test')
    )
      throw new Error(
        'Exact TEST_DATABASE_URL and a test database are required',
      );
    vi.stubEnv('PAYMONGO_MODE', 'test');
    vi.stubEnv('PAYMONGO_WEBHOOK_SECRET', secret);
    vi.stubEnv('PAYMONGO_ENABLED', 'false');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ rawBody: true, logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    previousOpen = (
      await prisma.storeSettings.findUniqueOrThrow({ where: { id: 'main' } })
    ).acceptingOrders;
    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: false },
    });
    customerId = (
      await prisma.customer.create({
        data: {
          name: 'Signed Webhook Test',
          email: `${randomUUID()}@example.test`,
        },
      })
    ).id;
  });
  beforeEach(async () => {
    sessionId = `cs_${randomUUID()}`;
    orderId = (
      await prisma.order.create({ data: { customerId, total: '250.00' } })
    ).id;
    paymentId = (
      await prisma.payment.create({
        data: {
          orderId,
          checkoutSessionId: sessionId,
          provider: 'PAYMONGO',
          amount: '250.00',
          currency: 'PHP',
        },
      })
    ).id;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (orderId) {
      await prisma.paymentReconciliationIssue.deleteMany({
        where: { OR: [{ orderId }, { checkoutSessionId: sessionId }] },
      });
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
  });
  afterAll(async () => {
    try {
      if (prisma && customerId)
        await prisma.customer.delete({ where: { id: customerId } });
    } finally {
      try {
        if (prisma && previousOpen !== undefined)
          await prisma.storeSettings.update({
            where: { id: 'main' },
            data: { acceptingOrders: previousOpen },
          });
      } finally {
        vi.unstubAllEnvs();
        if (app) await app.close();
      }
    }
  });

  function event(id = `evt_${randomUUID()}`) {
    return {
      data: {
        id,
        type: 'event',
        attributes: {
          type: 'checkout_session.payment.paid',
          livemode: false,
          data: {
            id: sessionId,
            type: 'checkout_session',
            attributes: {
              reference_number: orderId,
              payment_intent: { id: 'pi_test' },
              payments: [
                {
                  id: 'pay_failed',
                  type: 'payment',
                  attributes: {
                    status: 'failed',
                    amount: 100,
                    currency: 'PHP',
                    payment_intent_id: 'pi_old',
                  },
                },
                {
                  id: 'pay_paid',
                  type: 'payment',
                  attributes: {
                    status: 'paid',
                    amount: 25000,
                    currency: 'PHP',
                    payment_intent_id: 'pi_test',
                  },
                },
              ],
            },
          },
        },
      },
    };
  }
  function post(
    payload: ReturnType<typeof event>,
    { timestamp = Math.floor(Date.now() / 1000), tamper = false } = {},
  ) {
    const raw = JSON.stringify(payload, null, 2);
    const signature = createHmac('sha256', secret)
      .update(String(timestamp))
      .update('.')
      .update(Buffer.from(raw))
      .digest('hex');
    return request(app.getHttpServer())
      .post('/api/webhooks/paymongo')
      .set('Content-Type', 'application/json')
      .set('Paymongo-Signature', `t=${timestamp},te=${signature},li=`)
      .send(tamper ? JSON.stringify(payload) : raw);
  }
  async function expectPending() {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(payment.status).toBe('PENDING');
    expect(payment.paidAt).toBeNull();
    expect(payment.providerEventId).toBeNull();
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe('PENDING');
  }

  it.each([true, false])(
    'settles a raw signed paid event with payment type present=%s while checkout is disabled',
    async (includePaymentType) => {
      const payload = event();
      if (!includePaymentType) {
        for (const payment of payload.data.attributes.data.attributes.payments)
          Reflect.deleteProperty(payment, 'type');
      }
      await post(payload).expect(200);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment).toMatchObject({
        status: 'PAID',
        providerEventId: payload.data.id,
        paymentIntentId: 'pi_test',
      });
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
          .status,
      ).toBe('CONFIRMED');
      expect(
        (
          await prisma.storeSettings.findUniqueOrThrow({
            where: { id: 'main' },
          })
        ).acceptingOrders,
      ).toBe(false);
      expect(process.env.PAYMONGO_ENABLED).toBe('false');
    },
  );

  it.each(['same', 'different'])(
    'handles concurrent %s event IDs without replacing the winning settlement',
    async (mode) => {
      const first = event();
      const second = mode === 'same' ? first : event();
      const results = await Promise.all([post(first), post(second)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const settled = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      await post(first).expect(200);
      await post(second).expect(200);
      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(after.paidAt).toEqual(settled.paidAt);
      expect(after.providerEventId).toBe(settled.providerEventId);
      expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
      expect(
        await prisma.paymentReconciliationIssue.count({
          where: { checkoutSessionId: sessionId },
        }),
      ).toBe(0);
    },
  );

  it.each([
    { amount: 24999, currency: 'PHP' },
    { amount: 25001, currency: 'PHP' },
    { amount: 25000, currency: 'USD' },
  ])(
    'keeps mismatched details %j unpaid and records one durable issue',
    async (details) => {
      const payload = event();
      Object.assign(
        payload.data.attributes.data.attributes.payments[1]!.attributes,
        details,
      );
      await post(payload).expect(400);
      await post(payload).expect(400);
      await expectPending();
      const issues = await prisma.paymentReconciliationIssue.findMany({
        where: { checkoutSessionId: sessionId },
      });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        reason: 'PAYMENT_DETAILS_MISMATCH',
        status: 'OPEN',
        paymentId,
        orderId,
      });
      await post(event()).expect(200);
      expect(
        (
          await prisma.paymentReconciliationIssue.findUniqueOrThrow({
            where: { id: issues[0]!.id },
          })
        ).status,
      ).toBe('OPEN');
    },
  );

  it('preserves an existing settlement when a conflicting duplicate arrives', async () => {
    const payload = event();
    await post(payload).expect(200);
    const original = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    payload.data.attributes.data.attributes.payments[1]!.attributes.amount = 1;
    await post(payload).expect(400);
    const after = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(after.paidAt).toEqual(original.paidAt);
    expect(after.providerEventId).toBe(original.providerEventId);
    expect(after.status).toBe('PAID');
  });

  it('rejects tampered raw-body formatting and stale signatures before writes', async () => {
    await post(event(), { tamper: true }).expect(401);
    await post(event(), {
      timestamp: Math.floor(Date.now() / 1000) - 301,
    }).expect(401);
    await expectPending();
    expect(
      await prisma.paymentReconciliationIssue.count({
        where: { checkoutSessionId: sessionId },
      }),
    ).toBe(0);
  });

  it('rejects a signed mode mismatch before writes', async () => {
    const payload = event();
    payload.data.attributes.livemode = true;
    await post(payload).expect(401);
    await expectPending();
  });

  it.each(['no paid payment', 'multiple paid payments', 'conflicting intent'])(
    'rejects %s without settlement',
    async (variant) => {
      const payload = event();
      const a = payload.data.attributes.data.attributes;
      if (variant === 'no paid payment') a.payments.pop();
      else if (variant === 'multiple paid payments')
        a.payments.push({ ...a.payments[1]!, id: 'pay_second' });
      else a.payments[1]!.attributes.payment_intent_id = 'pi_wrong';
      await post(payload).expect(400);
      await expectPending();
    },
  );

  it('rolls back cancelled-order settlement and retains its reconciliation issue', async () => {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
    await post(event()).expect(400);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }))
        .status,
    ).toBe('PENDING');
    expect(
      (
        await prisma.paymentReconciliationIssue.findFirstOrThrow({
          where: { checkoutSessionId: sessionId },
        })
      ).reason,
    ).toBe('INVALID_ORDER_STATUS');
  });

  it('returns a retriable failure on a database error, then settles the same event on redelivery', async () => {
    const payload = event();
    const transaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(
      async (callback) => {
        if (typeof callback !== 'function')
          throw new Error('Expected settlement transaction');
        return transaction(async (tx) => {
          await callback(tx);
          throw new Error('Synthetic failure before commit');
        });
      },
    );
    await post(payload).expect(500);
    await expectPending();
    await post(payload).expect(200);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }))
        .status,
    ).toBe('PAID');
  });
});
