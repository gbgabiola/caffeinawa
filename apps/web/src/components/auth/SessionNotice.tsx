'use client';

import { useAuth } from '@/components/auth/AuthProvider';

export default function SessionNotice() {
  const { sessionError, retrySession, logout } = useAuth();

  if (!sessionError) {
    return null;
  }

  return (
    <div className="border-b border-status-warning-border bg-status-warning-soft">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p role="alert" className="text-sm leading-6 text-status-warning">
          {sessionError}
        </p>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={retrySession}
            className="min-h-11 rounded-full bg-cafe-primary px-5 text-sm font-semibold text-cafe-on-primary hover:bg-cafe-primary-hover"
          >
            Try again
          </button>

          <button
            type="button"
            onClick={logout}
            className="min-h-11 rounded-full border border-status-warning-border px-5 text-sm font-medium text-status-warning hover:bg-status-warning-soft"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
