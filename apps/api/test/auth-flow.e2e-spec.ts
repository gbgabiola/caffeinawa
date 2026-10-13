import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('Authentication flow (e2e)', () => {
  let app: INestApplication;

  const email = `auth-e2e-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  const name = 'E2E Customer';

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a customer without exposing the password hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name, email, password })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name,
        email,
      }),
    );

    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rejects registration with a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name, email, password })
      .expect(409);
  });

  it('rejects malformed registration payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: '' })
      .expect(400);
  });

  it('logs in with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        customer: expect.objectContaining({
          id: expect.any(String),
          name,
          email,
          role: 'CUSTOMER',
        }),
      }),
    );

    expect(response.body.customer).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword123!' })
      .expect(401);
  });

  it('rejects login for an unknown email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'unknown-auth-e2e@example.com',
        password,
      })
      .expect(401);
  });

  it('rejects malformed login payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'invalid-email', password: '' })
      .expect(400);
  });

  it('allows the registered customer to access /me', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            id: loginResponse.body.customer.id,
            name,
            email,
            role: 'CUSTOMER',
          }),
        );

        expect(body).not.toHaveProperty('passwordHash');
      });
  });

  it('rejects /me without an access token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });
});
