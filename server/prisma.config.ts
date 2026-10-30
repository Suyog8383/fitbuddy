import { defineConfig, env } from 'prisma/config';

// The Prisma CLI (migrate, generate, studio) doesn't load .env by itself.
// Load it locally; in CI/prod there's no .env file — vars come from the host.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file -> use the real environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
