export const CART_CHANGED_KEY = 'caffeinawa_cart_changed';

export function notifyCartChanged(customerId: string): void {
  try {
    window.localStorage.setItem(
      CART_CHANGED_KEY,
      JSON.stringify({
        customerId,
        eventId: window.crypto.randomUUID(),
      }),
    );
  } catch {
    // A notification failure must not turn a successful
    // server update into a failed cart action.
  }
}

export function isCartChangeForCustomer(event: Pick<StorageEvent, 'key' | 'newValue'>, customerId: string): boolean {
  if (event.key !== CART_CHANGED_KEY || event.newValue === null) {
    return false;
  }

  try {
    const payload: unknown = JSON.parse(event.newValue);

    return (
      typeof payload === 'object' && payload !== null && 'customerId' in payload && payload.customerId === customerId
    );
  } catch {
    return false;
  }
}
