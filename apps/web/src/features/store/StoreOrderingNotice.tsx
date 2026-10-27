'use client';

import { useStoreOrdering } from '@/hooks/useStoreOrdering';

export default function StoreOrderingNotice() {
  const ordering = useStoreOrdering();

  if (ordering.isPending) {
    return (
      <p role="status" className="rounded-xl border border-cafe-border bg-cafe-paper px-4 py-3 text-sm text-cafe-muted">
        Checking ordering availability...
      </p>
    );
  }

  if (ordering.isError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p role="alert" className="text-sm leading-6 text-amber-950">
          We couldn&apos;t check whether ordering is open.
        </p>

        <button
          type="button"
          onClick={() => void ordering.refetch()}
          disabled={ordering.isFetching}
          className="mt-2 min-h-11 text-sm font-semibold text-amber-950 underline underline-offset-4 disabled:opacity-50"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <p
      role="status"
      className="rounded-xl border border-cafe-border bg-cafe-paper px-4 py-3 text-sm leading-6 text-cafe-brown"
    >
      {ordering.data.acceptingOrders
        ? 'Ordering is open. Find your next coffee moment.'
        : 'Ordering is currently closed. You can browse and prepare your cart for our next selling period.'}
    </p>
  );
}
