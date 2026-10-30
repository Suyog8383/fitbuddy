import bcrypt from 'bcrypt';

// Cost factor: 2^12 rounds, ~250 ms per hash. Each +1 doubles the time.
// Raise it as hardware gets faster — old hashes keep working, because the
// cost is stored inside each hash string.
const COST = 12;

export const PASSWORD_MIN_CHARS = 8;
// bcrypt silently ignores everything after 72 BYTES (not characters —
// emoji and non-English letters take 2-4 bytes each). Reject longer
// passwords instead of truncating them without telling the user.
export const PASSWORD_MAX_BYTES = 72;

// bcrypt generates a random salt and stores it inside the returned string:
// "$2b$12$<22-char salt><31-char hash>". Async: runs on a worker thread,
// so the ~250 ms doesn't block other requests.
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

// A real hash of a throwaway password, made once at startup (top-level
// await works in ES modules). Login compares against it when the email
// doesn't exist, so "no such user" takes as long as "wrong password" —
// response time can't reveal which emails are registered.
export const DUMMY_HASH = await hashPassword('dummy-password-for-timing');

// Hashes the attempt with the salt + cost read from `hash`, then compares
// in constant time. Never compare hashes yourself with ===.
export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
