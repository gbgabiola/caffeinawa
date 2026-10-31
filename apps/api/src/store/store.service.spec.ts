import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { StoreService } from './store.service.js';

function createHarness() {
  const settings = {
    id: 'main',
    acceptingOrders: true,
    updatedAt: new Date('2026-10-31T00:00:00.000Z'),
  };

  const prisma = {
    storeSettings: {
      findUnique: vi.fn().mockResolvedValue(settings),
      upsert: vi.fn().mockResolvedValue(settings),
    },
  };

  return new StoreService(prisma as unknown as PrismaService);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('StoreService payment capabilities', () => {
  it.each([
    { enabled: 'false', methods: ['cash'] },
    { enabled: 'true', methods: ['cash', 'paymongo'] },
  ])(
    'returns matching GET and PATCH capabilities when enabled=$enabled',
    async ({ enabled, methods }) => {
      vi.stubEnv('PAYMONGO_ENABLED', enabled);

      const service = createHarness();

      expect((await service.getOrdering()).paymentMethods).toEqual(methods);
      expect((await service.setOrdering(true)).paymentMethods).toEqual(methods);
    },
  );

  it('keeps existing payment methods available when ordering is closed', async () => {
    vi.stubEnv('PAYMONGO_ENABLED', 'true');

    const prisma = {
      storeSettings: {
        findUnique: vi.fn().mockResolvedValue({
          acceptingOrders: false,
          updatedAt: new Date('2026-10-31T00:00:00.000Z'),
        }),
      },
    };

    const service = new StoreService(prisma as unknown as PrismaService);

    expect(await service.getOrdering()).toMatchObject({
      acceptingOrders: false,
      paymentMethods: ['cash', 'paymongo'],
    });
  });
});
