/** Fail before Vitest loads database-backed suites. Never retarget a URL here. */
export function assertTestDatabaseEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || databaseUrl !== env.TEST_DATABASE_URL) {
    throw new Error(
      'Database E2E tests require DATABASE_URL to exactly equal TEST_DATABASE_URL.',
    );
  }

  // URL/parser errors may contain credentials. Report only a fixed safe message.
  let valid = false;
  try {
    const url = new URL(databaseUrl);
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    valid =
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      databaseName.toLowerCase().includes('test');
  } catch {
    // Malformed URLs and percent escapes fail closed below.
  }
  if (!valid) {
    throw new Error(
      'Database E2E tests require a valid PostgreSQL URL with a database name containing test.',
    );
  }
}
