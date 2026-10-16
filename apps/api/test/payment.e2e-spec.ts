import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PaymentService } from '../src/payment/payment.service.js';

const paymentId = 'payment-1';
const orderId = 'order-1';

const webhookSecret = 'e2e-paymongo-webhook-secret';
function getWebhookTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

const fixedDate = '2026-10-01T10:00:00.000Z';

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: paymentId,
    orderId,
    provider: 'cash',
    status: 'pending',
    amount: 250,
    currency: 'PHP',
    createdAt: fixedDate,
    updatedAt: fixedDate,
    order: {
      customer: {
        id: 'customer-1',
        name: 'Test Customer',
        email: 'customer@example.com',
      },
      items: [
        {
          coffeeName: 'Caffeinawa Latte',
          quantity: 2,
          unitPrice: 125,
        },
      ],
    },
    ...overrides,
  };
}

function makeWebhookEvent(eventType = 'checkout_session.payment.paid') {
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
            reference_number: orderId,
            payment_intent: {
              id: 'pi_test_123',
            },
          },
        },
      },
    },
  };
}

function signWebhook(rawBody: string): string {
  const timestamp = getWebhookTimestamp();

  const digest = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return `t=${timestamp},te=${digest}`;
}

function createPaymentServiceMock() {
  return {
    findAll: vi.fn(),
    findOne: vi.fn(),
    markCashPaymentAsPaid: vi.fn(),
    handlePayMongoPaymentPaid: vi.fn(),
    findReconciliationCandidates: vi.fn(),
  };
}

