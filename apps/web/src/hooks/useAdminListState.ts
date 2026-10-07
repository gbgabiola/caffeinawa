'use client';

import { useDeferredValue, useState } from 'react';

interface UseAdminListStateOptions {
  initialPage?: number;
  initialSearch?: string;
}

export function useAdminListState({
  initialPage = 1,
  initialSearch = '',
}: UseAdminListStateOptions = {}) {
  const [search, setSearchState] = useState(initialSearch);
  const deferredSearch = useDeferredValue(search);
  const [currentPage, setCurrentPageState] = useState(initialPage);

  function setSearch(value: string) {
    setSearchState(value);
    setCurrentPageState(initialPage);
  }

  function setCurrentPage(page: number) {
    setCurrentPageState(Math.max(1, page));
  }

  function resetPage() {
    setCurrentPageState(initialPage);
  }

  return {
    search,
    deferredSearch,
    setSearch,
    currentPage,
    setCurrentPage,
    resetPage,
  };
}
