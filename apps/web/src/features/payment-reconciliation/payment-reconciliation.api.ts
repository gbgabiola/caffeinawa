import { adminRequest, buildQueryString, type AdminListQuery } from '@/lib/api/admin-client';

import type { PaginatedResponse } from '@caffeinawa/types';

export type PaymentIssueStatus = 'OPEN' | 'REVIEWED';

export type PaymentIssueReason =
  | 'PAYMENT_NOT_FOUND'
  | 'INVALID_PROVIDER'
  | 'ORDER_REFERENCE_MISMATCH'
  | 'INVALID_PAYMENT_STATUS'
  | 'INVALID_ORDER_STATUS'
  | 'ORDER_NOT_FOUND';

export interface PaymentReconciliationIssue {
  id: string;
  providerEventId: string;
  checkoutSessionId: string;
  paymentId: string | null;
  orderId: string | null;
  reason: PaymentIssueReason;
  status: PaymentIssueStatus;
  recordedAt: string;
  reviewedAt: string | null;
}

export interface PaymentIssueQuery extends AdminListQuery {
  status?: PaymentIssueStatus;
}

const BASE_PATH = '/admin/payments/reconciliation/issues';

export function getPaymentReconciliationIssues(
  accessToken: string,
  query: PaymentIssueQuery,
): Promise<PaginatedResponse<PaymentReconciliationIssue>> {
  return adminRequest<PaginatedResponse<PaymentReconciliationIssue>>(
    accessToken,
    `${BASE_PATH}${buildQueryString(query)}`,
  );
}

export function markPaymentReconciliationIssueReviewed(
  accessToken: string,
  issueId: string,
): Promise<PaymentReconciliationIssue> {
  return adminRequest<PaymentReconciliationIssue>(accessToken, `${BASE_PATH}/${encodeURIComponent(issueId)}/review`, {
    method: 'PATCH',
  });
}
