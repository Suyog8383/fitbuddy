import { Router } from 'express';
import { prisma } from '../db.ts';
import type { z } from 'zod';
import { ErrorCode, HttpError, parse } from '../lib/http.ts';
import { toAdminUserResponse } from '../lib/userResponse.ts';
import { isValidId } from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';
import { requireRole } from '../middleware/requireRole.ts';
import type { StatsResponse } from '../schemas/responses.ts';
import { AdminUpdateUserBody, AdminUsersQuery } from '../schemas/users.ts';

// Mounted at /api/v1/admin. The guard is on the ROUTER, not on each route:
// a route added here next year is admin-only without anyone remembering.
const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

// Hard cap until real pagination (Phase 11).
const LIST_LIMIT = 50;

const userNotFound = () =>
  new HttpError(404, ErrorCode.USER_NOT_FOUND, 'User not found');

// GET /admin/users?email=part  -> newest first, max 50
router.get('/users', async (req, res) => {
  const { email } = parse(AdminUsersQuery, req.query);

  const users = await prisma.user.findMany({
    // ILIKE '%part%' — case-insensitive "contains". No email -> all users.
    where: email ? { email: { contains: email, mode: 'insensitive' } } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: LIST_LIMIT,
  });

  res.json(users.map(toAdminUserResponse));
});

// GET /admin/users/:id
router.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) throw userNotFound();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw userNotFound();

  res.json(toAdminUserResponse(user));
});

// PATCH /admin/users/:id   body: { role?, disabled? }
router.patch('/users/:id', async (req, res) => {
  const adminId = authUser(req).id;
  const { id } = req.params;
  if (!isValidId(id)) throw userNotFound();

  // Lockout rule: the last admin demoting or disabling themselves would
  // leave nobody able to fix it without DB access.
  if (id === adminId) {
    throw new HttpError(
      400,
      ErrorCode.CANNOT_CHANGE_OWN_ACCOUNT,
      "You can't change your own account here",
    );
  }

  const changes = parse(AdminUpdateUserBody, req.body);

  // Callback form: the update depends on what we read first.
  const user = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id } });
    if (!target) throw userNotFound(); // throw = rollback, then 404

    if (changes.disabled) {
      // Disabled must mean logged out everywhere, not "still in for 30 days".
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return tx.user.update({
      where: { id },
      data: {
        role: changes.role, // undefined = unchanged
        disabledAt:
          changes.disabled === undefined
            ? undefined
            : changes.disabled
              ? (target.disabledAt ?? new Date()) // keep the original date
              : null,
      },
    });
  });

  // Audit trail: who changed what for whom. Ids only, no emails/names.
  // (A real audit table comes in Phase 14.)
  req.log.info({ adminId, targetUserId: id, changes }, 'admin updated user');

  res.json(toAdminUserResponse(user));
});

// GET /admin/stats
router.get('/stats', async (_req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Independent counts -> run them at the same time. Total wait ≈ the
  // slowest query, not the sum. (Slightly different moments per count —
  // fine for a dashboard.)
  const [users, workouts, newUsersLast7Days] = await Promise.all([
    prisma.user.count(),
    prisma.workout.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
  ]);

  const stats: z.infer<typeof StatsResponse> = {
    users,
    workouts,
    newUsersLast7Days,
  };
  res.json(stats);
});

export default router;
