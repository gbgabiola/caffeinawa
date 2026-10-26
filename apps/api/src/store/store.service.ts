import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service.js';

const STORE_ID = 'main';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrdering() {
    const settings = await this.prisma.storeSettings.findUnique({
      where: { id: STORE_ID },
    });

    return {
      acceptingOrders: settings?.acceptingOrders ?? false,
      updatedAt: settings?.updatedAt.toISOString() ?? null,
    };
  }

  async setOrdering(acceptingOrders: boolean) {
    const settings = await this.prisma.storeSettings.upsert({
      where: { id: STORE_ID },
      create: {
        id: STORE_ID,
        acceptingOrders,
      },
      update: {
        acceptingOrders,
      },
    });

    return {
      acceptingOrders: settings.acceptingOrders,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async assertAcceptingOrders(tx: Prisma.TransactionClient): Promise<void> {
    const settings = await tx.$queryRaw<Array<{ acceptingOrders: boolean }>>`
      SELECT "acceptingOrders"
      FROM "StoreSettings"
      WHERE "id" = ${STORE_ID}
      FOR SHARE
    `;

    if (settings[0]?.acceptingOrders !== true) {
      throw new ConflictException({
        statusCode: 409,
        code: 'ORDERING_CLOSED',
        message: 'We are not accepting new orders right now.',
      });
    }
  }
}
