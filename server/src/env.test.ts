import { describe, expect, it } from 'vitest';
import { EnvSchema } from './env.ts';

// Test the schema with fake input objects, not the real `env` export:
// importing env.ts parses the real process.env (and exits on failure).

// Required vars (no default). Spread into every input: { ...BASE, PORT: '3000' }
const BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('EnvSchema', () => {
  it('coerces PORT to a number', () => {
    const result = EnvSchema.safeParse({ ...BASE, PORT: '3000' });

    expect(result.success).toBe(true);
    expect(result.data?.PORT).toBe(3000);
  });

  it('applies defaults when only required vars are set', () => {
    const result = EnvSchema.safeParse(BASE);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      ...BASE,
      NODE_ENV: 'development',
      PORT: 3000,
      APP_NAME: 'FitBuddy',
      EMAIL_FROM: 'FitBuddy <onboarding@resend.dev>',
    });
  });

  it('accepts production with RESEND_API_KEY set', () => {
    const result = EnvSchema.safeParse({
      ...BASE,
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_test_key',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid LOG_LEVEL', () => {
    const result = EnvSchema.safeParse({ ...BASE, LOG_LEVEL: 'debug' });

    expect(result.success).toBe(true);
    expect(result.data?.LOG_LEVEL).toBe('debug');
  });

  it.each([
    ['PORT not a number', { ...BASE, PORT: 'abc' }],
    ['PORT above max', { ...BASE, PORT: '70000' }],
    ['NODE_ENV not allowed', { ...BASE, NODE_ENV: 'prod' }],
    ['LOG_LEVEL not allowed', { ...BASE, LOG_LEVEL: 'loud' }],
    ['DATABASE_URL missing', { ...BASE, DATABASE_URL: undefined }],
    [
      'DATABASE_URL not postgres',
      { ...BASE, DATABASE_URL: 'mysql://u:p@localhost/db' },
    ],
    ['DATABASE_URL not a URL', { ...BASE, DATABASE_URL: 'not-a-url' }],
    ['JWT_SECRET missing', { ...BASE, JWT_SECRET: undefined }],
    ['JWT_SECRET too short', { ...BASE, JWT_SECRET: 'change-me' }],
    ['production without RESEND_API_KEY', { ...BASE, NODE_ENV: 'production' }],
    ['RESEND_API_KEY empty', { ...BASE, RESEND_API_KEY: '' }],
  ])('fails when %s', (_label, input) => {
    expect(EnvSchema.safeParse(input).success).toBe(false);
  });
});
