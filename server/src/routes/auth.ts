import { Router } from 'express';
import { prisma } from '../db.ts';
import { EmailCodePurpose } from '../generated/prisma/client.ts';
import { CODE_TTL_MINUTES, consumeCode, issueCode } from '../lib/emailCodes.ts';
import { sendEmail } from '../lib/email.ts';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password.ts';
import {
  hashRefreshToken,
  issueRefreshToken,
  revokeFamily,
  rotateRefreshToken,
} from '../lib/refreshTokens.ts';
import { HttpError, parse } from '../lib/http.ts';
import { signAccessToken } from '../lib/tokens.ts';
import { isUniqueViolation } from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';
import {
  ForgotPasswordBody,
  LoginBody,
  RefreshBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '../schemas/auth.ts';

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

// Wrong, expired, used, out of attempts, unknown email — one answer for all.
const invalidCode = () => new HttpError(400, 'Invalid or expired code');
const unauthorized = () => new HttpError(401, 'Unauthorized');

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  // Typed + cleaned (trimmed, email lowercased, unknown keys dropped).
  // Invalid -> throws -> 400 with every bad field (errorHandler).
  const { email, name, password } = parse(RegisterBody, req.body);

  const passwordHash = await hashPassword(password);

  // Let the UNIQUE constraint catch duplicate emails (P2002), no check first.
  // The returned user has no passwordHash (omitted by default, db.ts).
  const user = await prisma.user
    .create({ data: { email, name, passwordHash } })
    .catch((err) => {
      if (isUniqueViolation(err)) {
        // Reveals that the email is registered (enumeration) — accepted:
        // forgot-password (the endpoint attackers probe) hides it, and
        // rate limiting (Phase 11) slows bulk probing.
        throw new HttpError(409, 'Email already in use');
      }
      throw err; // anything else is a bug -> 500
    });

  // The account exists even if the email fails: log it and still answer
  // 201. The app shows "verify your email" with a "resend code" button.
  try {
    await sendCodeEmail(user, EmailCodePurpose.EMAIL_VERIFICATION);
  } catch (err) {
    req.log.error({ err }, 'verification email failed');
  }

  res.status(201).json(user);
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = parse(LoginBody, req.body);

  // The one place that asks for the hidden hash.
  const user = await prisma.user.findUnique({
    where: { email },
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
    throw new HttpError(401, 'Invalid email or password');
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
  const { refreshToken } = parse(RefreshBody, req.body);

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
    throw new HttpError(401, 'Invalid refresh token');
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
  const { refreshToken } = parse(RefreshBody, req.body);

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
  const { code } = parse(VerifyEmailBody, req.body);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // Valid token, deleted account (see users.ts).
  if (!user) throw unauthorized();
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

  if (!verified) throw invalidCode();

  res.status(204).send();
});

// POST /api/v1/auth/resend-verification
// "Didn't get the email?" -> new code; the old one stops working.
// (Spamming this = many emails. Rate limiting comes in Phase 11.)
router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: authUser(req).id },
  });
  if (!user) throw unauthorized();
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
    throw new HttpError(503, 'Could not send email, try again later');
  }

  res.status(204).send();
});

// POST /api/v1/auth/forgot-password   body: { email }
// Not logged in (that's the point). Emails a reset code IF the account
// exists — and the response never says whether it does.
router.post('/forgot-password', async (req, res) => {
  // Email arrives trimmed + lowercased (schema).
  const { email } = parse(ForgotPasswordBody, req.body);

  const user = await prisma.user.findUnique({ where: { email } });

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
  const { email, code, newPassword } = parse(ResetPasswordBody, req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  // Same answer as a wrong code: never reveal the email isn't registered.
  if (!user) throw invalidCode();

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

  if (!reset) throw invalidCode();

  // No auto-login: the app sends the user to the login screen.
  res.status(204).send();
});

export default router;
