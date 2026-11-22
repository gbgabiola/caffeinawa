import {
  UnauthorizedException,
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CoffeeImageController } from './coffee-image.controller.js';
import { CoffeeImageBodyInterceptor } from './coffee-image-body.interceptor.js';
import { CoffeeImageService } from './coffee-image.service.js';

const id = 'd15c0ffe-0000-4000-8000-000000000001';
describe('Admin photo HTTP boundary', () => {
  let app: INestApplication;
  const images = { isEnabled: vi.fn(), attach: vi.fn() };
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv('AUTH_CLIENT_IP_SOURCE', 'socket');
    images.isEnabled.mockReturnValue(true);
    images.attach.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/photo.webp',
    });
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [CoffeeImageController],
      providers: [
        AuthThrottlerGuard,
        CoffeeImageBodyInterceptor,
        { provide: CoffeeImageService, useValue: images },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = {
            sub: id,
            role: req.headers.authorization === 'admin' ? 'ADMIN' : 'CUSTOMER',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ rawBody: true });
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
  const path = `/admin/coffee-images/${id}`;
  it('accepts bounded raw file bytes after admin authorization', async () => {
    const bytes = Buffer.from('image bytes');
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'admin')
      .set('Content-Type', 'image/png')
      .send(bytes)
      .expect(200);
    expect(images.attach).toHaveBeenCalledWith(id, bytes);
  });
  it('reports upload configuration without exposing credentials', async () => {
    images.isEnabled.mockReturnValue(false);
    const res = await request(app.getHttpServer())
      .get('/admin/coffee-images/status')
      .set('Authorization', 'admin')
      .expect(200);
    expect(res.body).toEqual({ enabled: false });
  });
  it.each([
    ['', 401],
    ['customer', 403],
  ] as const)(
    'rejects unauthorized uploads before processing: %s',
    async (auth, status) => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', auth)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('photo'))
        .expect(status);
      expect(images.attach).not.toHaveBeenCalled();
    },
  );
  it.each(['image/svg+xml', 'application/json', 'multipart/form-data'])(
    'rejects unsupported content types: %s',
    async (type) => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'admin')
        .set('Content-Type', type)
        .send(Buffer.from('photo'))
        .expect(415);
      expect(images.attach).not.toHaveBeenCalled();
    },
  );
  it('rejects compressed input', async () => {
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'admin')
      .set('Content-Type', 'image/png')
      .set('Content-Encoding', 'gzip')
      .send(Buffer.from('photo'))
      .expect(415);
    expect(images.attach).not.toHaveBeenCalled();
  });
  it('rejects oversized uploads without calling the provider service', async () => {
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'admin')
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(3 * 1024 * 1024 + 1))
      .expect(413);
    expect(images.attach).not.toHaveBeenCalled();
  });
  it('rejects invalid coffee IDs', async () => {
    await request(app.getHttpServer())
      .post('/admin/coffee-images/invalid')
      .set('Authorization', 'admin')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('photo'))
      .expect(400);
    expect(images.attach).not.toHaveBeenCalled();
  });
  it('limits uploads even when forwarding headers change', async () => {
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'admin')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('photo'))
        .expect(200);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'admin')
      .set('X-Forwarded-For', '203.0.113.1')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('photo'))
      .expect(429);
    expect(images.attach).toHaveBeenCalledTimes(5);
  });
});
