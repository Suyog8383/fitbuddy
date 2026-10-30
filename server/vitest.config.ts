import { defineConfig } from 'vitest/config';

// Tests must never touch dev data. Use the same Postgres server,
// but a separate database: fitbuddy -> fitbuddy_test.
try {
  process.loadEnvFile('.env');
} catch {
  // CI: no .env file, DATABASE_URL comes from the environment
}

const testDbUrl = new URL(process.env.DATABASE_URL ?? '');
testDbUrl.pathname = '/fitbuddy_test';

// Set it here too: `test.env` only reaches test files, but globalSetup
// runs in this process and needs the test URL as well.
process.env.DATABASE_URL = testDbUrl.toString();

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: testDbUrl.toString(),
      // Fixed test-only secret: tests never depend on (or see) the real one.
      JWT_SECRET: 'test-only-secret-not-used-anywhere-else',
    },
    // Runs once before all tests: create test DB + apply migrations.
    globalSetup: ['./src/test/globalSetup.ts'],
    // Runs before each test file: helpers like cleaning tables.
    setupFiles: ['./src/test/setup.ts'],
    // Test files share one database -> run them one at a time,
    // so one file's cleanup can't delete another file's rows mid-test.
    fileParallelism: false,
  },
});
