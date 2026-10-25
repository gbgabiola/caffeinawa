'use client';

import { useAuth } from '@/components/auth/AuthProvider';

export default function SessionNotice() {
  const { sessionError, retrySession, logout } = useAuth();

  if (!sessionError) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p role="alert" className="text-sm leading-6 text-amber-950">
          {sessionError}
        </p>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={retrySession}
            className="min-h-11 rounded-full bg-cafe-espresso px-5 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Try again
          </button>

          <button
            type="button"
            onClick={logout}
            className="min-h-11 rounded-full border border-amber-300 px-5 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
