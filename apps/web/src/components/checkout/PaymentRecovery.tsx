'use client';

import { useEffect, useRef, useState } from 'react';
import type { PaymentCheckoutStatus } from '@caffeinawa/types';
import { redirectToPayMongo } from '@/lib/payment-navigation';
import { getPaymentCheckoutStatus, resumePaymentCheckout } from '@/lib/api/payment-checkout';

export default function PaymentRecovery({ orderId, accessToken }: { orderId: string; accessToken: string }) {
  const [options, setOptions] = useState<PaymentCheckoutStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const active = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    active.current = true;
    const controller = new AbortController();
    getPaymentCheckoutStatus(accessToken, orderId, controller.signal)
      .then(result => {
        if (!cancelled) {
          setOptions(result);
          setError(null);
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to check payment options.');
      });
    return () => {
      cancelled = true;
      active.current = false;
      controller.abort();
    };
  }, [accessToken, orderId, refresh]);

  async function resume() {
    if (!options?.canResume || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await resumePaymentCheckout(accessToken, orderId);
      if (!active.current) return;
      if (result.status === 'ready') {
        redirectToPayMongo(result.checkoutUrl);
        return;
      }
      setOptions({ canResume: false, message: result.message });
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : 'Unable to open payment checkout.');
    }
    if (active.current) {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!options && !error)
    return (
      <p role="status" className="mt-5 text-sm text-cafe-muted">
        Checking payment options...
      </p>
    );
  if (options && !options.canResume && !options.message && !error) return null;
  return (
    <section
      aria-label="Payment options"
      className="mt-5 rounded-xl border border-cafe-border bg-cafe-cream p-4 text-sm leading-7"
    >
      {options?.message && <p role="status">{options.message}</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {options?.canResume && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void resume()}
          className="mt-3 min-h-11 rounded-full bg-cafe-espresso px-5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Opening payment checkout...' : 'Continue payment'}
        </button>
      )}
      {(error || (options && !options.canResume)) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setRefresh(count => count + 1)}
          className="ml-3 min-h-11 underline"
        >
          Check payment options again
        </button>
      )}
    </section>
  );
}
