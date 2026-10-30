import { describe, expect, it } from 'vitest';
import { EnvSchema } from './env.ts';

// Test the schema with fake input objects, not the real `env` export:
// importing env.ts parses the real process.env (and exits on failure).

describe('EnvSchema', () => {
  it('coerces PORT to a number', () => {
    const result = EnvSchema.safeParse({ PORT: '3000' });

    expect(result.success).toBe(true);
    expect(result.data?.PORT).toBe(3000);
  });

  it('applies defaults when nothing is set', () => {
    const result = EnvSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_NAME: 'FitBuddy',
    });
  });

  it('accepts a valid LOG_LEVEL', () => {
    const result = EnvSchema.safeParse({ LOG_LEVEL: 'debug' });

    expect(result.success).toBe(true);
    expect(result.data?.LOG_LEVEL).toBe('debug');
  });

  it.each([
    ['PORT not a number', { PORT: 'abc' }],
    ['PORT above max', { PORT: '70000' }],
    ['NODE_ENV not allowed', { NODE_ENV: 'prod' }],
    ['LOG_LEVEL not allowed', { LOG_LEVEL: 'loud' }],
  ])('fails when %s', (_label, input) => {
    expect(EnvSchema.safeParse(input).success).toBe(false);
  });
});
