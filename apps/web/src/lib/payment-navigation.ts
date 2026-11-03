export function validatedPayMongoUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value)
    throw new Error('Unable to verify payment checkout.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'checkout.paymongo.com' ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Unable to verify payment checkout.');
  return value;
}

export function redirectToPayMongo(url: string): void {
  window.location.assign(validatedPayMongoUrl(url));
}
