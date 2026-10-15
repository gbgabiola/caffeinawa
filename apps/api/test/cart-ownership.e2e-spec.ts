import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('Cart ownership protection (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;

  const anotherCustomerId = 'another-customer';
  const cartItemId = 'e2e-cart-item';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

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

    customerToken = await jwtService.signAsync({
      sub: 'e2e-customer',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects reading another customer’s cart', async () => {
    await request(app.getHttpServer())
      .get(`/api/customers/${anotherCustomerId}/cart`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('rejects adding items to another customer’s cart', async () => {
    await request(app.getHttpServer())
      .post(`/api/customers/${anotherCustomerId}/cart/items`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        coffeeId: '00000000-0000-4000-8000-000000000001',
        quantity: 1,
      })
      .expect(403);
  });

  it('rejects updating items in another customer’s cart', async () => {
    await request(app.getHttpServer())
      .patch(`/api/customers/${anotherCustomerId}/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quantity: 2 })
      .expect(403);
  });

  it('rejects removing items from another customer’s cart', async () => {
    await request(app.getHttpServer())
      .delete(`/api/customers/${anotherCustomerId}/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('rejects clearing another customer’s cart', async () => {
    await request(app.getHttpServer())
      .delete(`/api/customers/${anotherCustomerId}/cart`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });
});
