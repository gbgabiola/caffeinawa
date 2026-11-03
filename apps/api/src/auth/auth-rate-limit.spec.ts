import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard.js';
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
    vi.stubEnv('AUTH_CLIENT_IP_SOURCE', 'socket');
    vi.stubEnv('RENDER', 'false');
    vi.stubEnv('RENDER_SERVICE_TYPE', 'web');

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
        AuthThrottlerGuard,
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  function enableRenderEdgeMode() {
    vi.stubEnv('AUTH_CLIENT_IP_SOURCE', 'render-cloudflare');
    vi.stubEnv('RENDER', 'true');
    vi.stubEnv('RENDER_SERVICE_TYPE', 'web');
  }

  it('gives different edge clients separate buckets and ignores forged XFF', async () => {
    enableRenderEdgeMode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('CF-Connecting-IP', '198.51.100.1')
        .set('X-Forwarded-For', `203.0.113.${attempt + 1}`)
        .set('True-Client-IP', `203.0.113.${attempt + 1}`)
        .send({ email: 'customer@example.com', password: 'TestPassword123!' })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('CF-Connecting-IP', '198.51.100.1')
      .set('X-Forwarded-For', '192.0.2.10')
      .send({ email: 'customer@example.com', password: 'TestPassword123!' })
      .expect(429);
    const otherClient = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('CF-Connecting-IP', '203.0.113.1')
      .send({ email: 'customer@example.com', password: 'TestPassword123!' })
      .expect(201);
    expect(otherClient.headers['x-ratelimit-remaining']).toBe('9');
    expect(authService.login).toHaveBeenCalledTimes(11);
  });

  it('retains IPv6 subnet grouping for edge clients', async () => {
    enableRenderEdgeMode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('CF-Connecting-IP', '2001:db8:abcd:1200::1')
        .send({ email: 'customer@example.com', password: 'TestPassword123!' })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('CF-Connecting-IP', '2001:db8:abcd:1200::2')
      .send({ email: 'customer@example.com', password: 'TestPassword123!' })
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('CF-Connecting-IP', '2001:db8:ffff::1')
      .send({ email: 'customer@example.com', password: 'TestPassword123!' })
      .expect(201);
  });

  it.each([undefined, 'not-an-ip', '198.51.100.1,203.0.113.1'])(
    'fails closed for an invalid edge header: %s',
    async (ip) => {
      enableRenderEdgeMode();
      const req = request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.1');
      if (ip !== undefined) req.set('CF-Connecting-IP', ip);
      const response = await req
        .send({ email: 'customer@example.com', password: 'TestPassword123!' })
        .expect(503);
      expect(response.body.message).toBe(
        'Authentication temporarily unavailable',
      );
      expect(authService.login).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty login body before calling authentication', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({})
      .expect(400);
    expect(response.headers['x-ratelimit-remaining']).toBe('9');
    expect(authService.login).not.toHaveBeenCalled();
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
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `198.51.100.${attempt + 1}`)
        .set('CF-Connecting-IP', `203.0.113.${attempt + 1}`)
        .send({
          email: 'customer@example.com',
          password: 'TestPassword123!',
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.100')
      .set('CF-Connecting-IP', '198.51.100.100')
      .send({
        email: 'customer@example.com',
        password: 'TestPassword123!',
      })
      .expect(429);

    expect(authService.login).toHaveBeenCalledTimes(10);
  });
});
