import type { ReactNode } from 'react';

import type { AdminListStatus } from '@/hooks/useAdminList';

interface AdminListStateProps {
  status: AdminListStatus;
  error: string | null;
  isEmpty: boolean;
  loadingMessage: string;
  emptyMessage: string;
  children: ReactNode;
}

export default function AdminListState({
  status,
  error,
  isEmpty,
  loadingMessage,
  emptyMessage,
  children,
}: AdminListStateProps) {
  if (status === 'idle' || status === 'loading') {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">{loadingMessage}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <p role="alert" className="text-sm font-medium text-red-600">
          {error ?? 'Unable to load data.'}
        </p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  return children;
}
