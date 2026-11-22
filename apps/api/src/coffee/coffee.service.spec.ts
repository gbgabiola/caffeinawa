import { describe, expect, it, vi } from 'vitest';
import { Prisma, CoffeeCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { CoffeeService } from './coffee.service.js';

describe('Coffee image metadata during detail updates', () => {
  const imageUrl = 'https://example.test/managed.webp';
  const coffee = {
    id: 'coffee-id',
    name: 'Latte',
    description: 'Coffee',
    category: CoffeeCategory.latte,
    price: new Prisma.Decimal(120),
    available: true,
    imageUrl,
    imagePublicId: 'managed-photo',
  };

  it('leaves photo fields untouched when the submitted URL is unchanged', async () => {
    const prisma = {
      coffee: {
        findUnique: vi.fn().mockResolvedValue(coffee),
        update: vi.fn().mockResolvedValue(coffee),
      },
    };
    const service = new CoffeeService(prisma as unknown as PrismaService);
    await service.update(coffee.id, { name: 'New name', imageUrl });
    expect(prisma.coffee.update).toHaveBeenCalledWith({
      where: { id: coffee.id },
      data: { name: 'New name' },
    });
  });

  it('clears managed metadata when replacing the URL', async () => {
    const prisma = {
      coffee: {
        findUnique: vi.fn().mockResolvedValue(coffee),
        update: vi.fn().mockResolvedValue(coffee),
      },
    };
    const service = new CoffeeService(prisma as unknown as PrismaService);
    await service.update(coffee.id, {
      imageUrl: 'https://example.test/external.jpg',
    });
    expect(prisma.coffee.update).toHaveBeenCalledWith({
      where: { id: coffee.id },
      data: {
        imageUrl: 'https://example.test/external.jpg',
        imagePublicId: null,
      },
    });
  });
});
