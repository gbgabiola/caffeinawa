import type { Cart, Order, Payment, PaymentProvider } from '@caffeinawa/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface PayMongoCheckoutResponse {
  order: Order;
  payment: Payment;
  checkoutUrl: string;
}

export type CartCheckoutResponse = Order | PayMongoCheckoutResponse;

function getErrorMessage(status: number, body: string): string {
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body);

      if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
        const message = parsed.message;

        if (typeof message === 'string') {
          return message;
        }

        if (Array.isArray(message) && message.every(item => typeof item === 'string')) {
          return message.join(', ');
        }
      }
    } catch {
      // Fall back to the status-specific message below.
    }
  }

  if (status === 401) {
    return 'Authentication required.';
  }

  if (status === 403) {
    return 'You are not authorized to access this cart.';
  }

  if (status === 404) {
    return 'Cart or item not found.';
  }

  return 'Unable to process the cart request.';
}

async function request<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    cache: 'no-store',
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status, body));
  }

  if (!body) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
}

export function getCart(accessToken: string, customerId: string): Promise<Cart> {
  return request<Cart>(accessToken, `/customers/${encodeURIComponent(customerId)}/cart`);
}

export function addCartItem(accessToken: string, customerId: string, coffeeId: string, quantity = 1): Promise<Cart> {
  return request<Cart>(accessToken, `/customers/${encodeURIComponent(customerId)}/cart/items`, {
    method: 'POST',
    body: JSON.stringify({
      coffeeId,
      quantity,
    }),
  });
}

export function updateCartItem(
  accessToken: string,
  customerId: string,
  itemId: string,
  quantity: number,
): Promise<Cart> {
  return request<Cart>(
    accessToken,
    `/customers/${encodeURIComponent(customerId)}/cart/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        quantity,
      }),
    },
  );
}

export function removeCartItem(accessToken: string, customerId: string, itemId: string): Promise<Cart> {
  return request<Cart>(
    accessToken,
    `/customers/${encodeURIComponent(customerId)}/cart/items/${encodeURIComponent(itemId)}`,
    {
      method: 'DELETE',
    },
  );
}

export function clearCart(accessToken: string, customerId: string): Promise<Cart> {
  return request<Cart>(accessToken, `/customers/${encodeURIComponent(customerId)}/cart`, {
    method: 'DELETE',
  });
}

export function checkoutCart(
  accessToken: string,
  customerId: string,
  paymentProvider: PaymentProvider,
): Promise<CartCheckoutResponse> {
  return request<CartCheckoutResponse>(accessToken, `/customers/${encodeURIComponent(customerId)}/cart/checkout`, {
    method: 'POST',
    body: JSON.stringify({
      paymentProvider,
    }),
  });
}

export function isPayMongoCheckoutResponse(response: CartCheckoutResponse): response is PayMongoCheckoutResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'checkoutUrl' in response &&
    typeof response.checkoutUrl === 'string'
  );
}
