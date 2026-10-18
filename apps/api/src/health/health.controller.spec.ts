import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController HTTP endpoints', () => {
  let app: INestApplication;

  const queryRaw = vi.fn();

  beforeEach(async () => {
    queryRaw.mockReset();

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: queryRaw,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');

    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('reports liveness without querying the database', async () => {
    await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when the database responds', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect({
        status: 'ok',
        database: 'up',
      });

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without exposing database error details', async () => {
    queryRaw.mockRejectedValueOnce(new Error('Internal connection details'));

    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      message: 'Database unavailable',
    });

    expect(response.text).not.toContain('Internal connection details');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
