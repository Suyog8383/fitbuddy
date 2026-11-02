import type { components } from './schema';

// Error codes the server can send — generated from its OpenAPI spec, so a
// new server code shows up here after `npm run api:types`.
export type ServerErrorCode = components['schemas']['Error']['code'];

// Plus the ones only the app can see (no usable response from the server).
export type ApiErrorCode =
  | ServerErrorCode
  | 'NETWORK_ERROR' // offline, server down, wrong URL
  | 'TIMEOUT' // no answer within config.requestTimeoutMs
  | 'UNKNOWN'; // a response that isn't our error format (proxy HTML, ...)

export type FieldError = { path: string; message: string };

// The ONE error type screens deal with. Every failure — network, HTTP,
// garbage — becomes an ApiError. Screens switch on `code`, never on text.
export class ApiError extends Error {
  readonly status: number | null; // null = no response at all
  readonly code: ApiErrorCode;
  readonly details: FieldError[];

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number | null = null,
    details: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  // The message for one form field ('email' -> 'Invalid email address'),
  // from a VALIDATION_FAILED response. Undefined if that field is fine.
  fieldError(path: string): string | undefined {
    return this.details.find((d) => d.path === path)?.message;
  }
}

// Narrow `unknown` to our server error shape: { error, code, details? }.
function isServerError(
  body: unknown,
): body is components['schemas']['Error'] {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string' &&
    typeof (body as { code?: unknown }).code === 'string'
  );
}

// Response with status >= 400 -> ApiError.
export function errorFromResponse(status: number, body: unknown): ApiError {
  if (isServerError(body)) {
    return new ApiError(body.code, body.error, status, body.details ?? []);
  }
  return new ApiError('UNKNOWN', `Unexpected response (HTTP ${status})`, status);
}
