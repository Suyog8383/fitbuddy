import { Router } from 'express';
import { prisma } from '../db.ts';
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
    res.status(201).json(user);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Reveals that the email is registered (enumeration) — accepted
      // for now; 3D (email verification) can hide it.
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

export default router;
