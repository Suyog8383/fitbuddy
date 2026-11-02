// App config from EXPO_PUBLIC_* env vars (mobile/.env.local).
// They're inlined at bundle time, so:
// - read them with plain dot access: process.env.EXPO_PUBLIC_X
//   (destructuring or process.env[name] is NOT inlined -> undefined)
// - after changing .env.local, fully reload the app
// - they ship inside the app in plain text: never a secret here

function readApiUrl(): string {
  const value = process.env.EXPO_PUBLIC_API_URL;

  // Fail loudly at startup, like the server's env.ts — a missing URL would
  // otherwise show up as 'network error' on every single screen.
  if (!value) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set. Copy mobile/.env.example to .env.local.',
    );
  }
  try {
    new URL(value);
  } catch {
    throw new Error(`EXPO_PUBLIC_API_URL is not a valid URL: ${value}`);
  }

  // 'http://x:3000/' -> 'http://x:3000': paths already start with '/'.
  return value.replace(/\/+$/, '');
}

export const config = {
  apiUrl: readApiUrl(),
  // Mobile networks can hang with no answer; fetch waits forever by default.
  requestTimeoutMs: 15_000,
};
