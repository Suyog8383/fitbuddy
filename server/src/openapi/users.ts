import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { ErrorCode } from '../lib/http.ts';
import { TokenPairResponse, UserResponse } from '../schemas/responses.ts';
import { ChangePasswordBody, UpdateMeBody } from '../schemas/users.ts';
import {
  bearer,
  error,
  errorCase,
  json,
  jsonBody,
  noContent,
  unauthorized,
  VALIDATION_CASE,
  validationError,
} from './helpers.ts';

// Docs for routes/users.ts. Everything here is "me": the user comes from
// the access token, never from the URL.

const tags = ['Users'];

export const usersPaths: ZodOpenApiPathsObject = {
  '/api/v1/users/me': {
    get: {
      tags,
      summary: 'The logged-in user, with profile (null until first set)',
      security: bearer,
      responses: { 200: json('Me', UserResponse), 401: unauthorized },
    },
    patch: {
      tags,
      summary: 'Update name and/or profile fields',
      description:
        'Only sent fields change. Absent = keep, `null` = clear ' +
        '(not allowed for `name` and `units`).',
      security: bearer,
      requestBody: jsonBody(UpdateMeBody),
      responses: {
        200: json('Updated', UserResponse),
        400: validationError,
        401: unauthorized,
      },
    },
    delete: {
      tags,
      summary: 'Delete my account and all its data (cannot be undone)',
      security: bearer,
      responses: { 204: noContent, 401: unauthorized },
    },
  },
  '/api/v1/users/me/password': {
    post: {
      tags,
      summary: 'Change password (needs the current one)',
      description:
        'Logs out every other device; returns a new token pair for this one.',
      security: bearer,
      requestBody: jsonBody(ChangePasswordBody),
      responses: {
        200: json('Changed: store the new tokens', TokenPairResponse),
        400: error(
          'Invalid request, or the current password is wrong (400, not ' +
            '401: a typo must not log the user out)',
          VALIDATION_CASE,
          errorCase(
            ErrorCode.CURRENT_PASSWORD_INCORRECT,
            'Current password is incorrect',
          ),
        ),
        401: unauthorized,
      },
    },
  },
};
