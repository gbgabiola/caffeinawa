import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { assertTestDatabaseEnvironment } from './database-environment.js';

const testUrl =
  'postgresql://guard:sentinel-secret@127.0.0.1:1/caffeinawa_test';
const normalUrl = 'postgresql://guard:sentinel-secret@127.0.0.1:1/caffeinawa';
const equalityError =
  'Database E2E tests require DATABASE_URL to exactly equal TEST_DATABASE_URL.';
const databaseError =
  'Database E2E tests require a valid PostgreSQL URL with a database name containing test.';

function matched(url: string): NodeJS.ProcessEnv {
  return { DATABASE_URL: url, TEST_DATABASE_URL: url };
}

function expectSafeFailure(env: NodeJS.ProcessEnv) {
  expect(() => assertTestDatabaseEnvironment(env)).toThrow();
  try {
    assertTestDatabaseEnvironment(env);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect([equalityError, databaseError]).toContain(message);
    expect(message).not.toContain('sentinel-secret');
    for (const value of [env.DATABASE_URL, env.TEST_DATABASE_URL]) {
      if (value) expect(message).not.toContain(value);
    }
  }
}

describe('E2E database environment guard', () => {
  it.each([
    testUrl,
    'postgres://guard@localhost/caffeinawa_test?schema=public',
    'postgresql://guard@localhost/caffeinawa_%54EST',
    'postgresql://guard@remote.example.test/caffeinawa_test',
  ])('accepts an explicitly selected test database %#', (url) => {
    expect(() => assertTestDatabaseEnvironment(matched(url))).not.toThrow();
  });

  const unsafe: Array<[string, NodeJS.ProcessEnv]> = [
    ['missing URLs', {}],
    ['missing DATABASE_URL', { TEST_DATABASE_URL: testUrl }],
    ['missing TEST_DATABASE_URL', { DATABASE_URL: testUrl }],
    ['empty URLs', matched('')],
    [
      'normal database selection',
      { DATABASE_URL: normalUrl, TEST_DATABASE_URL: testUrl },
    ],
    [
      'different credentials',
      {
        DATABASE_URL: testUrl,
        TEST_DATABASE_URL: testUrl.replace('guard:', 'other:'),
      },
    ],
    [
      'equivalent but unequal URL strings',
      {
        DATABASE_URL: testUrl,
        TEST_DATABASE_URL: testUrl.replace('_test', '_%74est'),
      },
    ],
    [
      'different query strings',
      { DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl + '?schema=public' },
    ],
    ['matched normal database', matched(normalUrl)],
    [
      'malformed URL',
      matched('postgresql://guard:sentinel-secret@ invalid/caffeinawa_test'),
    ],
    [
      'non-PostgreSQL protocol',
      matched('https://guard:sentinel-secret@localhost/caffeinawa_test'),
    ],
    ['missing host', matched('postgresql:///caffeinawa_test')],
    [
      'missing database name',
      matched('postgresql://test:sentinel-secret@test-host/'),
    ],
    [
      'test only in other URL components',
      matched(
        'postgresql://test:sentinel-secret@test-host/caffeinawa?schema=test',
      ),
    ],
    [
      'malformed database encoding',
      matched(
        'postgresql://guard:sentinel-secret@localhost/caffeinawa_%ZZtest',
      ),
    ],
  ];
  it.each(unsafe)('rejects %s without exposing URL values', (_name, env) => {
    expectSafeFailure(env);
  });

  it('never rewrites the selected database or other environment values', () => {
    const env = Object.freeze({
      DATABASE_URL: normalUrl,
      TEST_DATABASE_URL: testUrl,
      OTHER_SETTING: 'unchanged',
    });
    expectSafeFailure(env);
    expect(env).toEqual({
      DATABASE_URL: normalUrl,
      TEST_DATABASE_URL: testUrl,
      OTHER_SETTING: 'unchanged',
    });
    const valid = Object.freeze(matched(testUrl));
    assertTestDatabaseEnvironment(valid);
    expect(valid).toEqual(matched(testUrl));
  });

  it.each([
    [
      'unscoped normal URL',
      { DATABASE_URL: normalUrl, TEST_DATABASE_URL: testUrl },
      equalityError,
    ],
    ['matched non-test URL', matched(normalUrl), databaseError],
    [
      'malformed matched URL',
      matched('not-a-url-sentinel-secret'),
      databaseError,
    ],
  ] as const)(
    'rejects %s at the actual Vitest configuration boundary',
    (_name, env, message) => {
      // `list` does not run suite hooks. These loopback port-1 URLs must never be
      // contacted; configuration must reject them before any suite is collected.
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')),
          ),
          'list',
          '--config',
          './vitest.config.e2e.ts',
        ],
        {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: { ...process.env, ...env },
          encoding: 'utf8',
          timeout: 15000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(result.stderr + result.stdout).not.toContain('sentinel-secret');
      expect(result.stdout).not.toContain('Authentication flow');
    },
    20000,
  );
});
