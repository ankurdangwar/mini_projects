export const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const SERVER_API_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, message: string, code = 'API_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${PUBLIC_API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      data?.error?.message || `Request failed (${res.status})`,
      data?.error?.code || 'API_ERROR'
    );
  }

  return data as T;
}

export async function serverFetch<T>(path: string): Promise<T> {
  const url = `${SERVER_API_URL}${path}`;
  const res = await fetch(url, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`SSR fetch failed for ${path}: ${res.status}`);
  }
  return (await res.json()) as T;
}
