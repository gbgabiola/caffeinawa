import { describe, expect, it } from 'vitest';

import { CustomerEntity } from './customer.entity.js';

describe('CustomerEntity response serialization', () => {
  it('includes only public customer fields from a database record', () => {
    const record = {
      id: 'customer-1',
      name: 'Test Customer',
      email: 'customer@example.com',
      passwordHash: 'sensitive-password-hash',
      role: 'CUSTOMER',
    };

    const response = JSON.parse(JSON.stringify(new CustomerEntity(record)));

    expect(response).toEqual({
      id: record.id,
      name: record.name,
      email: record.email,
    });

    expect(response).not.toHaveProperty('passwordHash');
  });

  it('excludes future database fields unless explicitly exposed', () => {
    const record = {
      id: 'customer-1',
      name: 'Test Customer',
      email: 'customer@example.com',
      internalNotes: 'Private account information',
      passwordResetToken: 'sensitive-reset-token',
    };

    expect(Object.keys(new CustomerEntity(record)).sort()).toEqual([
      'email',
      'id',
      'name',
    ]);
  });
});
