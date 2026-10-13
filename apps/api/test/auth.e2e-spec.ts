import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('Authentication and authorization (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let adminToken: string;

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

    adminToken = await jwtService.signAsync({
      sub: 'e2e-admin',
      email: 'admin@example.com',
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without an access token', async () => {
    await request(app.getHttpServer()).get('/api/admin/health').expect(401);
  });

  it('rejects an invalid access token', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/health')
      .set('Authorization', 'Bearer invalid.token.value')
      .expect(401);
  });

  it('forbids authenticated customers from accessing admin routes', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('allows authenticated administrators to access admin routes', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          message: 'Admin access verified',
        });
      });
  });
});