describe('Payment API (e2e)', () => {
  let app: INestApplication;

  let adminToken: string;
  let customerToken: string;

  const paymentService = createPaymentServiceMock();

  const originalJwtSecret = process.env.JWT_SECRET;
  const originalWebhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const originalPayMongoMode = process.env.PAYMONGO_MODE;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.PAYMONGO_WEBHOOK_SECRET = webhookSecret;
    process.env.PAYMONGO_MODE = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(PaymentService)
      .useValue(paymentService)
      .compile();

    app = moduleFixture.createNestApplication({
      rawBody: true,
    });

    app.setGlobalPrefix('api');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    const jwtService = app.get(JwtService);

    adminToken = await jwtService.signAsync({
      sub: 'e2e-admin',
      email: 'admin@example.com',
      role: 'ADMIN',
    });

    customerToken = await jwtService.signAsync({
      sub: 'e2e-customer',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    });
  });

  paymentService.findReconciliationCandidates.mockResolvedValue({
    data: [],
    meta: {
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    paymentService.findAll.mockResolvedValue({
      data: [makePayment()],
      meta: {
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      },
    });

    paymentService.findOne.mockResolvedValue(makePayment());

    paymentService.markCashPaymentAsPaid.mockResolvedValue(
      makePayment({
        status: 'paid',
        paidAt: fixedDate,
      }),
    );

    paymentService.handlePayMongoPaymentPaid.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    if (originalWebhookSecret === undefined) {
      delete process.env.PAYMONGO_WEBHOOK_SECRET;
    } else {
      process.env.PAYMONGO_WEBHOOK_SECRET = originalWebhookSecret;
    }

    if (originalPayMongoMode === undefined) {
      delete process.env.PAYMONGO_MODE;
    } else {
      process.env.PAYMONGO_MODE = originalPayMongoMode;
    }
  });

  describe('GET /api/admin/payments', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).get('/api/admin/payments').expect(401);

      expect(paymentService.findAll).not.toHaveBeenCalled();
    });

    it('rejects authenticated customers', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/payments')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      expect(paymentService.findAll).not.toHaveBeenCalled();
    });

    it('allows administrators to list payments', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toHaveLength(1);

          expect(body.data[0]).toEqual(
            expect.objectContaining({
              id: paymentId,
              provider: 'cash',
              status: 'pending',
            }),
          );

          expect(body.meta).toEqual({
            page: 1,
            pageSize: 10,
            total: 1,
            totalPages: 1,
          });
        });

      expect(paymentService.findAll).toHaveBeenCalledOnce();
    });

    it('passes search and filter parameters to the service', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/payments')
        .query({
          search: 'Latte',
          provider: 'cash',
          status: 'pending',
          page: 2,
          pageSize: 5,
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(paymentService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Latte',
          provider: 'cash',
          status: 'pending',
          page: 2,
          pageSize: 5,
        }),
      );
    });

    it('rejects invalid payment filters', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/payments')
        .query({
          provider: 'unsupported',
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(paymentService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/payments/reconciliation', () => {
    const endpoint = '/api/admin/payments/reconciliation';

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).get(endpoint).expect(401);

      expect(
        paymentService.findReconciliationCandidates,
      ).not.toHaveBeenCalled();
    });

    it('rejects customer accounts', async () => {
      await request(app.getHttpServer())
        .get(endpoint)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      expect(
        paymentService.findReconciliationCandidates,
      ).not.toHaveBeenCalled();
    });

    it('allows administrators to retrieve reconciliation candidates', async () => {
      await request(app.getHttpServer())
        .get(endpoint)
        .query({
          ageHours: 48,
          page: 2,
          pageSize: 5,
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            data: [],
            meta: {
              total: 0,
            },
          });
        });

      expect(paymentService.findReconciliationCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          ageHours: 48,
          page: 2,
          pageSize: 5,
        }),
      );
    });

    it.each([
      { ageHours: 0 },
      { ageHours: 721 },
      { ageHours: 'invalid' },
      { pageSize: 101 },
    ])('rejects invalid query parameters: %o', async (query) => {
      await request(app.getHttpServer())
        .get(endpoint)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(
        paymentService.findReconciliationCandidates,
      ).not.toHaveBeenCalled();
    });

    it('uses the default age threshold of 24 hours', async () => {
      await request(app.getHttpServer())
        .get(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(paymentService.findReconciliationCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          ageHours: 24,
          page: 1,
          pageSize: 10,
        }),
      );
    });
  });

  describe('GET /api/admin/payments/:id', () => {
    it('returns a payment for an administrator', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/payments/${paymentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            expect.objectContaining({
              id: paymentId,
              orderId,
              amount: 250,
            }),
          );
        });

      expect(paymentService.findOne).toHaveBeenCalledWith(paymentId);
    });

    it('returns 404 when a payment does not exist', async () => {
      paymentService.findOne.mockRejectedValueOnce(
        new NotFoundException('Payment not found'),
      );

      await request(app.getHttpServer())
        .get('/api/admin/payments/missing-payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/admin/payments/:id/mark-paid', () => {
    const endpoint = `/api/admin/payments/${paymentId}/mark-paid`;

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).patch(endpoint).expect(401);

      expect(paymentService.markCashPaymentAsPaid).not.toHaveBeenCalled();
    });

    it('rejects customer accounts', async () => {
      await request(app.getHttpServer())
        .patch(endpoint)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      expect(paymentService.markCashPaymentAsPaid).not.toHaveBeenCalled();
    });

    it('allows an administrator to mark cash as paid', async () => {
      await request(app.getHttpServer())
        .patch(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            expect.objectContaining({
              id: paymentId,
              provider: 'cash',
              status: 'paid',
              paidAt: fixedDate,
            }),
          );
        });

      expect(
        paymentService.markCashPaymentAsPaid,
      ).toHaveBeenCalledExactlyOnceWith(paymentId);
    });

    it('returns 400 for a forbidden payment transition', async () => {
      paymentService.markCashPaymentAsPaid.mockRejectedValueOnce(
        new BadRequestException(
          'Only cash payments can be manually marked as paid',
        ),
      );

      await request(app.getHttpServer())
        .patch(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns 404 for a missing payment', async () => {
      paymentService.markCashPaymentAsPaid.mockRejectedValueOnce(
        new NotFoundException('Payment not found'),
      );

      await request(app.getHttpServer())
        .patch(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('POST /api/webhooks/paymongo', () => {
    const endpoint = '/api/webhooks/paymongo';

    it('accepts a valid signed paid event without JWT authentication', async () => {
      const event = makeWebhookEvent();
      const rawBody = JSON.stringify(event);

      await request(app.getHttpServer())
        .post(endpoint)
        .set('Content-Type', 'application/json')
        .set('Paymongo-Signature', signWebhook(rawBody))
        .send(rawBody)
        .expect(200)
        .expect({
          received: true,
        });

      expect(paymentService.handlePayMongoPaymentPaid).toHaveBeenCalledOnce();

      const [receivedEvent, receivedRawBody] =
        paymentService.handlePayMongoPaymentPaid.mock.calls[0];

      expect(receivedEvent).toEqual(event.data);
      expect(Buffer.isBuffer(receivedRawBody)).toBe(true);
      expect(receivedRawBody.toString('utf8')).toBe(rawBody);
    });

    it('rejects a missing signature', async () => {
      const rawBody = JSON.stringify(makeWebhookEvent());

      await request(app.getHttpServer())
        .post(endpoint)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(401);

      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
      const rawBody = JSON.stringify(makeWebhookEvent());

      await request(app.getHttpServer())
        .post(endpoint)
        .set('Content-Type', 'application/json')
        .set(
          'Paymongo-Signature',
          `t=${getWebhookTimestamp()},te=${'0'.repeat(64)}`,
        )
        .send(rawBody)
        .expect(401);

      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    });

    it('acknowledges unrelated webhook events without processing payment', async () => {
      const event = makeWebhookEvent('checkout_session.payment.failed');

      const rawBody = JSON.stringify(event);

      await request(app.getHttpServer())
        .post(endpoint)
        .set('Content-Type', 'application/json')
        .set('Paymongo-Signature', signWebhook(rawBody))
        .send(rawBody)
        .expect(200)
        .expect({
          received: true,
        });

      expect(paymentService.handlePayMongoPaymentPaid).not.toHaveBeenCalled();
    });

    it('propagates payment processing errors', async () => {
      paymentService.handlePayMongoPaymentPaid.mockRejectedValueOnce(
        new NotFoundException('Payment for checkout session not found'),
      );

      const rawBody = JSON.stringify(makeWebhookEvent());

      await request(app.getHttpServer())
        .post(endpoint)
        .set('Content-Type', 'application/json')
        .set('Paymongo-Signature', signWebhook(rawBody))
        .send(rawBody)
        .expect(404);

      expect(paymentService.handlePayMongoPaymentPaid).toHaveBeenCalledOnce();
    });
  });
});
