import { useEffect, useState } from 'react';

export type AdminListStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseAdminListResult<T> {
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  error: string | null;
  status: AdminListStatus;
}

type AdminListFetcher<T> = (accessToken: string) => Promise<T[]>;

export function useAdminList<T>(
  accessToken: string | null,
  fetcher: AdminListFetcher<T>,
  errorMessage: string,
): UseAdminListResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminListStatus>('idle');

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setStatus('loading');
      setError(null);

      void fetcher(accessToken)
        .then(result => {
          if (cancelled) {
            return;
          }

          setData(result);
          setStatus('success');
        })
        .catch(error => {
          if (cancelled) {
            return;
          }

          setError(error instanceof Error ? error.message : errorMessage);
          setStatus('error');
        });
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, fetcher, errorMessage]);

  return {
    data,
    setData,
    error,
    status,
  };
}
