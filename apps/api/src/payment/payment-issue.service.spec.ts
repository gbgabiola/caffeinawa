import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentIssueReason, PaymentIssueStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { PayMongoService } from './paymongo.service.js';
import { PaymentService } from './payment.service.js';

const issueId = 'issue-1';
const recordedAt = new Date('2026-10-01T10:00:00.000Z');

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: issueId,
    providerEventId: 'evt_rejected_123',
    checkoutSessionId: 'cs_test_123',
    paymentId: 'payment-1',
    orderId: 'order-1',
    reason: PaymentIssueReason.INVALID_ORDER_STATUS,
    status: PaymentIssueStatus.OPEN,
    recordedAt,
    reviewedAt: null,
    ...overrides,
  };
}

function createHarness() {
  const prisma = {
    paymentReconciliationIssue: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const service = new PaymentService(
    prisma as unknown as PrismaService,
    {} as PayMongoService,
  );

  return { prisma, service };
}

describe('Payment reconciliation issue administration', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
    harness.prisma.paymentReconciliationIssue.count.mockResolvedValue(0);
    harness.prisma.paymentReconciliationIssue.findMany.mockResolvedValue([]);
  });

  it('lists open issues with pagination', async () => {
    harness.prisma.paymentReconciliationIssue.count.mockResolvedValue(1);
    harness.prisma.paymentReconciliationIssue.findMany.mockResolvedValue([
      makeIssue(),
    ]);

    const result = await harness.service.findReconciliationIssues({
      page: 1,
      pageSize: 10,
      status: PaymentIssueStatus.OPEN,
    });

    expect(
      harness.prisma.paymentReconciliationIssue.count,
    ).toHaveBeenCalledWith({
      where: {
        status: PaymentIssueStatus.OPEN,
      },
    });

    expect(
      harness.prisma.paymentReconciliationIssue.findMany,
    ).toHaveBeenCalledWith({
      where: {
        status: PaymentIssueStatus.OPEN,
      },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });

    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    expect(result.data[0]).toMatchObject({
      id: issueId,
      reason: PaymentIssueReason.INVALID_ORDER_STATUS,
      status: PaymentIssueStatus.OPEN,
    });
  });

  it('lists all issues when no status is provided', async () => {
    await harness.service.findReconciliationIssues({
      page: 1,
      pageSize: 10,
    });

    expect(
      harness.prisma.paymentReconciliationIssue.count,
    ).toHaveBeenCalledWith({
      where: {},
    });
  });

  it('marks an open issue reviewed', async () => {
    const reviewedAt = new Date();

    harness.prisma.paymentReconciliationIssue.updateMany.mockResolvedValue({
      count: 1,
    });

    harness.prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({
        status: PaymentIssueStatus.REVIEWED,
        reviewedAt,
      }),
    );

    const result =
      await harness.service.markReconciliationIssueReviewed(issueId);

    expect(
      harness.prisma.paymentReconciliationIssue.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: issueId,
        status: PaymentIssueStatus.OPEN,
      },
      data: {
        status: PaymentIssueStatus.REVIEWED,
        reviewedAt: expect.any(Date),
      },
    });

    expect(result.status).toBe(PaymentIssueStatus.REVIEWED);
  });

  it('does not change reviewedAt on repeat review', async () => {
    const reviewedAt = recordedAt;

    harness.prisma.paymentReconciliationIssue.updateMany.mockResolvedValue({
      count: 0,
    });

    harness.prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({
        status: PaymentIssueStatus.REVIEWED,
        reviewedAt,
      }),
    );

    const result =
      await harness.service.markReconciliationIssueReviewed(issueId);

    expect(result.reviewedAt).toBe(reviewedAt);
  });

  it('throws 404 when the issue does not exist', async () => {
    harness.prisma.paymentReconciliationIssue.updateMany.mockResolvedValue({
      count: 0,
    });

    harness.prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(
      null,
    );

    await expect(
      harness.service.markReconciliationIssueReviewed('missing-issue'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unexpected unresolved state', async () => {
    harness.prisma.paymentReconciliationIssue.updateMany.mockResolvedValue({
      count: 0,
    });

    harness.prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(
      makeIssue(),
    );

    await expect(
      harness.service.markReconciliationIssueReviewed(issueId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
