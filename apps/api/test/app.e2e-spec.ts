import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('Caffeinawa API (e2e)', () => {
  let app: INestApplication;

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

  it('GET /api/menu returns an array of menu items', async () => {
    await request(app.getHttpServer())
      .get('/api/menu')
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body)).toBe(true);

        if (body.length > 0) {
          expect(body[0]).toEqual(
            expect.objectContaining({
              id: expect.any(String),
              name: expect.any(String),
              description: expect.any(String),
              category: expect.any(String),
              price: expect.any(Number),
              available: expect.any(Boolean),
            }),
          );
        }
      });
  });

  it('GET /api/menu filters by category and availability', async () => {
    await request(app.getHttpServer())
      .get('/api/menu?category=latte&available=true')
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body)).toBe(true);

        for (const item of body) {
          expect(item.category).toBe('latte');
          expect(item.available).toBe(true);
        }
      });
  });

  it('GET /api/menu rejects an invalid category', async () => {
    await request(app.getHttpServer())
      .get('/api/menu?category=invalid-category')
      .expect(400);
  });

  it('GET /api/menu rejects an invalid availability value', async () => {
    await request(app.getHttpServer())
      .get('/api/menu?available=invalid')
      .expect(400);
  });

  it('GET / remains unavailable', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
