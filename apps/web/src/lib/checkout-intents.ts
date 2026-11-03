import type { CheckoutRequestInput, PaymentProvider } from '@caffeinawa/types';

export interface CheckoutIntent extends CheckoutRequestInput {
  customerId: string;
  resolvedOrderId?: string;
}

const STORE = 'intents';
const storageError = () =>
  new Error(
    'Your browser could not save checkout progress. Allow site storage and try again. Check your orders before placing another order.',
  );

function valid(value: unknown, customerId: string): value is CheckoutIntent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CheckoutIntent>;
  return (
    record.customerId === customerId &&
    typeof record.idempotencyKey === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.idempotencyKey) &&
    Number.isInteger(record.cartRevision) &&
    (record.cartRevision ?? -1) >= 0 &&
    (record.cartRevision ?? Infinity) <= 2147483647 &&
    (record.paymentProvider === 'cash' || record.paymentProvider === 'paymongo') &&
    (record.resolvedOrderId === undefined ||
      (typeof record.resolvedOrderId === 'string' && record.resolvedOrderId.length > 0))
  );
}

// A read/write transaction serializes intent creation across tabs. Resolve only
// on commit: an individual put's success is not evidence the record persisted.
function transaction<T>(
  customerId: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, previous: CheckoutIntent | null, result: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let opening: IDBOpenDBRequest;
    try {
      opening = indexedDB.open('caffeinawa-checkout', 1);
    } catch {
      reject(storageError());
      return;
    }
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: 'customerId' });
    opening.onerror = () => reject(storageError());
    let blocked = false;
    opening.onblocked = () => {
      blocked = true;
      reject(storageError());
    };
    opening.onsuccess = () => {
      const db = opening.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE, mode, { durability: 'strict' });
      } catch {
        db.close();
        reject(storageError());
        return;
      }
      let result: T;
      let failure: Error | undefined;
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(failure ?? storageError());
      };
      const store = tx.objectStore(STORE);
      const read = store.get(customerId);
      read.onsuccess = () => {
        try {
          if (read.result !== undefined && !valid(read.result, customerId)) {
            throw new Error(
              'Saved checkout progress could not be read. Check your orders and contact the store before placing another order.',
            );
          }
          action(store, read.result ?? null, value => {
            result = value;
          });
        } catch (error) {
          failure = error instanceof Error ? error : storageError();
          tx.abort();
        }
      };
    };
  });
}

export function readCheckoutIntent(customerId: string): Promise<CheckoutIntent | null> {
  return transaction(customerId, 'readonly', (_store, previous, result) => result(previous));
}

export function getOrCreateCheckoutIntent(
  customerId: string,
  paymentProvider: PaymentProvider,
  cartRevision: number,
): Promise<{ intent: CheckoutIntent; created: boolean }> {
  return transaction(customerId, 'readwrite', (store, previous, result) => {
    if (previous) {
      result({ intent: previous, created: false });
      return;
    }
    const intent: CheckoutIntent = {
      customerId,
      paymentProvider,
      cartRevision,
      idempotencyKey: crypto.randomUUID(),
    };
    if (!valid(intent, customerId)) throw storageError();
    store.add(intent);
    result({ intent, created: true });
  });
}

export function markCheckoutResolved(intent: CheckoutIntent, orderId: string): Promise<void> {
  return transaction(intent.customerId, 'readwrite', (store, previous, result) => {
    if (previous?.idempotencyKey === intent.idempotencyKey)
      store.put({ ...previous, resolvedOrderId: orderId });
    result(undefined);
  });
}

export function clearCheckoutIntent(intent: CheckoutIntent): Promise<void> {
  return transaction(intent.customerId, 'readwrite', (store, previous, result) => {
    if (previous?.idempotencyKey === intent.idempotencyKey) store.delete(intent.customerId);
    result(undefined);
  });
}

export function clearResolvedCheckout(customerId: string, orderId: string): Promise<void> {
  return transaction(customerId, 'readwrite', (store, previous, result) => {
    if (previous?.resolvedOrderId === orderId) store.delete(customerId);
    result(undefined);
  });
}
