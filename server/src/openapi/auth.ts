import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { ErrorCode } from '../lib/http.ts';
import {
  ForgotPasswordBody,
  LoginBody,
  RefreshBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '../schemas/auth.ts';
import {
  LoginResponse,
  TokenPairResponse,
  UserResponse,
} from '../schemas/responses.ts';
import {
  bearer,
  error,
  errorCase,
  isPublic,
  json,
  jsonBody,
  noContent,
  unauthorized,
  VALIDATION_CASE,
  validationError,
} from './helpers.ts';

// Docs for routes/auth.ts. Request bodies = the SAME Zod schemas the
// routes parse with, so docs and validation can't disagree.

const tags = ['Auth'];
const INVALID_CODE = errorCase(
  ErrorCode.INVALID_CODE,
  'Invalid or expired code',
);
const invalidCode = error(
  'Bad format, or wrong / expired / used code (one message for all)',
  VALIDATION_CASE,
  INVALID_CODE,
);
const invalidRefresh = error(
  'Unknown, expired, revoked or reused refresh token: log the user out',
  errorCase(ErrorCode.INVALID_REFRESH_TOKEN, 'Invalid refresh token'),
);

export const authPaths: ZodOpenApiPathsObject = {
  '/api/v1/auth/register': {
    post: {
      tags,
      summary: 'Create an account',
      description:
        'Emails a 6-digit verification code. The user can log in right ' +
        'away; `emailVerifiedAt` stays null until verified.',
      security: isPublic,
      requestBody: jsonBody(RegisterBody),
      responses: {
        201: json('Created', UserResponse),
        400: validationError,
        409: error(
          'An account with this email exists',
          errorCase(ErrorCode.EMAIL_IN_USE, 'Email already in use'),
        ),
      },
    },
  },
  '/api/v1/auth/login': {
    post: {
      tags,
      summary: 'Log in: returns the user and a token pair',
      description:
        'Store both tokens in secure storage. Send `accessToken` (15 min) ' +
        'on every request; use `refreshToken` (30 days) only with ' +
        '/auth/refresh and /auth/logout.',
      security: isPublic,
      requestBody: jsonBody(LoginBody),
      responses: {
        200: json('Logged in', LoginResponse),
        400: validationError,
        401: error(
          'Wrong email or password (never says which)',
          errorCase(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password'),
        ),
        403: error(
          'Correct password, but an admin disabled the account',
          errorCase(ErrorCode.ACCOUNT_DISABLED, 'Account disabled'),
        ),
      },
    },
  },
  '/api/v1/auth/refresh': {
    post: {
      tags,
      summary: 'Trade a refresh token for a new pair (old one dies)',
      description:
        'Single use. Reusing an old refresh token revokes the whole login. ' +
        'Send only one refresh at a time.',
      security: isPublic,
      requestBody: jsonBody(RefreshBody),
      responses: {
        200: json('New token pair', TokenPairResponse),
        400: validationError,
        401: invalidRefresh,
      },
    },
  },
  '/api/v1/auth/logout': {
    post: {
      tags,
      summary: 'Log out this device (always 204)',
      security: isPublic,
      requestBody: jsonBody(RefreshBody),
      responses: { 204: noContent, 400: validationError },
    },
  },
  '/api/v1/auth/logout-all': {
    post: {
      tags,
      summary: 'Log out every device',
      security: bearer,
      responses: { 204: noContent, 401: unauthorized },
    },
  },
  '/api/v1/auth/verify-email': {
    post: {
      tags,
      summary: 'Verify the email with the 6-digit code',
      security: bearer,
      requestBody: jsonBody(VerifyEmailBody),
      responses: {
        204: noContent,
        400: invalidCode,
        401: unauthorized,
      },
    },
  },
  '/api/v1/auth/resend-verification': {
    post: {
      tags,
      summary: 'Email a new verification code (old one dies)',
      security: bearer,
      responses: {
        204: noContent,
        401: unauthorized,
        503: error(
          'Email provider failed: try again later',
          errorCase(
            ErrorCode.EMAIL_SEND_FAILED,
            'Could not send email, try again later',
          ),
        ),
      },
    },
  },
  '/api/v1/auth/forgot-password': {
    post: {
      tags,
      summary: 'Email a reset code if the account exists (always 204)',
      security: isPublic,
      requestBody: jsonBody(ForgotPasswordBody),
      responses: { 204: noContent, 400: validationError },
    },
  },
  '/api/v1/auth/reset-password': {
    post: {
      tags,
      summary: 'Set a new password with the emailed code',
      description: 'Logs out every device. The user then logs in again.',
      security: isPublic,
      requestBody: jsonBody(ResetPasswordBody),
      responses: { 204: noContent, 400: invalidCode },
    },
  },
};
