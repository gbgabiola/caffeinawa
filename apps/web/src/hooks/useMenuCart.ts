'use client';

import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/auth/AuthProvider';
import { addCartItem, getCart, removeCartItem, updateCartItem } from '@/lib/api/cart';
import { notifyCartChanged } from '@/lib/cart-events';

import type { Cart } from '@caffeinawa/types';

type CartAction = { type: 'add'; coffeeId: string } | { type: 'decrease'; coffeeId: string };

export function useMenuCart() {
  const queryClient = useQueryClient();

  const { customer, accessToken, isAuthenticated, isLoading: authLoading } = useAuth();

  const customerId = customer?.id;

  const enabled = !authLoading && isAuthenticated && Boolean(customerId && accessToken);

  const queryKey = ['menu-cart', customerId] as const;
  const mutationKey = ['menu-cart-mutation', customerId] as const;

  async function loadCart(): Promise<Cart> {
    if (!customerId || !accessToken) {
      throw new Error('Authentication required.');
    }

    return getCart(accessToken, customerId);
  }

  const cartQuery = useQuery<Cart, Error>({
    queryKey,
    queryFn: loadCart,
    enabled,
    staleTime: 30_000,
  });

  const mutation = useMutation<Cart, Error, CartAction>({
    mutationKey,
    retry: false,

    mutationFn: async action => {
      if (!enabled || !customerId || !accessToken) {
        throw new Error('Authentication required.');
      }

      if (action.type === 'add') {
        return addCartItem(accessToken, customerId, action.coffeeId);
      }

      // Refresh before using an absolute quantity.
      const currentCart = await queryClient.fetchQuery({
        queryKey,
        queryFn: loadCart,
        staleTime: 0,
      });

      const currentItem = currentCart.items.find(item => item.coffeeId === action.coffeeId);

      if (!currentItem) {
        return currentCart;
      }

      if (currentItem.quantity === 1) {
        return removeCartItem(accessToken, customerId, currentItem.id);
      }

      return updateCartItem(accessToken, customerId, currentItem.id, currentItem.quantity - 1);
    },

    onSuccess: cart => {
      queryClient.setQueryData<Cart>(queryKey, cart);
      notifyCartChanged(cart.customerId);
    },
  });

  const pendingMutations = useIsMutating({ mutationKey });

  async function runAction(action: CartAction) {
    // Check the shared mutation cache, not only this card's state.
    if (queryClient.isMutating({ mutationKey }) > 0) {
      return;
    }

    return mutation.mutateAsync(action);
  }

  return {
    cart: enabled ? cartQuery.data : undefined,

    isLoading: authLoading || (enabled && cartQuery.isPending),

    isUpdating: pendingMutations > 0,

    error: enabled ? (mutation.error ?? cartQuery.error) : null,

    addCoffee: (coffeeId: string) => runAction({ type: 'add', coffeeId }),

    decreaseCoffee: (coffeeId: string) => runAction({ type: 'decrease', coffeeId }),
  };
}
