'use client';

import { useQuery } from '@tanstack/react-query';

import { getStoreOrdering } from '@/features/store/store.api';

export function useStoreOrdering() {
  return useQuery({
    queryKey: ['store', 'ordering'],
    queryFn: getStoreOrdering,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
