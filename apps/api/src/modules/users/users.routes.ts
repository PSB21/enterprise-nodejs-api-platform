import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { AppError } from '../../errors/app-error';
import { Role } from '../../generated/prisma/enums';
import { pageMeta, paginationSchema, toSkip } from '../../lib/pagination';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { revokeAllForUser } from '../auth/refresh-token';
import { toPublicUser } from './user.dto';

export const usersRouter = Router();

// Every route below is for admins only.
usersRouter.use(authenticate, authorize('ADMIN'));

const listQuery = paginationSchema.extend({ role: z.enum(Role).optional() });
const idParams = z.object({ id: z.uuid() });
const roleBody = z.object({ role: z.enum(Role) });

usersRouter.get('/', async (req, res) => {
  const query = listQuery.parse(req.query);
  const where = query.role ? { role: query.role } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(query),
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ success: true, data: users.map(toPublicUser), meta: pageMeta(query, total) });
});

usersRouter.patch('/:id/role', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { role } = roleBody.parse(req.body);

  // Stops an admin from demoting themselves and leaving nobody able to manage roles.
  if (id === req.user!.id) {
    throw new AppError(400, 'CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  const user = await prisma.user.update({ where: { id }, data: { role } });

  // Access tokens carry the role. Ending the user's sessions means the new role applies at
  // their next login, within 15 minutes at most, instead of whenever their session ends.
  if (existing.role !== role) {
    await revokeAllForUser(id);
  }

  res.json({ success: true, data: { user: toPublicUser(user) } });
});
