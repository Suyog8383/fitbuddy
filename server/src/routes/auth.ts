import { Router } from 'express';
import { prisma } from '../db.ts';
import { EmailCodePurpose } from '../generated/prisma/client.ts';
import { CODE_TTL_MINUTES, consumeCode, issueCode } from '../lib/emailCodes.ts';
import { sendEmail } from '../lib/email.ts';
import {
  DUMMY_HASH,
  hashPassword,
  isValidPassword,
  verifyPassword,
} from '../lib/password.ts';
import {
  hashRefreshToken,
  issueRefreshToken,
  revokeFamily,
  rotateRefreshToken,
} from '../lib/refreshTokens.ts';
import { signAccessToken } from '../lib/tokens.ts';
import {
  isUniqueViolation,
  isValidEmail,
  isValidName,
} from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';

const router = Router();

// One email template per purpose. `satisfies` makes TypeScript check that
// every EmailCodePurpose has an entry — add a purpose, forget it here,
// and typecheck fails.
const CODE_EMAILS = {
  EMAIL_VERIFICATION: {
    subject: 'Verify your FitBuddy email',
    intro: 'Your verification code is',
  },
  PASSWORD_RESET: {
    subject: 'Reset your FitBuddy password',
    intro: 'Your password reset code is',
  },
} satisfies Record<EmailCodePurpose, { subject: string; intro: string }>;

// Issues a new code (old one dies) and emails it. Throws if sending fails —
// the caller decides what a failed send means for its response.
async function sendCodeEmail(
  user: { id: string; email: string },
  purpose: EmailCodePurpose,
): Promise<void> {
  const code = await issueCode(user.id, purpose);
  const { subject, intro } = CODE_EMAILS[purpose];
  await sendEmail({
    to: user.email,
    subject,
    text:
      `${intro} ${code}. It expires in ${CODE_TTL_MINUTES} minutes.\n\n` +
      `If you didn't ask for this, you can ignore this email.`,
  });
}

// Exactly 6 digits, as a string ("000042" keeps its zeros; a number wouldn't).
const isCodeFormat = (code: unknown): code is string =>
  typeof code === 'string' && /^\d{6}$/.test(code);
const invalidCode = { error: 'Invalid or expired code' };

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  const { email, name, password } = req.body ?? {};

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'email must be a valid email address' });
    return;
  }
  if (!isValidName(name)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (!isValidPassword(password)) {
    res.status(400).json({
      error: 'password must be at least 8 characters and at most 72 bytes',
    });
    return;
  }

  // Note: no trim on the password — spaces are valid characters in it.
  const passwordHash = await hashPassword(password);

  // Let the UNIQUE constraint catch duplicate emails (P2002), no check first.
  try {
    // The returned user has no passwordHash (omitted by default, db.ts).
    const user = await prisma.user.create({
      data: {
        // Lowercase: "Suyog@Mail.com" and "suyog@mail.com" are one inbox.
        email: email.trim().toLowerCase(),
        name: name.trim(),
        passwordHash,
      },
    });

    // The account exists even if the email fails: log it and still answer
    // 201. The app shows "verify your email" with a "resend code" button.
    // Own try/catch, so a send error never reaches the P2002 check below.
    try {
      await sendCodeEmail(user, EmailCodePurpose.EMAIL_VERIFICATION);
    } catch (err) {
      req.log.error({ err }, 'verification email failed');
    }

    res.status(201).json(user);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Reveals that the email is registered (enumeration) — accepted:
      // forgot-password (the endpoint attackers probe) hides it, and
      // rate limiting (Phase 11) slows bulk probing.
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    throw err;
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  // Only check the shape here. No length rules: a login must accept
  // whatever was valid at register time, even if the rules change later.
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  // The one place that asks for the hidden hash.
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    omit: { passwordHash: false },
  });

  // ALWAYS run bcrypt, even with no user — skipping it would answer
  // in ~2 ms instead of ~250 ms and reveal the email isn't registered.
  const passwordOk = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  if (!user || !passwordOk) {
    // One message for both cases: never say which part was wrong.
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // We asked for the hash, so strip it ourselves before responding.
  const { passwordHash, ...safeUser } = user;

  // The app stores both in expo-secure-store.
  // accessToken: sent on every request (`Authorization: Bearer ...`), 15 min.
  // refreshToken: sent ONLY to /auth/refresh and /auth/logout, 30 days.
  // Each login starts a new token family (one per device/session).
  const accessToken = await signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);
  res.json({ user: safeUser, accessToken, refreshToken });
});

// POST /api/v1/auth/refresh
// Access token expired -> the app trades its refresh token for a new pair.
// No requireAuth: the access token is expired, that's why we're here.
router.post('/refresh', async (req, res) => {
  // In the body, not a header: request bodies are never logged (app.ts).
  const { refreshToken } = req.body ?? {};

  if (typeof refreshToken !== 'string' || refreshToken === '') {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  const result = await rotateRefreshToken(refreshToken);

  if (!result.ok) {
    // Reuse = a copy of the token exists somewhere = likely theft. Worth a
    // warning in the logs. Never log the token itself.
    if (result.reason === 'reused') {
      req.log.warn('refresh token reuse detected, family revoked');
    } else {
      req.log.debug({ reason: result.reason }, 'refresh rejected');
    }
    // One answer for every failure: the client just logs the user out.
    res.status(401).json({ error: 'Invalid refresh token' });
    return;
  }

  // The OLD refresh token is now dead: the app must save the new one.
  const accessToken = await signAccessToken(result.userId);
  res.json({ accessToken, refreshToken: result.refreshToken });
});

// POST /api/v1/auth/logout
// Logs out THIS device: revokes the refresh token's whole family, so no
// token from this login (current or older) can be refreshed again.
// No requireAuth: the access token may already be expired — logout must
// still work. The refresh token itself proves which session to end.
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body ?? {};

  if (typeof refreshToken !== 'string' || refreshToken === '') {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
  });
  if (row) await revokeFamily(row.familyId);

  // Always 204, even for an unknown or already-revoked token: logout never
  // reveals whether a token was valid, and the app clears its storage anyway.
  // The access token stays valid until it expires (max 15 min) — the app
  // deletes it from secure-store.
  res.status(204).send();
});

