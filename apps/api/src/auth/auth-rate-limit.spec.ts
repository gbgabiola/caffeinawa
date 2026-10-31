import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

describe('Authentication rate limits', () => {
  let app: INestApplication;

  const authService = {
    register: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    authService.register.mockResolvedValue({
      id: 'customer-1',
      name: 'Test Customer',
      email: 'customer@example.com',
    });

    authService.login.mockResolvedValue({
      accessToken: 'test-token',
      customer: {
        id: 'customer-1',
        name: 'Test Customer',
        email: 'customer@example.com',
        role: 'CUSTOMER',
      },
    });

    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: 60_000,
            limit: 10,
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');

    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('allows ordinary login requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'customer@example.com',
        password: 'TestPassword123!',
      })
      .expect(201);

    expect(response.body.accessToken).toBe('test-token');
    expect(authService.login).toHaveBeenCalledOnce();
  });

  it('limits login attempts and stops calling the service', async () => {
    authService.login.mockRejectedValue(
      new UnauthorizedException('Invalid email or password'),
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'customer@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'customer@example.com',
        password: 'WrongPassword123!',
      })
      .expect(429);

    expect(response.headers['retry-after']).toBeDefined();
    expect(authService.login).toHaveBeenCalledTimes(10);
  });

  it('limits registration without exhausting the login limit', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Test Customer',
          email: `customer-${attempt}@example.com`,
          password: 'TestPassword123!',
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Test Customer',
        email: 'another@example.com',
        password: 'TestPassword123!',
      })
      .expect(429);

    expect(authService.register).toHaveBeenCalledTimes(5);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'customer@example.com',
        password: 'TestPassword123!',
      })
      .expect(201);
  });

  it('does not trust arbitrary forwarding headers by default', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `198.51.100.${attempt + 1}`)
        .send({
          email: 'customer@example.com',
          password: 'TestPassword123!',
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.100')
      .send({
        email: 'customer@example.com',
        password: 'TestPassword123!',
      })
      .expect(429);

    expect(authService.login).toHaveBeenCalledTimes(10);
  });
});
