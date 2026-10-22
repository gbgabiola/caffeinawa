const DEFAULT_RETURN_PATH = '/menu';
const PARSING_ORIGIN = 'https://caffeinawa.invalid';

export function getSafeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_RETURN_PATH;
  }

  try {
    const url = new URL(value, PARSING_ORIGIN);

    if (url.origin !== PARSING_ORIGIN) {
      return DEFAULT_RETURN_PATH;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const normalizedPath = decodedPath.replace(/\/+$/, '') || '/';

    if (
      decodedPath.startsWith('//') ||
      decodedPath.includes('\\') ||
      normalizedPath === '/login' ||
      normalizedPath === '/register'
    ) {
      return DEFAULT_RETURN_PATH;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}