// POST /api/v1/auth/logout-all
// "Log out everywhere": revokes every refresh token of the user, on every
// device. Needs a valid access token: we must know WHO, and only the
// account owner may do this.
router.post('/logout-all', requireAuth, async (req, res) => {
  const userId = authUser(req).id;

  // One UPDATE ... WHERE user_id = $1 (uses the @@index([userId])).
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  res.status(204).send();
});

// POST /api/v1/auth/verify-email   body: { code }
// Logged in: the access token says WHO, the code proves they own the inbox.
router.post('/verify-email', requireAuth, async (req, res) => {
  const userId = authUser(req).id;
  const { code } = req.body ?? {};

  if (!isCodeFormat(code)) {
    res.status(400).json({ error: 'code must be 6 digits' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    // Valid token, deleted account (see users.ts).
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Idempotent: verifying twice is not an error, there's just nothing to do.
  if (user.emailVerifiedAt) {
    res.status(204).send();
    return;
  }

  // Code used + user verified: both or neither. A crash in between can't
  // burn the code without verifying the email.
  // `false` doesn't throw, so the spent attempt is still committed.
  const verified = await prisma.$transaction(async (tx) => {
    const ok = await consumeCode(
      userId,
      EmailCodePurpose.EMAIL_VERIFICATION,
      code,
      tx,
    );
    if (ok) {
      await tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
    }
    return ok;
  });

  if (!verified) {
    // Wrong, expired, used, out of attempts — one answer for all.
    res.status(400).json(invalidCode);
    return;
  }

  res.status(204).send();
});

// POST /api/v1/auth/resend-verification
// "Didn't get the email?" -> new code; the old one stops working.
// (Spamming this = many emails. Rate limiting comes in Phase 11.)
router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: authUser(req).id },
  });
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.emailVerifiedAt) {
    res.status(204).send(); // already verified: send nothing
    return;
  }

  try {
    await sendCodeEmail(user, EmailCodePurpose.EMAIL_VERIFICATION);
  } catch (err) {
    // The user explicitly asked for an email: say honestly it didn't go.
    // 503 = temporary, try again later.
    req.log.error({ err }, 'verification email failed');
    res.status(503).json({ error: 'Could not send email, try again later' });
    return;
  }

  res.status(204).send();
});

// POST /api/v1/auth/forgot-password   body: { email }
// Not logged in (that's the point). Emails a reset code IF the account
// exists — and the response never says whether it does.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body ?? {};

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'email must be a valid email address' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (user) {
    // NO await: sending takes ~300 ms, "no user" takes ~2 ms. Awaiting
    // would let response time reveal which emails are registered.
    // Fire and forget — but always catch, or a failed send becomes an
    // unhandled rejection that can crash Node.
    sendCodeEmail(user, EmailCodePurpose.PASSWORD_RESET).catch((err) => {
      req.log.error({ err }, 'password reset email failed');
    });
  }

  // Same answer for both cases (enumeration).
  res.status(204).send();
});

// POST /api/v1/auth/reset-password   body: { email, code, newPassword }
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body ?? {};

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'email must be a valid email address' });
    return;
  }
  if (!isCodeFormat(code)) {
    res.status(400).json({ error: 'code must be 6 digits' });
    return;
  }
  // Same rules as register — a reset must not allow a weaker password.
  if (!isValidPassword(newPassword)) {
    res.status(400).json({
      error: 'newPassword must be at least 8 characters and at most 72 bytes',
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) {
    // Same answer as a wrong code: never reveal the email isn't registered.
    res.status(400).json(invalidCode);
    return;
  }

  // Hash BEFORE the transaction: bcrypt takes ~250 ms, and a transaction
  // should stay short (it holds row locks while open).
  const passwordHash = await hashPassword(newPassword);

  // All or nothing: code used + new password + sessions revoked.
  // A half-done reset (password changed, attacker's sessions still alive)
  // is exactly what this must prevent.
  const reset = await prisma.$transaction(async (tx) => {
    const ok = await consumeCode(
      user.id,
      EmailCodePurpose.PASSWORD_RESET,
      code,
      tx,
    );
    if (!ok) return false; // spent attempt still commits (no throw)

    const now = new Date();
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // The code came from their inbox -> that proves ownership too.
        // Keep the original date if already verified.
        emailVerifiedAt: user.emailVerifiedAt ?? now,
      },
    });
    // Log out every device: whoever was in the account before the reset
    // (maybe the reason for it) loses access.
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });

  if (!reset) {
    res.status(400).json(invalidCode);
    return;
  }

  // No auto-login: the app sends the user to the login screen.
  res.status(204).send();
});

export default router;
