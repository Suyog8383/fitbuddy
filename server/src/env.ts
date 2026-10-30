import { z } from 'zod';

// The shape our config must have. One place to see every env var the app uses.
// Exported so tests can check the rules without exiting the process.
export const EnvSchema = z.object({
  // Only the 3 standard values. Vitest sets 'test' automatically.
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // process.env values are strings -> coerce "3000" into 3000.
  // Safe, non-secret -> OK to have a default.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  APP_NAME: z.string().min(1).default('FitBuddy'),

  // Optional override. If unset, logger.ts picks a default per NODE_ENV.
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),

  // Secret -> NO default, so a missing one fails startup.
  // Must be a postgres:// or postgresql:// URL.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // Secrets later (Phase 3), same rule:
  // JWT_SECRET: z.string().min(32),
});

// TS type generated from the schema — never written by hand.
export type Env = z.infer<typeof EnvSchema>;

// Parse once, at startup (this file runs when first imported).
// safeParse doesn't throw, so we can print a clean message before exiting.
const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  console.error(z.prettifyError(result.error));
  // Fail fast: a crash at startup beats a crash in the middle of a request.
  process.exit(1);
}

// The rest of the app imports this — never process.env directly.
export const env: Env = result.data;
