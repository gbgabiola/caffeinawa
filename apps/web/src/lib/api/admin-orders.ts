import { adminRequest, buildQueryString, type AdminListQuery } from './admin-client';

import type { AdminOrder, OrderStatus, PaginatedResponse } from '@caffeinawa/types';

export interface AdminOrderQuery extends AdminListQuery {
  status?: OrderStatus;
}

export function getAdminOrders(accessToken: string, query: AdminOrderQuery): Promise<PaginatedResponse<AdminOrder>> {
  return adminRequest<PaginatedResponse<AdminOrder>>(accessToken, `/admin/orders${buildQueryString(query)}`);
}

export function getAdminOrder(accessToken: string, orderId: string): Promise<AdminOrder> {
  return adminRequest<AdminOrder>(accessToken, `/admin/orders/${encodeURIComponent(orderId)}`);
}

export function updateAdminOrder(accessToken: string, orderId: string, status: OrderStatus): Promise<AdminOrder> {
  return adminRequest<AdminOrder>(accessToken, `/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
