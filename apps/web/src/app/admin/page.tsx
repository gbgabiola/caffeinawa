import Link from 'next/link';

import StoreOrderingPanel from '@/features/store/StoreOrderingPanel';

export default function AdminPage() {
  return (
    <div className="px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-sm font-medium text-cafe-muted">Caffeinawa Admin</p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-cafe-espresso">Dashboard</h1>

          <p className="mt-3 max-w-2xl text-cafe-muted">
            Manage customers, orders, and the coffee catalog from one place.
          </p>
        </div>

        <StoreOrderingPanel />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-cafe-border bg-cafe-paper p-6 shadow-sm">
            <p className="text-sm font-medium text-cafe-muted">Customers</p>
            <p className="mt-2 text-2xl font-semibold text-cafe-espresso">—</p>
            <p className="mt-1 text-sm text-cafe-muted">Customer management</p>
          </div>

          <div className="rounded-xl border border-cafe-border bg-cafe-paper p-6 shadow-sm">
            <p className="text-sm font-medium text-cafe-muted">Orders</p>
            <p className="mt-2 text-2xl font-semibold text-cafe-espresso">—</p>
            <p className="mt-1 text-sm text-cafe-muted">Order management</p>
          </div>

          <div className="rounded-xl border border-cafe-border bg-cafe-paper p-6 shadow-sm">
            <p className="text-sm font-medium text-cafe-muted">Coffee</p>
            <p className="mt-2 text-2xl font-semibold text-cafe-espresso">—</p>
            <p className="mt-1 text-sm text-cafe-muted">Catalog management</p>
          </div>

          <Link
            href="/admin/payments"
            className="block rounded-xl border border-cafe-border bg-cafe-paper p-6 transition hover:border-cafe-input-border hover:shadow-sm"
          >
            <p className="text-sm font-medium text-cafe-muted">Payments</p>
            <p className="mt-2 text-2xl font-semibold text-cafe-espresso">—</p>
            <p className="mt-2 text-sm text-cafe-muted">View payments and confirm cash transactions.</p>
          </Link>

          <Link
            href="/admin/payments/reconciliation"
            className="block rounded-xl border border-cafe-border bg-cafe-paper p-6 transition hover:border-cafe-input-border hover:shadow-sm"
          >
            <p className="text-sm font-medium text-cafe-muted">Payment Reconciliation</p>

            <p className="mt-2 text-2xl font-semibold text-cafe-espresso">Review</p>

            <p className="mt-2 text-sm text-cafe-muted">
              Investigate rejected PayMongo payment events and review reconciliation issues.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
