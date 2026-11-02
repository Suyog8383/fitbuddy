import { z } from 'zod';

// The shape our config must have. One place to see every env var the app uses.
// Exported so tests can check the rules without exiting the process.
export const EnvSchema = z
  .object({
    // Only the 3 standard values. Vitest sets 'test' automatically.
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    // process.env values are strings -> coerce "3000" into 3000.
    // Safe, non-secret -> OK to have a default.
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    APP_NAME: z.string().min(1).default('FitBuddy'),

    // WHICH deployment this is. NODE_ENV says HOW the code runs (prod mode =
    // fast, safe); a dev server runs NODE_ENV=production + APP_ENV=dev.
    // Use APP_ENV for "dev-only" features (API docs), not NODE_ENV.
    APP_ENV: z.enum(['local', 'dev', 'prod']).default('local'),

    // How many proxies sit in front of us (Caddy = 1). Express then reads
    // the real client IP from X-Forwarded-For. 0 = trust nobody (local):
    // anyone can fake that header, so only trust proxies we really run.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

    // Optional override. If unset, logger.ts picks a default per NODE_ENV.
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),

    // Secret -> NO default, so a missing one fails startup.
    // Must be a postgres:// or postgresql:// URL.
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    // Signs access tokens. Anyone with it can forge a login for any user.
    // Secret -> no default. 32+ chars so it can't be brute-forced offline.
    JWT_SECRET: z.string().min(32),

    // Resend API key. Secret -> no default. Optional in dev: without it,
    // emails are printed to the console instead (src/lib/email.ts).
    RESEND_API_KEY: z.string().min(1).optional(),

    // Sender address. Not secret -> default. onboarding@resend.dev works
    // without your own domain, but only delivers to your Resend account email.
    EMAIL_FROM: z.string().min(1).default('FitBuddy <onboarding@resend.dev>'),
  })
  // Rules across several fields go on the whole object.
  // Production must send real email — never fall back to the console.
  .refine((e) => e.NODE_ENV !== 'production' || e.RESEND_API_KEY, {
    message: 'RESEND_API_KEY is required in production',
    path: ['RESEND_API_KEY'],
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
