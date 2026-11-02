import createClient from 'openapi-fetch';

import { config } from '@/config';

import { ApiError, errorFromResponse } from './errors';
import type { paths } from './schema';

// Adds a timeout to every request. fetch has none by default; on a bad
// mobile network a request could hang forever.
// (In SDK 57 the global fetch on iOS/Android is expo/fetch.)
async function fetchWithTimeout(request: Request): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } catch {
    // fetch throws only when there's NO response: aborted (our timeout)
    // or the network failed. HTTP errors (4xx/5xx) don't throw.
    if (controller.signal.aborted) {
      throw new ApiError('TIMEOUT', 'The server took too long to answer');
    }
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server', null);
  } finally {
    clearTimeout(timer);
  }
}

// Typed client: paths, bodies and responses come from schema.d.ts
// (generated from the server's /openapi.json). A wrong path or body
// shape is a compile error.
export const api = createClient<paths>({
  baseUrl: config.apiUrl,
  fetch: fetchWithTimeout,
});

// openapi-fetch returns { data, error, response } and does NOT throw on
// 4xx/5xx. `unwrap` turns that into: data on success, ApiError otherwise —
// the shape React Query (5B) expects.
//   const me = await unwrap(api.GET('/api/v1/users/me'));
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;

  if (!response.ok) throw errorFromResponse(response.status, error);

  // 204 No Content -> data is undefined, and T is `undefined` too.
  return data as T;
}
