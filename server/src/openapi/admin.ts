import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { ErrorCode } from '../lib/http.ts';
import { AdminUserResponse, StatsResponse } from '../schemas/responses.ts';
import { AdminUpdateUserBody, AdminUsersQuery } from '../schemas/users.ts';
import {
  bearer,
  error,
  errorCase,
  forbidden,
  idParam,
  json,
  jsonBody,
  unauthorized,
  VALIDATION_CASE,
  validationError,
} from './helpers.ts';

// Docs for routes/admin.ts. Every operation: ADMIN role, checked in the
// DB on each request (401 = bad token, 403 = not an admin).

const tags = ['Admin'];
const userNotFound = error(
  'No user with this id',
  errorCase(ErrorCode.USER_NOT_FOUND, 'User not found'),
);

export const adminPaths: ZodOpenApiPathsObject = {
  '/api/v1/admin/users': {
    get: {
      tags,
      summary: 'Users, newest first (max 50)',
      security: bearer,
      requestParams: { query: AdminUsersQuery },
      responses: {
        200: json('List', z.array(AdminUserResponse)),
        400: validationError,
        401: unauthorized,
        403: forbidden,
      },
    },
  },
  '/api/v1/admin/users/{id}': {
    get: {
      tags,
      summary: 'One user (account fields only)',
      security: bearer,
      requestParams: idParam,
      responses: {
        200: json('User', AdminUserResponse),
        401: unauthorized,
        403: forbidden,
        404: userNotFound,
      },
    },
    patch: {
      tags,
      summary: 'Change role and/or disable a user',
      description:
        'Disabling logs the user out everywhere and blocks login. ' +
        'Admins cannot change their own account (400).',
      security: bearer,
      requestParams: idParam,
      requestBody: jsonBody(AdminUpdateUserBody),
      responses: {
        200: json('Updated', AdminUserResponse),
        400: error(
          'Invalid request, or trying to change your own account',
          VALIDATION_CASE,
          errorCase(
            ErrorCode.CANNOT_CHANGE_OWN_ACCOUNT,
            "You can't change your own account here",
          ),
        ),
        401: unauthorized,
        403: forbidden,
        404: userNotFound,
      },
    },
  },
  '/api/v1/admin/stats': {
    get: {
      tags,
      summary: 'Counts for the admin dashboard',
      security: bearer,
      responses: {
        200: json('Stats', StatsResponse),
        401: unauthorized,
        403: forbidden,
      },
    },
  },
};
