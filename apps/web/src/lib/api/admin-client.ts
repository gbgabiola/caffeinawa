const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function parseErrorMessage(status: number, body: string): string {
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
        const message = parsed.message;
        if (typeof message === 'string') return message;
        if (Array.isArray(message) && message.every(item => typeof item === 'string')) {
          return message.join(', ');
        }
      }
    } catch {
      // Use the status-specific fallback below.
    }
  }
  if (status === 401) return 'Authentication required.';
  if (status === 403) return 'Administrator access required.';
  return `Request failed with status ${status}.`;
}

export interface AdminListQuery {
  page: number;
  pageSize: number;
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

export function buildQueryString(query: AdminListQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export async function adminRequest<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    cache: 'no-store',
  });
  const body = await response.text();
  if (!response.ok) {
    throw new ApiError(parseErrorMessage(response.status, body), response.status);
  }
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}
