import type { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerPaymentController } from './customer-payment.controller.js';
import { PayMongoCheckoutService } from './paymongo-checkout.service.js';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard.js';

let app: INestApplication;
let token: string;
const checkout = { resume: vi.fn(), status: vi.fn() };
beforeEach(async () => {
  vi.stubEnv('AUTH_CLIENT_IP_SOURCE', 'socket');
  checkout.resume
    .mockReset()
    .mockResolvedValue({
      status: 'unavailable',
      message: 'Review this order.',
    });
  checkout.status
    .mockReset()
    .mockResolvedValue({ canResume: false, message: '' });
  const module = await Test.createTestingModule({
    imports: [
      JwtModule.register({
        secret: 'synthetic-unit-test-secret',
        signOptions: { expiresIn: '15m' },
      }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 10 }]),
    ],
    controllers: [CustomerPaymentController],
    providers: [
      AuthThrottlerGuard,
      { provide: PayMongoCheckoutService, useValue: checkout },
    ],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  token = await app
    .get(JwtService)
    .signAsync({
      sub: 'customer',
      email: 'test@example.test',
      role: 'CUSTOMER',
    });
});
afterEach(async () => {
  if (app) await app.close();
  vi.unstubAllEnvs();
});

describe('Explicit payment recovery rate limit', () => {
  it('limits resume to five calls/minute even across order IDs and spoofed forwarding headers', async () => {
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post(`/orders/order-${i}/payment-checkout/resume`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', `203.0.113.${i + 1}`)
        .expect(200);
    await request(app.getHttpServer())
      .post('/orders/another-order/payment-checkout/resume')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', '203.0.113.99')
      .expect(429);
    expect(checkout.resume).toHaveBeenCalledTimes(5);
    for (let i = 0; i < 6; i++)
      await request(app.getHttpServer())
        .get('/orders/order/payment-checkout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
  });
  it('requires authentication before consuming provider-recovery work', async () => {
    await request(app.getHttpServer())
      .post('/orders/order/payment-checkout/resume')
      .expect(401);
    expect(checkout.resume).not.toHaveBeenCalled();
  });
});
