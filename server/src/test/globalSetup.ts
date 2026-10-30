import { execSync } from 'node:child_process';
import pg from 'pg';

// Runs ONCE before the whole test run (not per file).
export default async function globalSetup() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const dbName = url.pathname.slice(1); // '/fitbuddy_test' -> 'fitbuddy_test'

  // 1. Create the test database if it doesn't exist yet.
  //    Connect to the default 'postgres' DB to do it.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );
  if (rowCount === 0) {
    // Identifiers can't be $1 parameters; dbName comes from our own config.
    await client.query(`CREATE DATABASE "${dbName}"`);
  }
  await client.end();

  // 2. Apply migrations — same command prod uses (never `migrate dev` here).
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'ignore',
  });
}
