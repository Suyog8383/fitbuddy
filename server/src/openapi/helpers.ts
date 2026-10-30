import { z } from 'zod';
import { ErrorCode } from '../lib/http.ts';
import { ErrorResponse } from '../schemas/responses.ts';

// Small builders so each path file reads like a table of the API.

export const jsonBody = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema } },
});

export const json = (description: string, schema: z.ZodType) => ({
  description,
  content: { 'application/json': { schema } },
});

export const noContent = { description: 'Success, no body' };

// One possible error body: [code, message], plus details for validation.
type ErrorCase = {
  error: string;
  code: ErrorCode;
  details?: { path: string; message: string }[];
};

export const errorCase = (code: ErrorCode, message: string): ErrorCase => ({
  error: message,
  code,
});

export const VALIDATION_CASE: ErrorCase = {
  error: 'Invalid request',
  code: ErrorCode.VALIDATION_FAILED,
  details: [{ path: 'email', message: 'Invalid email address' }],
};

// Error response with a REAL example per case (Swagger would otherwise
// show `"error": "string"`). Several cases for one status -> a dropdown
// of named examples in Swagger UI.
export function error(description: string, ...cases: ErrorCase[]) {
  const media =
    cases.length === 1
      ? { schema: ErrorResponse, example: cases[0] }
      : {
          schema: ErrorResponse,
          examples: Object.fromEntries(
            cases.map((c) => [c.code, { summary: c.error, value: c }]),
          ),
        };
  return { description, content: { 'application/json': media } };
}

// Common ones, reused everywhere.
export const validationError = error(
  'Invalid request: `details` lists every bad field',
  VALIDATION_CASE,
);
export const unauthorized = error(
  'Missing, invalid or expired access token: refresh, or log in again',
  errorCase(ErrorCode.UNAUTHORIZED, 'Unauthorized'),
);
export const forbidden = error(
  'Logged in, but not an admin (or account disabled)',
  errorCase(ErrorCode.FORBIDDEN, 'Forbidden'),
);

// `security` per operation: bearer = needs `Authorization: Bearer <token>`,
// [] = public (says "no auth" explicitly).
export const bearer = [{ bearerAuth: [] }];
export const isPublic = [];

// /{id} path parameter. Express writes it /:id, OpenAPI writes /{id}.
export const idParam = { path: z.object({ id: z.uuid() }) };
