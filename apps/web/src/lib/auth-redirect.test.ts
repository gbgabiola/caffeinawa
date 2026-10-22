import { describe, expect, it } from 'vitest';

import { getSafeReturnPath } from './auth-redirect';

describe('getSafeReturnPath', () => {
  it.each([
    undefined,
    null,
    '',
    'https://example.com',
    '//example.com',
    '/\\example.com',
    'javascript:alert(1)',
    '/login',
    '/login?next=/cart',
    '/register/',
    '/%6cogin',
    '/%2Fexample.com',
    '/%E0%A4%A',
  ])('uses the menu fallback for %s', value => {
    expect(getSafeReturnPath(value)).toBe('/menu');
  });

  it.each([
    '/',
    '/menu',
    '/cart',
    '/checkout',
    '/account',
    '/admin/payments/reconciliation',
    '/checkout/success?orderId=order%2F1#details',
  ])('preserves the internal destination %s', value => {
    expect(getSafeReturnPath(value)).toBe(value);
  });
});
