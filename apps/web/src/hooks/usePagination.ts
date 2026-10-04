import { useMemo, useState } from 'react';

import { ADMIN_PAGE_SIZE } from '@/constants/admin';

interface UsePaginationResult<T> {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  paginatedItems: T[];
  setCurrentPage: (page: number) => void;
  resetPage: () => void;
}

export function usePagination<T>(items: T[], pageSize = ADMIN_PAGE_SIZE): UsePaginationResult<T> {
  const [currentPageState, setCurrentPageState] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(currentPageState, totalPages);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;

    return items.slice(startIndex, startIndex + pageSize);
  }, [items, currentPage, pageSize]);

  function setCurrentPage(page: number) {
    setCurrentPageState(Math.min(Math.max(page, 1), totalPages));
  }

  function resetPage() {
    setCurrentPageState(1);
  }

  return {
    currentPage,
    totalPages,
    pageSize,
    paginatedItems,
    setCurrentPage,
    resetPage,
  };
}
