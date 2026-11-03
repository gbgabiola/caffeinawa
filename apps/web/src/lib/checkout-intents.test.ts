import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readCheckoutIntent,
  getOrCreateCheckoutIntent,
  markCheckoutResolved,
  clearCheckoutIntent,
  clearResolvedCheckout,
} from './checkout-intents';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

describe('Durable checkout progress', () => {
  it('atomically creates one request across concurrent tabs', async () => {
    const results = await Promise.all([
      getOrCreateCheckoutIntent('customer', 'cash', 1),
      getOrCreateCheckoutIntent('customer', 'paymongo', 2),
    ]);
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(results[0]!.intent).toEqual(results[1]!.intent);
    expect(await readCheckoutIntent('customer')).toEqual(results[0]!.intent);
  });

  it('keeps the original payload across reloads and cart changes', async () => {
    const first = await getOrCreateCheckoutIntent('customer', 'cash', 1);
    const reloaded = await getOrCreateCheckoutIntent('customer', 'paymongo', 99);
    expect(reloaded).toEqual({ intent: first.intent, created: false });
  });

  it('isolates customers', async () => {
    const first = await getOrCreateCheckoutIntent('one', 'cash', 1);
    const second = await getOrCreateCheckoutIntent('two', 'cash', 1);
    expect(first.intent.idempotencyKey).not.toBe(second.intent.idempotencyKey);
    expect(await readCheckoutIntent('one')).toEqual(first.intent);
  });

  it('retains resolved references until the matching order is displayed', async () => {
    const { intent } = await getOrCreateCheckoutIntent('customer', 'cash', 1);
    await markCheckoutResolved(intent, 'order');
    await clearResolvedCheckout('customer', 'different-order');
    expect(await readCheckoutIntent('customer')).toEqual({ ...intent, resolvedOrderId: 'order' });
    await clearResolvedCheckout('customer', 'order');
    expect(await readCheckoutIntent('customer')).toBeNull();
  });

  it('does not let stale completion or cleanup overwrite a newer request', async () => {
    const first = await getOrCreateCheckoutIntent('customer', 'cash', 1);
    await clearCheckoutIntent(first.intent);
    const second = await getOrCreateCheckoutIntent('customer', 'cash', 2);
    await markCheckoutResolved(first.intent, 'old-order');
    await clearCheckoutIntent(first.intent);
    expect(await readCheckoutIntent('customer')).toEqual(second.intent);
  });

  it('fails closed when storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(getOrCreateCheckoutIntent('customer', 'cash', 1)).rejects.toThrow('Allow site storage');
    await expect(readCheckoutIntent('customer')).rejects.toThrow('Allow site storage');
  });

  it('does not silently replace corrupt saved progress', async () => {
    await getOrCreateCheckoutIntent('customer', 'cash', 1);
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open('caffeinawa-checkout', 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction('intents', 'readwrite');
        tx.objectStore('intents').put({ customerId: 'customer', idempotencyKey: 'broken' });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect(getOrCreateCheckoutIntent('customer', 'cash', 2)).rejects.toThrow('Check your orders');
    await expect(readCheckoutIntent('customer')).rejects.toThrow('Check your orders');
  });
});
