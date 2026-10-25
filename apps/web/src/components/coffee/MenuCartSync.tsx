'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/auth/AuthProvider';
import { isCartChangeForCustomer } from '@/lib/cart-events';

export default function MenuCartSync() {
  const queryClient = useQueryClient();
  const { customer, isAuthenticated } = useAuth();

  const customerId = customer?.id;

  useEffect(() => {
    if (!isAuthenticated || !customerId) return;

    function handleCartChanged(event: StorageEvent) {
      if (!isCartChangeForCustomer(event, customerId!)) {
        return;
      }

      void queryClient.invalidateQueries(
        {
          queryKey: ['menu-cart', customerId],
          exact: true,
        },
        {
          cancelRefetch: false,
        },
      );
    }

    window.addEventListener('storage', handleCartChanged);

    return () => {
      window.removeEventListener('storage', handleCartChanged);
    };
  }, [customerId, isAuthenticated, queryClient]);

  return null;
}
