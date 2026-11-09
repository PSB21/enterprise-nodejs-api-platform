import { z } from 'zod';

import { Role } from '../../generated/prisma/enums';
import { paginationSchema } from '../../lib/pagination';

export const listUsersQuery = paginationSchema.extend({ role: z.enum(Role).optional() });
export const userIdParams = z.object({ id: z.uuid() });
export const changeRoleBody = z.object({ role: z.enum(Role) });
