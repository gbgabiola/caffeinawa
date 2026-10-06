'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';

import type { PaginatedResponse } from '@caffeinawa/types';

export type AdminListStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseAdminListQueryOptions<T> {
  accessToken: string | null;
  queryKey: readonly unknown[];
  queryFn: (accessToken: string) => Promise<PaginatedResponse<T>>;
  enabled?: boolean;
}

export function useAdminListQuery<T>({ accessToken, queryKey, queryFn, enabled = true }: UseAdminListQueryOptions<T>) {
  const query = useQuery({
    queryKey,
    queryFn: () => queryFn(accessToken as string),
    enabled: enabled && Boolean(accessToken),
    placeholderData: keepPreviousData,
    staleTime: 30000,
  });
  const status: AdminListStatus = query.isPending ? 'loading' : query.isError ? 'error' : 'success';

  return {
    ...query,
    status,
    data: query.data,
    items: query.data?.data ?? [],
    meta: query.data?.meta,
  };
}
