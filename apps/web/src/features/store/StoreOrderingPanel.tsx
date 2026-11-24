'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/auth/AuthProvider';
import { useStoreOrdering } from '@/hooks/useStoreOrdering';
import { updateStoreOrdering } from './store.api';

export default function StoreOrderingPanel() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const ordering = useStoreOrdering();

  const mutation = useMutation({
    mutationFn: (acceptingOrders: boolean) => {
      if (!accessToken) {
        throw new Error('Authentication required.');
      }

      return updateStoreOrdering(accessToken, acceptingOrders);
    },
    retry: false,
    onSuccess: result => {
      queryClient.setQueryData(['store', 'ordering'], result);
    },
  });

  async function toggleOrdering() {
    if (!accessToken || !ordering.data || ordering.isError || mutation.isPending) {
      return;
    }

    try {
      await mutation.mutateAsync(!ordering.data.acceptingOrders);
    } catch {
      // Displayed through mutation.error below.
    }
  }

  return (
    <section aria-labelledby="ordering-control-heading" className="mt-8 rounded-xl border border-cafe-border bg-cafe-paper p-6">
      <h2 id="ordering-control-heading" className="text-lg font-semibold text-cafe-espresso">
        Store ordering
      </h2>

      <p className="mt-2 text-sm leading-6 text-cafe-muted">
        Control whether customers can place new orders. Closing does not cancel existing orders or stop payment
        processing.
      </p>

      {ordering.isPending ? (
        <p role="status" className="mt-4 text-sm text-cafe-muted">
          Loading ordering status...
        </p>
      ) : ordering.isError ? (
        <div className="mt-4">
          <p role="alert" className="text-sm text-status-error">
            {ordering.error.message}
          </p>

          <button
            type="button"
            onClick={() => void ordering.refetch()}
            disabled={ordering.isFetching}
            className="mt-3 rounded-lg border border-cafe-input-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p role="status" className="text-sm font-semibold text-cafe-espresso">
            {ordering.data.acceptingOrders ? 'Open — accepting new orders' : 'Closed — browsing only'}
          </p>

          <button
            type="button"
            onClick={() => void toggleOrdering()}
            disabled={!accessToken || mutation.isPending}
            className="min-h-11 rounded-lg bg-cafe-primary px-5 text-sm font-semibold text-cafe-on-primary hover:bg-cafe-primary-hover disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : ordering.data.acceptingOrders ? 'Close ordering' : 'Open ordering'}
          </button>
        </div>
      )}

      {mutation.isError && (
        <p role="alert" className="mt-4 text-sm text-status-error">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
