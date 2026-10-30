import { describe, expect, it } from 'vitest';

import { isPayMongoEnabled, validateEnvironment } from './environment.js';

function makeEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    JWT_SECRET: 'test-jwt-secret',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/caffeinawa_test',
    WEB_URL: 'http://localhost:3000',
    PAYMONGO_ENABLED: 'false',
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('allows cash-only configuration without PayMongo secrets', () => {
    expect(() => validateEnvironment(makeEnvironment())).not.toThrow();
  });

  it('defaults PayMongo to disabled', () => {
    expect(isPayMongoEnabled({})).toBe(false);
  });

  it.each(['JWT_SECRET', 'DATABASE_URL', 'WEB_URL'])(
    'rejects missing %s',
    (name) => {
      expect(() =>
        validateEnvironment(makeEnvironment({ [name]: undefined })),
      ).toThrow(`${name} is required`);
    },
  );

  it.each([
    { DATABASE_URL: 'https://example.com' },
    { WEB_URL: 'not-a-url' },
    { WEB_URL: 'https://example.com/store' },
    { WEB_URL: 'https://example.com?preview=true' },
    { PAYMONGO_ENABLED: 'yes' },
    { PAYMONGO_MODE: 'production' },
    { PORT: '0' },
    { PORT: '65536' },
    { PORT: '3001.5' },
    { PORT: '' },
  ])('rejects invalid configuration: %o', (overrides) => {
    expect(() => validateEnvironment(makeEnvironment(overrides))).toThrow(
      'Invalid API configuration',
    );
  });

  it.each(['PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET', 'PAYMONGO_MODE'])(
    'requires %s when PayMongo is enabled',
    (name) => {
      const env = makeEnvironment({
        PAYMONGO_ENABLED: 'true',
        PAYMONGO_SECRET_KEY: 'test-provider-key',
        PAYMONGO_WEBHOOK_SECRET: 'test-webhook-secret',
        PAYMONGO_MODE: 'test',
        [name]: undefined,
      });

      expect(() => validateEnvironment(env)).toThrow(`${name} is required`);
    },
  );

  it('accepts complete PayMongo configuration', () => {
    expect(() =>
      validateEnvironment(
        makeEnvironment({
          PAYMONGO_ENABLED: 'true',
          PAYMONGO_SECRET_KEY: 'test-provider-key',
          PAYMONGO_WEBHOOK_SECRET: 'test-webhook-secret',
          PAYMONGO_MODE: 'test',
        }),
      ),
    ).not.toThrow();
  });

  it('does not expose invalid values in validation errors', () => {
    const sensitiveValue = 'private-database-connection-value';

    try {
      validateEnvironment(makeEnvironment({ DATABASE_URL: sensitiveValue }));
      throw new Error('Expected validation to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).not.toContain(sensitiveValue);
    }
  });
});
