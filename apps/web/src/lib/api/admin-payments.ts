import { adminRequest, buildQueryString, type AdminListQuery } from './admin-client';

import type { AdminPayment, PaymentProvider, PaymentStatus, PaginatedResponse } from '@caffeinawa/types';

export interface AdminPaymentQuery extends AdminListQuery {
  provider?: PaymentProvider;
  status?: PaymentStatus;
}

export function getAdminPayments(
  accessToken: string,
  query: AdminPaymentQuery,
): Promise<PaginatedResponse<AdminPayment>> {
  return adminRequest<PaginatedResponse<AdminPayment>>(accessToken, `/admin/payments${buildQueryString(query)}`);
}

export function getAdminPayment(accessToken: string, paymentId: string): Promise<AdminPayment> {
  return adminRequest<AdminPayment>(accessToken, `/admin/payments/${encodeURIComponent(paymentId)}`);
}

export function markAdminPaymentAsPaid(accessToken: string, paymentId: string): Promise<AdminPayment> {
  return adminRequest<AdminPayment>(accessToken, `/admin/payments/${encodeURIComponent(paymentId)}/mark-paid`, {
    method: 'PATCH',
  });
}
