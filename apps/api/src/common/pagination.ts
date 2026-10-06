import type { PaginationMeta, PaginatedResponse } from '@caffeinawa/types';

export function toPaginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const meta: PaginationMeta = {
    page: normalizedPage,
    pageSize,
    total,
    totalPages,
  };

  return { data, meta };
}
