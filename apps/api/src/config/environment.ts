export function isPayMongoEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PAYMONGO_ENABLED === 'true';
}

export function validateEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const errors: string[] = [];

  function requireValue(name: string): string | undefined {
    const value = env[name];

    if (!value?.trim()) {
      errors.push(`${name} is required`);
      return undefined;
    }

    return value;
  }

  function validateUrl(
    name: string,
    value: string | undefined,
    protocols: string[],
    originOnly = false,
  ) {
    if (!value) return;

    try {
      const url = new URL(value);

      if (!protocols.includes(url.protocol) || !url.hostname) {
        throw new Error();
      }

      if (
        originOnly &&
        (url.username ||
          url.password ||
          url.pathname !== '/' ||
          url.search ||
          url.hash)
      ) {
        throw new Error();
      }
    } catch {
      errors.push(`${name} must be a valid ${originOnly ? 'origin' : 'URL'}`);
    }
  }

  requireValue('JWT_SECRET');

  validateUrl('DATABASE_URL', requireValue('DATABASE_URL'), [
    'postgres:',
    'postgresql:',
  ]);

  validateUrl('WEB_URL', requireValue('WEB_URL'), ['http:', 'https:'], true);

  if (
    env.PAYMONGO_ENABLED !== undefined &&
    !['true', 'false'].includes(env.PAYMONGO_ENABLED)
  ) {
    errors.push('PAYMONGO_ENABLED must be true or false');
  }

  if (
    env.PAYMONGO_MODE !== undefined &&
    !['test', 'live'].includes(env.PAYMONGO_MODE)
  ) {
    errors.push('PAYMONGO_MODE must be test or live');
  }

  if (isPayMongoEnabled(env)) {
    requireValue('PAYMONGO_SECRET_KEY');
    requireValue('PAYMONGO_WEBHOOK_SECRET');
    requireValue('PAYMONGO_MODE');
  }

  if (env.PAYMONGO_API_URL !== undefined) {
    validateUrl(
      'PAYMONGO_API_URL',
      env.PAYMONGO_API_URL,
      ['http:', 'https:'],
      true,
    );

    if (!env.PAYMONGO_API_URL.trim()) {
      errors.push('PAYMONGO_API_URL cannot be empty');
    }
  }

  if (env.PORT !== undefined) {
    const port = Number(env.PORT);

    if (
      !/^\d+$/.test(env.PORT) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      errors.push('PORT must be an integer between 1 and 65535');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid API configuration:\n- ${errors.join('\n- ')}`);
  }
}
